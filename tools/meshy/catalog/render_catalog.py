# render_catalog.py — headless Blender: render a FRONT + 3/4 orthographic composite thumbnail per Meshy GLB.
#
# Reuses tools/blender/render_iso_common.py (clear_scene, ORTHO camera math, per-subject framing, the NW light
# rig, oversized-texture downscale). Reads a jobs file and writes a per-task result file so the Node catalog
# tool knows what rendered. CONTINUE-ON-ERROR: one bad GLB never aborts the batch.
#
#   blender -b -P render_catalog.py -- --jobs jobs.json --result result.json --canvas 512 --engine BLENDER_EEVEE
#
# Jobs file: {"canvas":512,"engine":"BLENDER_EEVEE","jobs":[{"task_id","glb","out"}...]}  (absolute paths)
# Result file: [{"task_id","ok","reason"?}...]
#
# CATALOG THUMBNAILS keep the GLB's own PBR texture (Standard view transform) and frame each subject to fill
# its cell — this is for LABELING, not the game's cel/iso SPRITE pipeline (no toon material, no Freestyle, no
# fixed 2.8284 ortho scale). RAW lossless PNG (pngquant is banned).

import os
import sys
import json

_HERE = os.path.dirname(os.path.abspath(__file__))
# tools/meshy/catalog -> tools/blender (override with MESHY_BLENDER_DIR if the layout differs).
_BLENDER_DIR = os.environ.get("MESHY_BLENDER_DIR") or os.path.abspath(os.path.join(_HERE, "..", "..", "blender"))
for _p in (_BLENDER_DIR, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import bpy  # type: ignore  # noqa: E402
import render_iso_common as ic  # noqa: E402

try:
    import numpy as np
except Exception:  # Blender ships numpy; guard anyway
    np = None

# (name, cameraXDeg from top-down, cameraZDeg yaw). front = near eye-level straight-on; threeq = the canon
# dimetric 3/4 (60deg from top-down, 45deg yaw). NB: "front" faces the model's +Y export axis — if a subject
# was exported facing away it will read as a back view; combined with the 3/4 the labeler can still judge it.
VIEWS = (("front", 82.0, 0.0), ("threeq", 60.0, 45.0))


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def setup_scene(engine, canvas):
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.resolution_percentage = 100
    if engine == "BLENDER_EEVEE":
        try:
            scene.eevee.taa_render_samples = 24
        except Exception:
            pass
    ic.setup_world_transparent(scene)
    # true colour for a PBR texture eval (AgX/Filmic would tone-map + desaturate what the labeler judges)
    try:
        scene.view_settings.view_transform = "Standard"
    except Exception:
        pass
    scene.render.image_settings.compression = 100  # lossless PNG — NO pngquant
    return scene


def import_static(filepath):
    """Import a GLB/FBX for a STILL thumbnail (no armature/animation requirement, unlike ic.import_unit).
    Returns the list of kept mesh objects. Drops a stray low-vert junk mesh (Meshy's icosphere) when a real
    body mesh is present, so it neither renders nor inflates the framing bbox."""
    before = set(bpy.data.objects)
    ext = os.path.splitext(filepath)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=filepath)
    else:
        bpy.ops.import_scene.fbx(filepath=filepath, automatic_bone_orientation=True, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("no MESH in %s" % os.path.basename(filepath))
    max_v = max(len(m.data.vertices) for m in meshes)
    if max_v >= 500:
        keep = [m for m in meshes if len(m.data.vertices) >= 50]
        for m in [m for m in meshes if m not in keep]:
            print("DROP stray mesh %r (verts=%d)" % (m.name, len(m.data.vertices)))
            bpy.data.objects.remove(m, do_unlink=True)
        meshes = keep or meshes
    return meshes


def project_bounds(meshes, basis):
    """Project every (evaluated) vertex onto the camera right/up axes -> (minR,maxR,minU,maxU) for framing."""
    right, up, _fwd = basis
    deps = bpy.context.evaluated_depsgraph_get()
    min_r = min_u = float("inf")
    max_r = max_u = float("-inf")
    for mesh in meshes:
        ev = mesh.evaluated_get(deps)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            r = w.dot(right)
            u = w.dot(up)
            if r < min_r:
                min_r = r
            if r > max_r:
                max_r = r
            if u < min_u:
                min_u = u
            if u > max_u:
                max_u = u
        ev.to_mesh_clear()
    if min_r == float("inf"):
        raise RuntimeError("no vertices to frame")
    return (min_r, max_r, min_u, max_u)


def render_view(scene, cam, cam_x, cam_z, meshes, canvas, pad, out_base):
    ic.orient_camera(cam, cam_x, cam_z)
    scene.camera = cam
    basis = ic.camera_basis(cam_x, cam_z)
    bounds = project_bounds(meshes, basis)
    ic.frame_camera(cam, basis, bounds, canvas, canvas, pad)  # per-subject auto-fit (force_ortho_scale=None)
    scene.render.filepath = out_base
    bpy.ops.render.render(write_still=True)
    return out_base + ".png"


def composite(paths, out, gap=16):
    """Stitch the view PNGs side-by-side (bottom-aligned) into ONE RGBA PNG via bpy image pixels (no PIL).
    Mirrors the load/new/save pixel round-trip proven in render_iso_unit.py."""
    imgs = [bpy.data.images.load(p) for p in paths]
    arrs = []
    for im in imgs:
        w, h = im.size[0], im.size[1]
        arrs.append(np.array(im.pixels[:], dtype=np.float32).reshape((h, w, 4)))  # bottom-up rows
    height = max(a.shape[0] for a in arrs)
    width = sum(a.shape[1] for a in arrs) + gap * (len(arrs) - 1)
    canvas = np.zeros((height, width, 4), dtype=np.float32)  # transparent background
    x = 0
    for a in arrs:
        h, w, _ = a.shape
        canvas[0:h, x:x + w, :] = a  # row 0 == bottom, so this bottom-aligns each view
        x += w + gap
    out_img = bpy.data.images.new(os.path.basename(out), width=width, height=height, alpha=True)
    out_img.pixels = canvas.reshape(-1)
    out_img.filepath_raw = out
    out_img.file_format = "PNG"
    out_img.save()
    for im in imgs:
        bpy.data.images.remove(im)
    bpy.data.images.remove(out_img)


def render_one(job, canvas, engine, pad):
    tid = job.get("task_id")
    glb = job.get("glb")
    out = job.get("out")
    if not glb or not os.path.isfile(glb):
        raise RuntimeError("glb not found: %r" % glb)
    if not out:
        raise RuntimeError("no out path for task %r" % tid)
    ic.clear_scene()
    scene = setup_scene(engine, canvas)
    ic.setup_lights(scene)
    meshes = import_static(glb)
    ic.downscale_oversized_textures(meshes, 1024)
    cam = ic.make_camera()
    out_dir = os.path.dirname(out) or "."
    os.makedirs(out_dir, exist_ok=True)
    tmp = []
    try:
        for (name, cx, cz) in VIEWS:
            base = os.path.join(out_dir, "_tmp_%s_%s" % (tid, name))
            tmp.append(render_view(scene, cam, cx, cz, meshes, canvas, pad, base))
        composite(tmp, out)
    finally:
        for p in tmp:
            try:
                os.remove(p)
            except OSError:
                pass


def write_results(result_file, results):
    if not result_file:
        return
    try:
        with open(result_file, "w") as fh:
            json.dump(results, fh, indent=2)
    except OSError as exc:
        print("RESULT_WRITE_FAIL: %s" % exc)


def main():
    args = argv_after_dashes()
    jobs_file = get_opt(args, "--jobs")
    result_file = get_opt(args, "--result")
    canvas = int(get_opt(args, "--canvas", "512"))
    engine = get_opt(args, "--engine", "BLENDER_EEVEE")
    if not jobs_file:
        print("RENDER_FAIL: --jobs <path> required")
        sys.exit(2)
    with open(jobs_file) as fh:
        spec = json.load(fh)
    if isinstance(spec, dict):
        jobs = spec.get("jobs", [])
        canvas = int(spec.get("canvas", canvas))
        engine = spec.get("engine", engine)
    else:
        jobs = spec

    if np is None:
        write_results(result_file, [{"task_id": j.get("task_id"), "ok": False, "reason": "numpy unavailable"} for j in jobs])
        print("RENDER_FAIL: numpy unavailable (cannot composite)")
        return

    pad = max(8, canvas // 16)
    results = []
    for job in jobs:
        tid = job.get("task_id")
        try:
            render_one(job, canvas, engine, pad)
            results.append({"task_id": tid, "ok": True})
            print("RENDER_OK %s -> %s" % (tid, job.get("out")))
        except Exception as exc:  # noqa: BLE001 — one bad GLB must not kill the batch
            results.append({"task_id": tid, "ok": False, "reason": str(exc)})
            print("RENDER_FAIL %s: %s" % (tid, exc))

    write_results(result_file, results)
    print("RENDER_DONE ok=%d/%d" % (sum(1 for r in results if r["ok"]), len(results)))


if __name__ == "__main__":
    main()
