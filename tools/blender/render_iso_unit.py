# render_iso_unit.py — headless entry: render a unit (the placeholder thug, or later a real FBX) to iso
# sprite SHEETS (one PNG per action, rows=8 directions x cols=frames) + a manifest JSON, framed to the
# game's exact tile projection. OFFLINE TOOLING — not shipped to the browser.
#
#   xvfb-run -a blender -b -P tools/blender/render_iso_unit.py -- --job tools/blender/render_jobs/thug_placeholder.json
#
# Overrides: --engine BLENDER_EEVEE|CYCLES  --outdir <dir>  --no-freestyle  (CLI wins over the job JSON).
# The SAME script renders the real model later: point the job's `source` at an fbx/glb instead of "blockout".

import os
import sys
import json
import math
import hashlib

import bpy  # type: ignore

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import render_iso_common as ic  # noqa: E402
import blockout_thug as blk      # noqa: E402

try:
    import numpy as np
except Exception:  # Blender ships numpy; this is just a guard
    np = None


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def sample_frames(start, end, count, loop):
    """Evenly-spaced source frames. Looping actions EXCLUDE the terminal duplicate; non-looping INCLUDE it."""
    if count <= 1:
        return [float(start)]
    if loop:
        step = (end - start) / count
        return [start + i * step for i in range(count)]
    step = (end - start) / (count - 1)
    return [start + i * step for i in range(count)]


# Keyword fallbacks per action — used ONLY when the job's literal `fbx` path is missing. Meshy-native exports
# carry arbitrary filenames, so if "assets/raw/thug/Walking.fbx" isn't there we look for any FBX in that same
# folder whose name contains a walk keyword. The literal path stays the contract (the CI test enforces it);
# this just spares a re-render when the on-disk names differ from the job. Order = specificity.
ACTION_FBX_KEYWORDS = {
    "idle": ("idle", "breath", "stand", "rest"),
    "walk": ("walk",),
    "run": ("run", "jog", "sprint"),
    "hurt": ("hurt", "injured", "injure", "damage", "pain", "stagger", "flinch", "hit", "reaction", "slap"),
    "attack": ("attack", "punch", "melee", "swing", "strike", "combat", "kick"),
}


def resolve_model(rel, action_name):
    """Return an existing absolute model path (FBX or GLB) for this action. The job's literal path wins; if
    it's absent we scan its folder for a file of the SAME EXTENSION whose name matches the action's keywords
    (Meshy-native filenames are unknown to the repo). Raises SystemExit with a clear message if nothing matches
    — never renders the wrong clip."""
    abs_path = rel if os.path.isabs(rel) else os.path.abspath(os.path.join(_HERE, "..", "..", rel))
    if os.path.isfile(abs_path):
        return abs_path
    ext = os.path.splitext(abs_path)[1].lower() or ".fbx"
    folder = os.path.dirname(abs_path)
    if not os.path.isdir(folder):
        raise SystemExit("RENDER_FAIL: %r not found and its folder %r does not exist" % (rel, folder))
    present = sorted(f for f in os.listdir(folder) if f.lower().endswith(ext))
    kws = ACTION_FBX_KEYWORDS.get(action_name, (action_name,))
    matches = [f for f in present if any(k in f.lower() for k in kws)]
    if len(matches) == 1:
        chosen = os.path.join(folder, matches[0])
        print("MODEL_RESOLVE action=%s literal-missing -> keyword match %r" % (action_name, matches[0]))
        return chosen
    if len(matches) > 1:
        raise SystemExit("RENDER_FAIL: action %r literal %r missing; %d keyword %s matches %s — rename or set "
                         "the exact path in the job" % (action_name, os.path.basename(abs_path), len(matches), ext, matches))
    raise SystemExit("RENDER_FAIL: action %r model %r not found; no keyword match in %s among %s"
                     % (action_name, os.path.basename(abs_path), folder, present))


