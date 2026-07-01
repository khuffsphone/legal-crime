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

import os
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


def rgb_to_hex(r, g, b):
    return "#%02X%02X%02X" % (max(0, min(255, int(r * 255))), max(0, min(255, int(g * 255))), max(0, min(255, int(b * 255))))


def material_base_hex(mat, default="#8A8A8A"):
    """Best-effort base colour of a material as a hex string, for building the toon variant. Reads a stored
    __base_hex__ (blockout) first, then a Principled BSDF Base Color, else the default gray."""
    if mat is None:
        return default
    stored = mat.get("__base_hex__")
    if stored:
        return stored
    try:
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    c = n.inputs["Base Color"].default_value
                    return rgb_to_hex(c[0], c[1], c[2])
        elif mat.diffuse_color:
            c = mat.diffuse_color
            return rgb_to_hex(c[0], c[1], c[2])
    except Exception:
        pass
    return default


def clear_scene():
    """Remove ALL objects (the default startup Cube + Light + Camera, and anything stale) so ONLY what we
    build/import is visible to the camera. The blockout path clears via its own _reset_scene(); the FBX path
    needs this so the default Cube doesn't render around the character's legs (the framing bug)."""
    if bpy is None:
        return
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


# An action whose NAME carries one of these tokens is a contaminating export artefact — the baked
# "...|baselayer" layer Mixamo/Meshy ships ALONGSIDE the real clip (e.g.
# 'Armature|...|Right_Upper_Hook_from_Guard|baselayer'), NOT the clip we want to render. The importer
# drops these so a stray pose can't hijack the render. Kept in sync with inspect_fbx.py.
# NB: ONLY 'baselayer' — do NOT add 'guard'/'hook'. Legit combat clips are literally named with those words
# (e.g. 'Boxing_Guard_Prep_Straight_Punch', 'Right_Upper_Hook'); matching them would drop the REAL attack clip.
CONTAMINANT_TOKENS = ("baselayer",)


def _is_contaminant_action(name):
    low = (name or "").lower()  # case-insensitive: catches 'BaseLayer', '|baselayer', 'BASELAYER' alike
    return any(tok in low for tok in CONTAMINANT_TOKENS)  # tokens MUST stay lowercase for this to hold


def select_clip_action(candidates, name_hint="", action_hint=None):
    """Pick the INTENDED clip action from the actions imported with one FBX.
    A SINGLE-action file is unambiguous — use it as-is (a per-clip Meshy export names its one real action
    '<Clip>|baselayer', so contaminant-filtering must NOT apply here or it would drop the real clip). Only when
    a file ships MULTIPLE actions is the '|baselayer' artefact a contaminant to drop (the Mixamo case: a junk
    'Right_Upper_Hook_from_Guard|baselayer' beside the real 'mixamo.com|Layer0').
    Order for multi-action: explicit action_hint (exact, then substring) -> drop baselayers -> 'mixamo.com|Layer0'
    -> keyword name_hint -> first non-contaminant -> first overall. Returns (action, reason)."""
    cands = [a for a in candidates if a is not None]
    if not cands:
        return None, "no actions in file"
    if len(cands) == 1:
        return cands[0], "only action in file"  # single-clip export: unambiguous, no filtering
    clean = [a for a in cands if not _is_contaminant_action(a.name)]
    if action_hint:
        h = action_hint.lower()
        pool = clean or cands
        for a in pool:
            if a.name == action_hint:
                return a, "job actionName exact %r" % action_hint
        for a in pool:
            if h in a.name.lower():
                return a, "job actionName substring %r" % action_hint
    for a in clean:
        if "mixamo.com|layer0" in a.name.lower():
            return a, "mixamo.com|Layer0 clip layer"
    if name_hint:
        nh = name_hint.lower()
        for a in clean:
            if nh in a.name.lower():
                return a, "keyword %r match" % name_hint
    if clean:
        return clean[0], "first non-contaminant"
    return cands[0], "ALL actions look contaminated — using first (REVIEW)"


def assign_action(arm, action):
    """Assign an action to the armature, binding a slot on slotted (Blender 4.4+/5.1 'Baklava') actions so it
    actually drives the rig; legacy actions need only the .action assignment. Version-safe; never raises."""
    if bpy is None or arm is None or action is None:
        return
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = action
    slots = getattr(action, "slots", None)
    if slots and hasattr(ad, "action_slot"):
        try:
            if ad.action_slot is None:
                ad.action_slot = slots[0]
        except Exception:
            pass


