# render_iso_common.py — shared helpers for the headless Blender -> iso sprite-sheet pipeline.
#
# THROWAWAY-FRIENDLY TOOLING (not shipped to the browser bundle). Pure-ish Blender/bpy helpers used by
# render_iso_unit.py: camera math (locked to the game's tile projection), toon/Freestyle look, lights,
# the world-space bbox pre-pass, the sprite-sheet packer, and the manifest builder.
#
# CAMERA LOCK (grounded against the live render code: src/sim/iso.ts ISO_TILE_WIDTH=128, HEIGHT=64 => 2:1):
#   A flat unit tile viewed orthographically from elevation a projects to height/width = sin(a). For a 2:1
#   tile (H/W = 0.5) => sin(a) = 0.5 => a = 30deg elevation => 60deg from top-down. So 'dimetric2to1' (60deg)
#   is the EXACT match. 'trueIso' (54.7356deg from top / 35.264 elevation, sin=0.577 => 1.73:1) does NOT match
#   our 2:1 tiles. The spec's check formula 90-atan(tileH/tileW) = 63.435deg is a coarse proxy (~3.4deg off);
#   we use it only as a sanity check, and LOCK dimetric2to1. cameraXDeg below is measured FROM TOP-DOWN
#   (a top-down camera = 0deg; horizon = 90deg), which is how the Blender rotation_euler.x is set.

import math

try:
    import bpy  # type: ignore
    from mathutils import Vector  # type: ignore
except Exception:  # allows `import render_iso_common` for non-bpy unit checks
    bpy = None
    Vector = None  # type: ignore

TRUE_ISO_X_DEG = math.degrees(math.atan(math.sqrt(2.0)))  # 54.735610317245346


def camera_x_deg(tile_w, tile_h, mode):
    """Camera tilt FROM TOP-DOWN in degrees for the given mode. See header for the geometry."""
    if mode == "dimetric2to1":
        return 60.0
    if mode == "trueIso":
        return TRUE_ISO_X_DEG
    if mode == "matchTileRatio":
        # coarse spec check formula; NOT the exact 2:1 match (gives 63.435 for 128x64)
        return 90.0 - math.degrees(math.atan(tile_h / tile_w))
    raise ValueError("unknown cameraMode: %r" % (mode,))


def camera_basis(cam_x_deg, cam_z_deg):
    """World-space right/up/forward unit vectors for an XYZ-euler camera (rx about X, 0, rz about Z).
    Derived analytically (see PR notes): right=(cosZ,sinZ,0); up=(-sinZ cosX, cosZ cosX, sinX);
    forward(view, -localZ)=(-sinX sinZ, sinX cosZ, -cosX). Orthonormal & right-handed."""
    rx = math.radians(cam_x_deg)
    rz = math.radians(cam_z_deg)
    sx, cx = math.sin(rx), math.cos(rx)
    sz, cz = math.sin(rz), math.cos(rz)
    right = Vector((cz, sz, 0.0))
    up = Vector((-sz * cx, cz * cx, sx))
    forward = Vector((-sx * sz, sx * cz, -cx))
    return right, up, forward


def setup_world_transparent(scene):
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("IsoWorld")
    scene.world.use_nodes = True


def make_camera(name="IsoCam"):
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = "ORTHO"
    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)
    return cam_obj


def orient_camera(cam_obj, cam_x_deg, cam_z_deg):
    cam_obj.rotation_euler = (math.radians(cam_x_deg), 0.0, math.radians(cam_z_deg))