def apply_toon_materials(meshes, shader_cfg):
    """Swap each material slot (across one or more meshes) for a toon cel variant built from the slot's base
    colour (the blockout stores __base_hex__; a real FBX exposes a Principled Base Color — material_base_hex
    handles both)."""
    thresholds = shader_cfg.get("toonThresholds01", [0.28, 0.62, 0.88])
    desat = shader_cfg.get("desaturateAmount01", 0.28)
    sepia = shader_cfg.get("sepiaAmount01", 0.12)
    for mesh in meshes:
        for slot in mesh.material_slots:
            m = slot.material
            if m is None:
                continue
            base_hex = ic.material_base_hex(m)
            slot.material = ic.make_toon_material("toon_" + m.name, base_hex, thresholds, desat, sepia)


def set_frame(scene, f):
    fi = int(math.floor(f))
    scene.frame_set(fi, subframe=float(f - fi))


def set_only_visible(clips, active):
    """Render-hide every clip's meshes except the active clip's (real-FBX mode: each clip is its own imported
    rig+mesh, so we render one at a time). No-op-safe for shared-mesh blockout (single clip group)."""
    for c in clips:
        hide = c is not active
        for m in c["meshes"]:
            m.hide_render = hide


def bbox_prepass(scene, clips, dirs, basis, dir_start, dir_step, model_forward, multi_model, inplace):
    """Project every posed vertex (all clips x dirs x frames) onto the camera right/up axes and return
    ((minR, maxR, minU, maxU) UNION, per_clip_extents, drivers). The UNION across clips locks ONE ortho_scale
    so idle/walk/run/... all render at the SAME size and foot anchor (the 'shared normalization') — the
    load-bearing guarantee against resize-on-action. `per_clip_extents` is {name: [minR,maxR,minU,maxU]} for
    each clip's own span; `drivers` records which (clip, frame, dir) set each union extreme, so the locked
    scale is auditable from the .out log (which pose is widest/tallest across the whole set)."""
    right, up, _fwd = basis
    deps = bpy.context.evaluated_depsgraph_get()
    min_r = min_u = float("inf")
    max_r = max_u = float("-inf")
    drivers = {"min_r": None, "max_r": None, "min_u": None, "max_u": None}
    per_clip = {}
    for clip in clips:
        if multi_model:
            set_only_visible(clips, clip)
        ic.assign_action(clip["arm"], clip["action"])  # slot-bind on Blender 4.4+/5.1 slotted actions
        rot_obj = clip["piv"] or clip["arm"]
        cname = clip["name"]
        cb = per_clip.setdefault(cname, [float("inf"), float("-inf"), float("inf"), float("-inf")])
        for d in range(dirs):
            rot_obj.rotation_euler = (0, 0, math.radians(dir_start + model_forward + d * dir_step))
            for f in clip["frames"]:
                set_frame(scene, f)
                if inplace:
                    ic.center_root_world_xy(clip["arm"], clip["piv"])  # strip locomotion TRAVEL (keep Z bob)
                deps.update()
                for mesh in clip["meshes"]:
                    ev = mesh.evaluated_get(deps)
                    me = ev.to_mesh()
                    mw = ev.matrix_world
                    for v in me.vertices:
                        w = mw @ v.co
                        r = w.dot(right)
                        u = w.dot(up)
                        if r < min_r:
                            min_r, drivers["min_r"] = r, (cname, f, d)
                        if r > max_r:
                            max_r, drivers["max_r"] = r, (cname, f, d)
                        if u < min_u:
                            min_u, drivers["min_u"] = u, (cname, f, d)
                        if u > max_u:
                            max_u, drivers["max_u"] = u, (cname, f, d)
                        if r < cb[0]: cb[0] = r
                        if r > cb[1]: cb[1] = r
                        if u < cb[2]: cb[2] = u
                        if u > cb[3]: cb[3] = u
                    ev.to_mesh_clear()
    return (min_r, max_r, min_u, max_u), per_clip, drivers


def render_cell(scene, path_base):
    scene.render.filepath = path_base  # Blender appends .png from file_format
    bpy.ops.render.render(write_still=True)
    return path_base + ".png"


