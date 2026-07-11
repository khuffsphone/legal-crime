# render_props.py - render Meshy environmental-prop GLBs to single-frame iso PNGs at the LOCKED kit
# density (64*sqrt2 px/BU, 60/45 ortho). One PNG + one manifest entry per prop. RAW output (pngquant
# BANNED). Mirrors the kit renderer's camera/scale contract via render_iso_common so props sit at the
# same 2.8284 kit scale as buildings and units.
#
#   & $env:BLENDER_PATH -b -P tools\blender\render_props.py -- --job tools\blender\render_jobs\props_batch.json
#
# SCALE MODEL (v2): the DECLARED targetHeightPx is a SCREEN height. A pure world-Z scale only matches
# screen height for near-vertical props; the 60/45 iso projection of a bulky/deep model adds screen-Y from
# its footprint. So render_one now does a MEASURE-AND-RESCALE loop: render -> measure the rendered alpha
# bbox height -> uniformly rescale the model by (target/measured) -> re-render, until within tolerance.
# Tall props get a per-prop CANVAS bump (density stays locked; a bigger canvas just frames more world so a
# 30ft pole doesn't clip 256). footPadPx (px from canvas bottom to the prop's foot) is recorded so the
# scene placer can seat the foot exactly on the tile.
import bpy, sys, os, json, math, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ric", os.path.join(HERE, "render_iso_common.py"))
ric = importlib.util.module_from_spec(spec); spec.loader.exec_module(ric)

PX_PER_BU = 64.0 * math.sqrt(2.0)   # canon density (canvas/ortho invariant), matches render_iso_kit
ALPHA_THRESH = 0.06
MAX_ITERS = 6


def args_after_dd():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def clear_scene():
    ric.clear_scene()


def world_bounds(objs):
    import mathutils
    mn = mathutils.Vector((1e9, 1e9, 1e9)); mx = mathutils.Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            mn = mathutils.Vector((min(mn[i], w[i]) for i in range(3)))
            mx = mathutils.Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


def measure_png(path):
    # Return (height_px, foot_pad_px, width_px) of the rendered prop's non-transparent bounding box.
    # Blender image pixels are row-major BOTTOM-UP, so row 0 == canvas bottom -> rows.min() == foot pad.
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    a = buf.reshape(h, w, 4)[:, :, 3]
    rows = np.where(a.max(axis=1) > ALPHA_THRESH)[0]
    if len(rows) == 0:
        return 0, 0, 0
    ymin = int(rows.min()); ymax = int(rows.max())
    cols = np.where(a.max(axis=0) > ALPHA_THRESH)[0]
    width = (int(cols.max()) - int(cols.min()) + 1) if len(cols) else 0
    return (ymax - ymin + 1), ymin, width


def _rescale(roots, s):
    for o in roots:
        o.scale = (o.scale[0] * s, o.scale[1] * s, o.scale[2] * s)
    bpy.context.view_layer.update()


