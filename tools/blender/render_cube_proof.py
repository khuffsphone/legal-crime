#!/usr/bin/env python
"""Phase-0 camera + scale PROOF (throwaway — NOT a committed kit asset, renders nothing that ships).

Renders a single 1x1x1 world-tile reference cube through the EXACT character camera (dimetric2to1: 60deg from
top-down, Z=45, ortho) at a LOCKED fixed ortho_scale, to prove two things before any kit piece is modelled:
  1. the top face is a perfect 2:1 diamond (spec §9-1) — confirms the projection matches the 128x64 tile;
  2. a fixed ortho_scale (world-unit -> pixel) is honoured, so 24 kit pieces rendered separately will TILE.

It reuses render_iso_common's camera math (the character ground truth), not a reimplementation.

DERIVATION (why the diamond is 2:1, and the ortho_scale for a chosen cell/tile size):
  Project a unit XY square's corners onto the camera right/up axes (see render_iso_common.camera_basis):
    right=(cos45, sin45, 0); up=(-sin45 cos60, cos45 cos60, sin60).
  A 1x1 tile spans width_r = sqrt(2) along right and height_u = sqrt(2)/2 along up -> width/height = 2.000
  (the 2:1 diamond). To make that diamond exactly tileW px in a `canvas`-px cell:
    ortho_scale = sqrt(2) * canvas / tileW      (e.g. canvas 256, tileW 128 -> 2.8284).
  px_per_worldunit = canvas / ortho_scale; one tile edge = 1 world unit. GPT-Pro is deriving the kit's px/ft
  (~8 px/ft, spec §8) which fixes feet-per-tile and thus the final locked ortho_scale — pass it via --ortho and
  reconcile against the printed EXPECTED value below.

Run (Windows PowerShell, SPLIT STREAMS):
  $ErrorActionPreference='Continue'
  & $env:BLENDER_PATH -b -P tools\\blender\\render_cube_proof.py -- --out cube_proof.png 1> cube.out 2> cube.err
  # optional: --ortho 2.8284  --canvas 256  --tile-w 128  --tile-h 64  --cube 1.0
Then eyeball cube_proof.png: top face a clean 2:1 diamond, vertical Z edges dead-vertical, RENDER_OK in cube.out.
"""
import os
import sys
import math

try:
    import bpy  # type: ignore
except Exception:
    bpy = None

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)


def _arg(name, default):
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name in a:
        i = a.index(name)
        if i + 1 < len(a):
            return a[i + 1]
    return default


def _clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def build_unit_cube(size):
    """A `size`x`size`x`size` cube sitting on the ground: base on z=0, one tile footprint at the world origin
    corner (0,0). Verts in world units — the same space the tile projection uses."""
    m = bpy.data.meshes.new("proof_cube")
    s = float(size)
    verts = [(0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0),
             (0, 0, s), (s, 0, s), (s, s, s), (0, s, s)]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    m.from_pydata(verts, [], faces)
    m.update()
    obj = bpy.data.objects.new("proof_cube", m)
    bpy.context.collection.objects.link(obj)
    return obj


def main():
    if bpy is None:
        print("render_cube_proof.py must run inside Blender: blender -b -P tools/blender/render_cube_proof.py -- --out cube.png")
        raise SystemExit(2)
    import render_iso_common as ic  # noqa: E402

    canvas = int(_arg("--canvas", 256))
    tile_w = float(_arg("--tile-w", 128))
    tile_h = float(_arg("--tile-h", 64))
    cube = float(_arg("--cube", 1.0))
    out = _arg("--out", os.path.abspath(os.path.join(_HERE, "..", "..", "cube_proof.png")))

    # EXPECTED ortho_scale for a unit-tile top face to render as a tileW-px 2:1 diamond (see header derivation).
    expected_ortho = math.sqrt(2.0) * canvas / tile_w
    ortho = float(_arg("--ortho", expected_ortho))
    print("PROOF canvas=%d tile=%.0fx%.0f cube=%.3f | EXPECTED ortho_scale(2:1 unit-tile)=%.4f | USING ortho_scale=%.4f%s"
          % (canvas, tile_w, tile_h, cube, expected_ortho, ortho,
             "" if abs(ortho - expected_ortho) < 1e-4 else "  <<DIFFERS from expected — reconcile against GPT-Pro's px/ft>>"))
    # sanity: 2:1 must hold analytically regardless of ortho_scale (scale changes size, not aspect)
    ratio = math.sqrt(2.0) / (math.sqrt(2.0) / 2.0)
    print("PROOF top-face aspect (width/height) = %.4f (must be 2.000 for a 2:1 diamond)" % ratio)

    _clear()
    scene = bpy.context.scene
    ic.setup_world_transparent(scene)
    try:
        scene.view_settings.view_transform = "Standard"
    except Exception:
        pass
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.film_transparent = True
    if _arg("--engine", "BLENDER_EEVEE") in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass

    obj = build_unit_cube(cube)
    ic.setup_lights(scene)

    cam = ic.make_camera()
    cam_x = ic.camera_x_deg(int(tile_w), int(tile_h), "dimetric2to1")  # 60.0 from top-down
    cam_z = 45.0
    ic.orient_camera(cam, cam_x, cam_z)
    scene.camera = cam
    basis = ic.camera_basis(cam_x, cam_z)

    # bbox of the cube projected onto right/up, then LOCK the fixed ortho_scale (bypass auto-fit) via frame_camera.
    right, up, _fwd = basis
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    mw = ev.matrix_world
    min_r = min_u = float("inf")
    max_r = max_u = float("-inf")
    for v in me.vertices:
        w = mw @ v.co
        r = w.dot(right)
        u = w.dot(up)
        min_r = min(min_r, r); max_r = max(max_r, r)
        min_u = min(min_u, u); max_u = max(max_u, u)
    ev.to_mesh_clear()
    ortho_scale, proj_w, proj_h = ic.frame_camera(cam, basis, (min_r, max_r, min_u, max_u),
                                                  canvas, canvas, 0, force_ortho_scale=ortho)
    print("CAM cameraXDeg=%.4f cameraZDeg=%.1f ortho_scale=%.4f projWxH=%.4fx%.4f" % (cam_x, cam_z, ortho_scale, proj_w, proj_h))

    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK cube_proof -> %s.png" % out if not out.endswith(".png") else "RENDER_OK cube_proof -> %s" % out)


if __name__ == "__main__":
    main()
