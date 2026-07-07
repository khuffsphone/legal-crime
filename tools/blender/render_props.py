# render_props.py — render Meshy environmental-prop GLBs to single-frame iso PNGs at the LOCKED kit
# density (64*sqrt2 px/BU, 60/45 ortho). One PNG + one manifest entry per prop. RAW output (pngquant
# BANNED). Mirrors the kit renderer's camera/scale contract via render_iso_common so props sit at the
# same 2.8284 kit scale as buildings and units.
#
#   & $env:BLENDER_PATH -b -P tools\blender\render_props.py -- --job tools\blender\render_jobs\props_batch.json
#
import bpy, sys, os, json, math, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ric", os.path.join(HERE, "render_iso_common.py"))
ric = importlib.util.module_from_spec(spec); spec.loader.exec_module(ric)

PX_PER_BU = 64.0 * math.sqrt(2.0)   # canon density (canvas/ortho invariant), matches render_iso_kit


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


def render_one(glb, out_png, canvas, pad, engine, samples):
    clear_scene()
    scene = bpy.context.scene
    ric.setup_world_transparent(scene)
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        print("PROP_SKIP no-mesh %s" % os.path.basename(glb)); return None
    mn, mx = world_bounds(meshes)
    # normalise to sit on ground (feet/base at z=0), centre in XY
    import mathutils
    ctr = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in meshes:
        if o.parent is None:
            o.location -= ctr
    mn, mx = world_bounds(meshes)
    cam_x = ric.camera_x_deg(128, 64, "dimetric2to1")   # 60deg locked
    basis = ric.camera_basis(cam_x, 45.0)
    cam = ric.make_camera("propcam")
    ric.orient_camera(cam, cam_x, 45.0)
    ortho = (canvas / PX_PER_BU)
    got, _pw, _ph = ric.frame_camera(cam, basis, (mn.x, mx.x, mn.z, mx.z), canvas, canvas, pad,
                                     force_ortho_scale=ortho)
    scene.camera = cam
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
    bpy.ops.render.render(write_still=True)
    print("PROP_OK %s density=%.4f canvas=%d" % (os.path.basename(out_png), canvas / got, canvas))
    return {"canvas": canvas, "orthoScale": round(got, 6),
            "worldW": round(mx.x - mn.x, 4), "worldH": round(mx.z - mn.z, 4)}


def main():
    args = args_after_dd()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("PROP_FAIL: --job <path> required"); return
    job = json.load(open(job_path, encoding="utf-8"))
    outdir = os.path.join(HERE, "..", "..", job["outputDir"]); outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)
    canvas = int(job.get("canvas", 256)); pad = int(job.get("pad", 8))
    engine = get_opt(args, "--engine", job.get("renderEngine", "BLENDER_EEVEE"))
    samples = int(job.get("eeveeSamples", 24))
    only = get_opt(args, "--only")
    manifest = {"generator": "tools/blender/render_props.py", "density": round(PX_PER_BU, 4),
                "canvas": canvas, "props": {}}
    n = 0
    for p in job["props"]:
        pid = p["id"]
        if only and only != pid:
            continue
        glb = os.path.abspath(os.path.join(HERE, "..", "..", p["glb"]))
        if not os.path.exists(glb):
            print("PROP_MISSING %s -> %s" % (pid, glb)); continue
        out_png = os.path.join(outdir, pid + ".png")
        info = render_one(glb, out_png, canvas, pad, engine, samples)
        if info:
            info["family"] = p.get("family"); manifest["props"][pid] = info; n += 1
    json.dump(manifest, open(os.path.join(outdir, "props_manifest.json"), "w", encoding="utf-8"), indent=2)
    print("PROPS_BATCH_OK rendered=%d -> %s" % (n, outdir))


if __name__ == "__main__":
    main()