def render_one(glb, out_png, canvas, pad, engine, samples, target_h_px=None):
    clear_scene()
    scene = bpy.context.scene
    ric.setup_world_transparent(scene)
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        print("PROP_SKIP no-mesh %s" % os.path.basename(glb)); return None
    import mathutils
    roots = [o for o in meshes if o.parent is None] or meshes
    # camera + lights + render settings (once)
    cam_x = ric.camera_x_deg(128, 64, "dimetric2to1")   # 60deg locked
    basis = ric.camera_basis(cam_x, 45.0)
    cam = ric.make_camera("propcam"); ric.orient_camera(cam, cam_x, 45.0); scene.camera = cam
    ric.setup_lights(scene, key=1200.0, fill=500.0, rim=220.0)
    scene.render.engine = engine
    if engine == "BLENDER_EEVEE":
        try: scene.eevee.taa_render_samples = samples
        except Exception: pass
    scene.render.film_transparent = True
    scene.render.resolution_x = canvas; scene.render.resolution_y = canvas
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 100  # RAW, pngquant BANNED
    scene.render.filepath = out_png
    ortho = (canvas / PX_PER_BU)
    # starting guess: scale world-Z to target (good for vertical props; the loop corrects the rest)
    mn, mx = world_bounds(meshes)
    cur_h = max(mx.z - mn.z, 1e-6)
    if target_h_px and target_h_px > 0:
        _rescale(roots, (target_h_px / PX_PER_BU) / cur_h)
    measured = 0; foot = 0; got = ortho; iters = 0
    for it in range(MAX_ITERS):
        iters = it + 1
        # normalise: feet/base at z=0, centre in XY
        mn, mx = world_bounds(meshes)
        ctr = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        for o in roots:
            o.location = (o.location[0] - ctr[0], o.location[1] - ctr[1], o.location[2] - ctr[2])
        bpy.context.view_layer.update()
        mn, mx = world_bounds(meshes)
        got, _pw, _ph = ric.frame_camera(cam, basis, (mn.x, mx.x, mn.z, mx.z), canvas, canvas, pad,
                                         force_ortho_scale=ortho)
        bpy.ops.render.render(write_still=True)
        measured, foot, _w = measure_png(out_png)
        if not (target_h_px and target_h_px > 0):
            break
        tol = max(1.0, 0.03 * target_h_px)
        if measured <= 0 or abs(measured - target_h_px) <= tol:
            break
        corr = max(0.2, min(target_h_px / max(measured, 1e-6), 5.0))
        _rescale(roots, corr)
    ratio = (measured / target_h_px) if (target_h_px and target_h_px > 0) else 0.0
    print("PROP_OK %s target=%s measured=%d ratio=%.2f foot=%d iters=%d canvas=%d density=%.4f"
          % (os.path.basename(out_png), target_h_px, measured, ratio, foot, iters, canvas, canvas / got))
    return {"canvas": canvas, "orthoScale": round(got, 6), "targetHeightPx": target_h_px,
            "measuredHeightPx": int(measured), "footPadPx": int(foot), "iters": iters,
            "worldH": round(mx.z - mn.z, 4)}


def canvas_for(target_h_px, base_canvas, pad):
    # Density is locked, so a taller prop needs a taller canvas or it clips. 1.5x headroom covers the
    # footprint projection; 4px-snapped; capped at 1024.
    t = float(target_h_px or 0)
    need = int(t * 1.5 + 4 * pad)
    cv = max(base_canvas, ((need + 3) // 4) * 4)
    return min(cv, 1024)


def main():
    args = args_after_dd()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("PROP_FAIL: --job <path> required"); return
    job = json.load(open(job_path, encoding="utf-8"))
    outdir = os.path.join(HERE, "..", "..", job["outputDir"]); outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)
    base_canvas = int(job.get("canvas", 256)); pad = int(job.get("pad", 8))
    engine = get_opt(args, "--engine", job.get("renderEngine", "BLENDER_EEVEE"))
    samples = int(job.get("eeveeSamples", 24))
    only = get_opt(args, "--only")
    manifest = {"generator": "tools/blender/render_props.py", "density": round(PX_PER_BU, 4),
                "baseCanvas": base_canvas, "props": {}}
    n = 0
    for p in job["props"]:
        pid = p["id"]
        if only and only != pid:
            continue
        glb = os.path.abspath(os.path.join(HERE, "..", "..", p["glb"]))
        if not os.path.exists(glb):
            print("PROP_MISSING %s -> %s" % (pid, glb)); continue
        out_png = os.path.join(outdir, pid + ".png")
        cv = canvas_for(p.get("targetHeightPx"), base_canvas, pad)
        info = render_one(glb, out_png, cv, pad, engine, samples, p.get("targetHeightPx"))
        if info:
            info["family"] = p.get("family"); manifest["props"][pid] = info; n += 1
    json.dump(manifest, open(os.path.join(outdir, "props_manifest.json"), "w", encoding="utf-8"), indent=2)
    print("PROPS_BATCH_OK rendered=%d -> %s" % (n, outdir))


if __name__ == "__main__":
    main()