def frame_camera(cam_obj, basis, bounds, frame_canvas, target_max_h, pad):
    """Lock ortho_scale + camera location so the figure fits with a top/side pad and the FEET sit on the
    bottom edge of the cell (Phaser origin 0.5,1.0 => the placement point is the foot baseline).
    `bounds` is (minR, maxR, minU, maxU) of all posed verts projected onto the camera right/up axes."""
    right, up, forward = basis
    min_r, max_r, min_u, max_u = bounds
    proj_w = max(1e-6, max_r - min_r)
    proj_h = max(1e-6, max_u - min_u)
    # height fits with a TOP pad only (feet ride the bottom); width fits with a pad on both sides.
    scale_by_h = proj_h * frame_canvas / (frame_canvas - pad)
    scale_by_w = proj_w * frame_canvas / (frame_canvas - 2 * pad)
    ortho_scale = max(scale_by_h, scale_by_w)
    cam_obj.data.ortho_scale = ortho_scale
    # camLoc in the orthonormal {right,up,forward} basis: centre horizontally on the figure; place so the
    # lowest projected point (feet) maps to the bottom edge (sU = -ortho_scale/2); push back along forward.
    a = (min_r + max_r) * 0.5            # horizontal centre
    b = min_u + ortho_scale * 0.5        # so feet (min_u) land at -ortho_scale/2
    c = 100.0                            # distance back along the view axis (ortho => zoom-invariant)
    cam_obj.location = right * a + up * b - forward * c
    # generous clip range so nothing is culled
    cam_obj.data.clip_start = 0.01
    cam_obj.data.clip_end = c * 3.0
    return ortho_scale, proj_w, proj_h


def hex_to_rgb(h):
    h = h.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (r, g, b)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_toon_material(name, base_hex, thresholds, desaturate=0.28, sepia=0.12):
    """EEVEE cel material: Diffuse -> Shader-to-RGB -> ColorRamp(constant bands) -> Emission. The bands give
    the flat hand-inked look that survives downscale. Falls back gracefully if Shader-to-RGB is missing
    (older/Cycles): a plain emission of the base colour."""
    base = list(hex_to_rgb(base_hex))
    # desaturate toward luma, then a touch of sepia warmth — keeps the noir read.
    luma = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
    base = [base[i] + (luma - base[i]) * desaturate for i in range(3)]
    base[0] = min(1.0, base[0] + sepia * 0.10)
    base[2] = max(0.0, base[2] - sepia * 0.06)
    base_lin = [_srgb_to_linear(c) for c in base]

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (*base_lin, 1.0)

    s2rgb = None
    try:
        s2rgb = nt.nodes.new("ShaderNodeShaderToRGB")  # EEVEE only
    except Exception:
        s2rgb = None

    if s2rgb is not None:
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        els = ramp.color_ramp.elements
        # three flat value bands of the base colour (shadow / mid / light)
        levels = [0.42, 0.72, 1.0]
        while len(els) < len(thresholds):
            els.new(0.5)
        for i, pos in enumerate(thresholds):
            els[i].position = max(0.0, min(1.0, pos))
            lv = levels[min(i, len(levels) - 1)]
            els[i].color = (base_lin[0] * lv, base_lin[1] * lv, base_lin[2] * lv, 1.0)
        emis = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(diff.outputs["BSDF"], s2rgb.inputs["Shader"])
        nt.links.new(s2rgb.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], emis.inputs["Color"])
        nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    else:
        emis = nt.nodes.new("ShaderNodeEmission")
        emis.inputs["Color"].default_value = (*base_lin, 1.0)
        nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    return mat


def setup_lights(scene, key=1200.0, fill=500.0, rim=220.0):
    """A fixed WORLD-space rig (the model rotates for the 8 facings, the lights do not — board coherence,
    light from upper-left/NW). Area lamps, energies are seeds."""
    def add_area(name, loc, energy, color):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = 6.0
        d.color = color
        o = bpy.data.objects.new(name, d)
        o.location = loc
        # aim at the figure centre (~z 1.0)
        direction = Vector((0.0, 0.0, 1.0)) - Vector(loc)
        o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)
        return o
    add_area("KeyNW", (-4.0, -3.0, 6.0), key, (1.0, 0.96, 0.9))   # warm key, upper-left/NW
    add_area("FillNE", (4.0, -2.0, 3.5), fill, (0.9, 0.94, 1.0))  # cooler fill, front-right
    add_area("Rim", (0.0, 5.0, 4.0), rim, (1.0, 0.98, 0.95))      # gentle back rim
    if scene.world is not None:
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[1].default_value = 0.08  # ambient strength seed


def setup_freestyle(scene, view_layer, thickness=1.75, color_hex="#1E1713"):
    scene.render.use_freestyle = True
    view_layer.use_freestyle = True
    fs = view_layer.freestyle_settings
    while len(fs.linesets) == 0:
        fs.linesets.new("iso")
    ls = fs.linesets[0]
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_edge_mark = False
    style = ls.linestyle
    style.thickness = thickness
    style.color = hex_to_rgb(color_hex)