def _import_scene_objects(filepath):
    """Run the right Blender importer for the file EXTENSION and return (new_objects, new_actions).
    .glb/.gltf -> import_scene.gltf (textured Meshy exports); anything else -> import_scene.fbx (Mixamo).
    Only the objects/actions that DIDN'T exist before the call are returned, so a multi-clip import stays
    isolated per file."""
    ext = os.path.splitext(filepath)[1].lower()
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    if ext in (".glb", ".gltf"):
        # glTF carries the PBR material + base-color texture the FBX pipeline lost; defaults import the
        # skinned mesh + armature + its baked action. (No automatic_bone_orientation knob on the gltf op.)
        bpy.ops.import_scene.gltf(filepath=filepath)
    else:
        bpy.ops.import_scene.fbx(filepath=filepath, automatic_bone_orientation=True, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    return new, new_actions


def import_unit(filepath, name_hint="", action_hint=None):
    """Import ONE animation clip (FBX or GLB — dispatched by extension) and return (pivot, armature, meshes,
    action). The armature + any unparented meshes are parented (keeping world transform) under a fresh Empty at
    the WORLD ORIGIN so the whole clip can be yaw-rotated as ONE for the 8 facings. Absolute scale is
    irrelevant downstream — the shared bbox pre-pass normalises every clip to the same ortho_scale.
    CHARACTER MESH ONLY: a Meshy GLB ships a stray un-skinned 'Icosphere' (and FBX can bake a pedestal) beside
    the real body — we keep only the mesh(es) SKINNED to this armature and DELETE the rest so junk neither
    renders into the sprite nor inflates the framing bbox. Robust fallback: if skin-detection finds nothing
    (importer quirk), keep the single HIGHEST-vertex mesh (the body) and drop the rest — the Icosphere (42
    verts) can never survive that against char1 (~99k). When the file ships MULTIPLE actions the baselayer
    artefact is dropped (select_clip_action); a single-action file is used as-is. action_hint = per-job override."""
    if bpy is None:
        raise SystemExit("RENDER_FAIL: bpy unavailable")
    if not os.path.isfile(filepath):
        raise SystemExit("RENDER_FAIL: model not found: %r" % filepath)
    new, new_actions = _import_scene_objects(filepath)
    arm = next((o for o in new if o.type == "ARMATURE"), None)
    meshes = [o for o in new if o.type == "MESH"]
    if arm is None:
        raise SystemExit("RENDER_FAIL: no ARMATURE in %r" % filepath)
    if not meshes:
        raise SystemExit("RENDER_FAIL: no MESH in %r" % filepath)

    def _skinned(m):
        return any(md.type == "ARMATURE" and md.object == arm for md in m.modifiers)
    char = [m for m in meshes if _skinned(m)]
    if not char:
        # skin-modifier detection came up empty (some glTF rigs bind via parenting) — keep the biggest mesh.
        biggest = max(meshes, key=lambda m: len(m.data.vertices))
        print("CHAR-MESH fallback: no skinned mesh detected; keeping highest-vert mesh %r (verts=%d)"
              % (biggest.name, len(biggest.data.vertices)))
        char = [biggest]
    for m in [m for m in meshes if m not in char]:
        print("DROP non-character mesh from import: %r (verts=%d, not skinned)" % (m.name, len(m.data.vertices)))
        bpy.data.objects.remove(m, do_unlink=True)
    meshes = char

    # SELECT the intended clip action; DROP a contaminating baselayer only when >1 action ships.
    assigned = arm.animation_data.action if (arm.animation_data and arm.animation_data.action) else None
    cand_actions = new_actions or ([assigned] if assigned else [])
    action, why = select_clip_action(cand_actions, name_hint, action_hint)
    print("ACTION_PICK file=%s -> %r (%s); candidates=%s"
          % (os.path.basename(filepath), (action.name if action else None), why, [a.name for a in cand_actions]))
    if action is not None:
        assign_action(arm, action)
    piv = bpy.data.objects.new("piv_" + (name_hint or arm.name), None)
    bpy.context.collection.objects.link(piv)
    for o in [arm] + [m for m in meshes if m.parent is None]:
        wm = o.matrix_world.copy()
        o.parent = piv
        o.matrix_world = wm  # keep world transform when re-parenting
    return piv, arm, meshes, action


# Back-compat alias: the FBX pipeline entry callers used before GLB support (dispatch is by extension now).
import_fbx_unit = import_unit


def downscale_oversized_textures(meshes, max_size=1024):
    """A Meshy base-colour texture is 4096x4096 — wildly oversized for a ~30px sprite. Scale every image
    datablock used by these meshes' materials down to <= max_size (in place, mip-friendly) so EEVEE doesn't
    blow memory or over-sharpen the downsample. Idempotent + version-safe; logs each scale. Returns the count
    scaled. A no-op if max_size<=0 (keep native)."""
    if bpy is None or max_size <= 0:
        return 0
    seen = set()
    scaled = 0
    for mesh in meshes:
        for slot in mesh.material_slots:
            mat = slot.material
            if mat is None or not mat.use_nodes:
                continue
            for node in mat.node_tree.nodes:
                img = getattr(node, "image", None)
                if img is None or img.name in seen:
                    continue
                seen.add(img.name)
                w, h = (img.size[0], img.size[1]) if len(img.size) >= 2 else (0, 0)
                if w > max_size or h > max_size:
                    nw = min(w, max_size) if w else max_size
                    nh = min(h, max_size) if h else max_size
                    try:
                        img.scale(nw, nh)
                        scaled += 1
                        print("TEXTURE downscaled %r %dx%d -> %dx%d (material %r)" % (img.name, w, h, nw, nh, mat.name))
                    except Exception as exc:
                        print("TEXTURE downscale skipped %r (%s)" % (img.name, exc))
    return scaled


def log_material_diagnostics(meshes):
    """Print each kept material's node wiring so a bad photoreal render is DIAGNOSABLE from the .out log
    without a screenshot: the material name, whether a base-colour IMAGE texture feeds the Principled BSDF,
    and the image resolution. (PBR-through-EEVEE is new territory — this is the breadcrumb if colour is off.)"""
    if bpy is None:
        return
    seen = set()
    for mesh in meshes:
        for slot in mesh.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            if not mat.use_nodes:
                print("MATERIAL %r: no nodes (legacy) diffuse=%s" % (mat.name, tuple(getattr(mat, "diffuse_color", ()))[:3]))
                continue
            imgs = [n.image.name + " %dx%d" % (n.image.size[0], n.image.size[1])
                    for n in mat.node_tree.nodes if getattr(n, "image", None) is not None]
            principled = any(n.type == "BSDF_PRINCIPLED" for n in mat.node_tree.nodes)
            print("MATERIAL %r: principled=%s images=%s" % (mat.name, principled, imgs or "NONE"))


# Common root/hips bone names tried first (Mixamo + a few Meshy-native variants); else the first root bone.
MIXAMO_HIPS = ("mixamorig:Hips", "mixamorig1:Hips", "Hips", "hips", "Root", "root", "pelvis", "Pelvis", "Armature|Hips")


def pick_root_bone(arm):
    """The character's root/hips pose bone — a known name if present, else the first parentless pose bone.
    Source-agnostic (Mixamo or Meshy-native rigs). Returns a PoseBone or None."""
    if arm is None or not getattr(arm, "pose", None):
        return None
    for nm in MIXAMO_HIPS:
        pb = arm.pose.bones.get(nm)
        if pb:
            return pb
    return next((b for b in arm.pose.bones if b.parent is None), None)


def center_root_world_xy(arm, piv):
    """SOURCE-AGNOSTIC In-Place strip: translate the clip's PIVOT so the character's root bone sits over world
    (0,0) in XY this frame — removing locomotion TRAVEL whether the motion lives on a hips bone, a root bone of
    any name, or the object itself (Mixamo OR Meshy-native). Vertical (Z) bob is preserved, and ortho_scale is
    untouched (we move the figure, not the zoom). Call AFTER set_frame; it runs its own depsgraph updates.
    For the blockout (piv is None) it falls back to the local-XY zero (the placeholder is baked in-place)."""
    if bpy is None:
        return
    if piv is None:
        zero_root_inplace(arm)  # blockout: no pivot to drive; zero the rig's own root XY instead
        return
    pb = pick_root_bone(arm)
    if pb is None:
        return
    deps = bpy.context.evaluated_depsgraph_get()
    z = piv.location[2]
    piv.location = (0.0, 0.0, z)              # neutralise prior offset so we measure the clip's intrinsic travel
    deps.update()
    arm_eval = arm.evaluated_get(deps)
    pbe = arm_eval.pose.bones.get(pb.name)
    if pbe is None:
        return
    world = arm_eval.matrix_world @ pbe.head  # posed root head in WORLD space (pivot rotation included)
    piv.location = (-world.x, -world.y, z)    # cancel XY travel; figure stays centred over origin
    deps.update()


def zero_root_inplace(arm):
    """In-Place safeguard: zero the hips/root bone's local X/Y translation so a clip with leftover root motion
    still renders centred (Mixamo 'In Place' export already removes it; this is belt-and-suspenders). Returns
    True if a root bone was found+zeroed. Leaves Z (vertical bob) intact."""
    if arm is None or not getattr(arm, "pose", None):
        return False
    pb = None
    for nm in MIXAMO_HIPS:
        pb = arm.pose.bones.get(nm)
        if pb:
            break
    if pb is None:
        # fall back to the first root (parentless) pose bone
        pb = next((b for b in arm.pose.bones if b.parent is None), None)
    if pb is None:
        return False
    pb.location[0] = 0.0  # zero local X
    pb.location[1] = 0.0  # zero local Y (keep [2] = vertical bob)
    return True


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