def load_cell_topdown(path, canvas):
    img = bpy.data.images.load(path)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape((canvas, canvas, 4))  # bottom-up rows
    arr = np.flipud(arr)  # -> top-down
    bpy.data.images.remove(img)
    return arr


def save_sheet(path, sheet_topdown):
    h, w, _ = sheet_topdown.shape
    img = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=True)
    bu = np.flipud(sheet_topdown)  # back to bottom-up for Blender
    img.pixels = bu.reshape(-1)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def main():
    args = argv_after_dashes()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("RENDER_FAIL: --job <path> required")
        sys.exit(2)
    with open(job_path) as fh:
        job = json.load(fh)

    cam_cfg = job["camera"]
    shader_cfg = job.get("shader", {})
    light_cfg = job.get("light", {})
    framing = job.get("framing", {})
    out_cfg = job.get("output", {})

    source = job.get("source", "blockout")
    multi_model = source in ("fbx", "glb")            # one imported rig per clip (vs the shared blockout rig)
    inplace = bool(job.get("inPlace", multi_model))   # In-Place root-strip ON for real animated clips
    # SHARED SCALE (load-bearing): the bbox pre-pass unions EVERY clip into ONE ortho_scale/figurePxH so no
    # action renders bigger/smaller than another (attack's wide arm-throw vs a compact idle). ON for real
    # multi-clip renders; the assertion below fails the render if any clip escapes the shared union.
    shared_scale = bool(job.get("sharedScale", multi_model))
    # PILOT/photoreal: a GLB carries its own PBR material + base-colour texture — KEEP it (no flat-grey toon
    # override, which is what ghosted the FBX). Default: keep for glb, toon-override for blockout/fbx.
    keep_source_material = bool(shader_cfg.get("keepSourceMaterial", source == "glb"))

    engine = get_opt(args, "--engine", out_cfg.get("renderEngine", "BLENDER_EEVEE"))
    outdir = get_opt(args, "--outdir", job["outputDir"])
    outdir = os.path.abspath(os.path.join(_HERE, "..", "..", outdir)) if not os.path.isabs(outdir) else outdir
    os.makedirs(outdir, exist_ok=True)
    tmpdir = os.path.join(outdir, "_tmp_frames")
    os.makedirs(tmpdir, exist_ok=True)

    canvas = int(framing.get("frameCanvasW", 256))
    pad = int(framing.get("pad", 16))
    target_h = int(framing.get("targetFigureMaxH", 224))
    dirs = int(cam_cfg.get("directions", 8))
    dir_start = float(cam_cfg.get("dirStartDeg", 0))
    dir_step = float(cam_cfg.get("dirStepDeg", 45))
    model_forward = float(cam_cfg.get("modelForwardDeg", 0))
    tile_w = float(cam_cfg["tileW"])
    tile_h = float(cam_cfg["tileH"])
    mode = cam_cfg.get("cameraMode", "dimetric2to1")

    # ── scene setup (engine, world, output) ─────────────────────────────────────────────────────────────
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.resolution_percentage = 100
    if engine == "BLENDER_EEVEE":
        scene.eevee.taa_render_samples = int(out_cfg.get("eeveeSamples", 24))
    ic.setup_world_transparent(scene)
    # COLOUR FIDELITY for a photoreal texture eval: EEVEE's default view transform (AgX/Filmic) tone-maps +
    # desaturates, misrepresenting the base-colour texture K is judging. 'Standard' shows true colour. Only
    # forced when we KEEP the source PBR material (the grey toon look is unaffected); overridable per job.
    view_xform = out_cfg.get("viewTransform", "Standard" if keep_source_material else None)
    if view_xform:
        try:
            scene.view_settings.view_transform = view_xform
            print("VIEW_TRANSFORM %s" % view_xform)
        except Exception as exc:
            print("VIEW_TRANSFORM %r unavailable (%s) — using default" % (view_xform, exc))
    scene.render.image_settings.compression = int(out_cfg.get("pngCompression", 100))  # lossless PNG (pngquant runs as a post-step — see README; K eyeballs banding)

    # ── build CLIPS: blockout = ONE shared rig + named baked actions; fbx = ONE imported rig PER clip ────
    # (Mixamo exports one FBX per animation, all sharing the rig/mesh). Either way the bbox pre-pass below
    # locks ONE shared scale + foot anchor across every clip so they line up in-game.
    ic.clear_scene()  # remove the default Cube/Light/Camera so ONLY the character renders + drives the bbox
    if inplace:
        print("ROOT-STRIP applied (in-place): locomotion TRAVEL removed per-frame for ALL clips (Z bob kept)")
    clips = []
    if source == "blockout":
        arm, mesh, _action_names = blk.build_thug()
        apply_toon_materials([mesh], shader_cfg)
        for a in job["actions"]:
            clips.append({
                "name": a["name"], "arm": arm, "meshes": [mesh], "piv": None,
                "action": bpy.data.actions[a["name"]],
                "sourceFile": "blockout", "sourceAction": a["name"],
                "frames": sample_frames(a["sourceFrameStart"], a["sourceFrameEnd"], a["outputFrameCount"], a["loop"]),
                "cols": a["outputFrameCount"], "fps": a["playbackFps"], "loop": a["loop"],
            })
    elif source in ("fbx", "glb"):
        for a in job["actions"]:
            model_rel = a.get("file") or a.get("glb") or a.get("fbx")
            if not model_rel:
                raise SystemExit("RENDER_FAIL: action %r needs a 'file'/'glb'/'fbx' path (source=%s)" % (a.get("name"), source))
            model_abs = resolve_model(model_rel, a["name"])
            piv, arm, meshes, action = ic.import_unit(model_abs, a["name"], a.get("actionName"))
            if action is None:
                raise SystemExit("RENDER_FAIL: %r has no animation action" % model_abs)
            if keep_source_material:
                # PILOT: keep the GLB's Material_1 (PBR + base-colour texture); downscale the 4096² texture so
                # EEVEE doesn't blow memory / over-sharpen; log the material wiring for a diagnosable render.
                ic.downscale_oversized_textures(meshes, int(shader_cfg.get("maxTextureSize", 1024)))
                ic.log_material_diagnostics(meshes)
                print("KEEP source material (no toon override) for %s <- %s" % (a["name"], os.path.basename(model_abs)))
            else:
                apply_toon_materials(meshes, shader_cfg)
            fr = action.frame_range
            start = int(a.get("sourceFrameStart", int(fr[0])))
            end = int(a.get("sourceFrameEnd", int(fr[1])))
            clips.append({
                "name": a["name"], "arm": arm, "meshes": meshes, "piv": piv, "action": action,
                "sourceFile": os.path.basename(model_abs), "sourceAction": action.name,
                "frames": sample_frames(start, end, a["outputFrameCount"], a["loop"]),
                "cols": a["outputFrameCount"], "fps": a["playbackFps"], "loop": a["loop"],
            })
            print("IMPORTED %s <- %s [action=%r] frames[%d..%d]" % (a["name"], model_abs, action.name, start, end))
    else:
        raise SystemExit("RENDER_FAIL: unknown source %r (expected 'blockout', 'fbx', or 'glb')" % source)

    ic.setup_lights(scene, light_cfg.get("keyEnergy", 1200.0), light_cfg.get("fillEnergy", 500.0),
                    light_cfg.get("rimEnergy", 220.0))
    if shader_cfg.get("outlineEnabled", True) and "--no-freestyle" not in args:
        ic.setup_freestyle(scene, bpy.context.view_layer,
                           shader_cfg.get("outlineThicknessPx", 1.75), shader_cfg.get("outlineColorHex", "#1E1713"))

    cam = ic.make_camera()
    cam_x = ic.camera_x_deg(tile_w, tile_h, mode)
    cam_z = float(cam_cfg.get("cameraZDeg", 45))
    ic.orient_camera(cam, cam_x, cam_z)
    scene.camera = cam
    basis = ic.camera_basis(cam_x, cam_z)

    # ── bbox pre-pass -> lock ONE framing across ALL clips (feet on bottom edge, shared scale) ───────────
    bounds, per_clip, drivers = bbox_prepass(scene, clips, dirs, basis, dir_start, dir_step, model_forward,
                                             multi_model, inplace)
    ortho_scale, proj_w, proj_h = ic.frame_camera(cam, basis, bounds, canvas, target_h, pad)
    px_per_bu = canvas / ortho_scale
    figure_px_h = proj_h * px_per_bu
    figure_px_w = proj_w * px_per_bu
    print("CAM mode=%s cameraXDeg=%.4f cameraZDeg=%.1f ortho_scale=%.4f figurePx=%.1fx%.1f source=%s"
          % (mode, cam_x, cam_z, ortho_scale, figure_px_w, figure_px_h, source))

    # ── LOCKED-SCALE: report the ONE scale that all clips render at + which clip/frame/dir drove the ────
    # governing (widest) span, plus each clip's own extent. Makes the shared normalization auditable from the
    # .out log — K can see e.g. attack drove the max and every clip renders at that single locked figurePxH.
    scale_by_h = proj_h * canvas / max(1, canvas - pad)
    scale_by_w = proj_w * canvas / max(1, canvas - 2 * pad)
    gov_axis, lo, hi = (("height(U)", drivers["min_u"], drivers["max_u"]) if scale_by_h >= scale_by_w
                        else ("width(R)", drivers["min_r"], drivers["max_r"]))
    _drv = lambda x: ("%s@f%.1f/dir%d" % (x[0], x[1], x[2])) if x else "?"
    print("LOCKED-SCALE ortho_scale=%.4f figurePxH=%.2f figurePxW=%.2f | governing=%s | span min=%s max=%s"
          % (ortho_scale, figure_px_h, figure_px_w, gov_axis, _drv(lo), _drv(hi)))
    for cn, cb in per_clip.items():
        print("  clip-extent %-8s projW=%.3f projH=%.3f" % (cn, max(0.0, cb[1] - cb[0]), max(0.0, cb[3] - cb[2])))

    # SHARED-SCALE assertion: ONE figurePxH must cover every clip, so no action renders at a divergent size
    # (the resize-on-action bug). Structural — one ortho_scale for all — plus this defensive check that no
    # clip's own extent escapes the union it was framed by. Fails the render loudly rather than shipping a
    # per-clip-scaled sheet set.
    if shared_scale and len(clips) > 1:
        min_r, max_r, min_u, max_u = bounds
        eps = 1e-4
        for cn, cb in per_clip.items():
            if cb[0] < min_r - eps or cb[1] > max_r + eps or cb[2] < min_u - eps or cb[3] > max_u + eps:
                raise SystemExit("RENDER_FAIL: clip %r extent [%.3f,%.3f]x[%.3f,%.3f] escapes the shared union "
                                 "[%.3f,%.3f]x[%.3f,%.3f] — scale is NOT shared across clips"
                                 % (cn, cb[0], cb[1], cb[2], cb[3], min_r, max_r, min_u, max_u))
        print("SHARED-SCALE OK: ONE figurePxH=%.2f / ortho_scale=%.4f locked across %d clips (%s)"
              % (figure_px_h, ortho_scale, len(clips), ", ".join(per_clip.keys())))

    # ── render every cell, pack per-clip sheets (rows=8 dirs × cols=frames) ──────────────────────────────
    unit_name = job["unitName"]
    manifest_actions = {}
    sheet_digests = {}  # action -> content hash; identical hashes across actions == contamination (abort below)
    for clip in clips:
        if multi_model:
            set_only_visible(clips, clip)
        ic.assign_action(clip["arm"], clip["action"])  # slot-bind on Blender 4.4+/5.1 slotted actions
        rot_obj = clip["piv"] or clip["arm"]
        name = clip["name"]
        cols = clip["cols"]
        sheet = np.zeros((dirs * canvas, cols * canvas, 4), dtype=np.float32)
        frames_meta = []
        for d in range(dirs):
            rot_obj.rotation_euler = (0, 0, math.radians(dir_start + model_forward + d * dir_step))
            for ci, f in enumerate(clip["frames"]):
                set_frame(scene, f)
                if inplace:
                    ic.center_root_world_xy(clip["arm"], clip["piv"])  # strip locomotion TRAVEL (keep Z bob)
                base = os.path.join(tmpdir, "%s_%s_d%d_f%02d" % (unit_name, name, d, ci))
                png = render_cell(scene, base)
                cell = load_cell_topdown(png, canvas)
                y0 = d * canvas
                x0 = ci * canvas
                sheet[y0:y0 + canvas, x0:x0 + canvas, :] = cell
                frames_meta.append({
                    "name": "%s_%s_dir%d_f%02d" % (unit_name, name, d, ci),
                    "x": x0, "y": y0, "w": canvas, "h": canvas,
                    "anchorX": 0.5, "anchorY": 1.0,
                    "dirIndex": d, "action": name, "frameIndex": ci,
                })
        sheet_path = os.path.join(outdir, "%s_%s.png" % (unit_name, name))
        save_sheet(sheet_path, sheet)
        sheet_digests[name] = hashlib.sha1(sheet.tobytes()).hexdigest()
        manifest_actions[name] = {
            "action": name,
            "image": "%s_%s.png" % (unit_name, name),
            "frameW": canvas, "frameH": canvas, "rows": dirs, "cols": cols,
            "playbackFps": clip["fps"], "loop": clip["loop"],
            "sourceFile": clip.get("sourceFile"), "sourceAction": clip.get("sourceAction"),
            "frames": frames_meta,
        }
        print("SHEET %s rows=%d cols=%d source=%s action=%r"
              % (sheet_path, dirs, cols, clip.get("sourceFile"), clip.get("sourceAction")))

    # ── CONTAMINATION GUARD: two actions rendering BYTE-IDENTICAL pixels means the same clip drove both slots
    # (a baked baselayer hijacked them, or a clip→file mis-map). The manifest validates geometry, not pose, so
    # this is the only render-time check that catches it. Abort BEFORE writing the manifest so nothing bad ships.
    by_digest = {}
    for act, dig in sheet_digests.items():
        by_digest.setdefault(dig, []).append(act)
    dupes = [grp for grp in by_digest.values() if len(grp) > 1]
    if dupes:
        groups = "; ".join("==".join(sorted(g)) for g in dupes)
        raise SystemExit(
            "RENDER_FAIL: identical sheets across distinct actions (%s) — likely a baked 'baselayer' hijack or a "
            "clip→file mis-map. Check the ACTION_PICK/IMPORTED logs; each action must resolve to its own clip." % groups)

    manifest = {
        "unitName": unit_name,
        "placeholder": (source == "blockout"),
        "generator": "tools/blender/render_iso_unit.py (%s)" % (
            "blockout_thug placeholder — NOT shipped art" if source == "blockout" else "real model render (%s)" % source),
        "camera": {"mode": mode, "cameraXDeg": round(cam_x, 4), "cameraZDeg": cam_z,
                   "tileW": tile_w, "tileH": tile_h, "orthoScale": round(ortho_scale, 4)},
        "anchor": {"anchorX": 0.5, "anchorY": 1.0},
        "directions": dirs, "dirStartDeg": dir_start, "dirStepDeg": dir_step, "modelForwardDeg": model_forward,
        "figurePxH": round(figure_px_h, 2), "figurePxW": round(figure_px_w, 2), "frameCanvas": canvas, "pad": pad,
        "actions": manifest_actions,
    }
    manifest_path = os.path.join(outdir, "%s_manifest.json" % unit_name)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("MANIFEST %s" % manifest_path)

    # tidy temp frames
    for fn in os.listdir(tmpdir):
        try:
            os.remove(os.path.join(tmpdir, fn))
        except OSError:
            pass
    try:
        os.rmdir(tmpdir)
    except OSError:
        pass
    print("RENDER_OK unit=%s actions=%d dirs=%d figurePxH=%.2f orthoScale=%.4f"
          % (unit_name, len(clips), dirs, figure_px_h, ortho_scale))


if __name__ == "__main__":
    main()
