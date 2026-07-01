#!/usr/bin/env python
"""Inspect model inputs (FBX or GLB/glTF) for the iso render pipeline (offline tooling — NOT part of the app build).

Answers the questions the render job map depends on, WITHOUT rendering a pixel:
  * how many model files are present, and their exact filenames;
  * is each clip its OWN file, or is one file carrying MULTIPLE takes/actions;
  * the armature's bone names + which bone is the root/hips (drives the In-Place strip);
  * whether each mesh is actually SKINNED to that armature (so the importer keeps the right geometry);
  * MATERIALS/TEXTURES — is a BASE-COLOR image texture bound, and at what resolution (FBX often drops the
    texture → flat-grey "ghost"; GLB embeds it). This is the STEP-0 color check for the GLB switch;
  * per action: frame range, and whether the ROOT bone TRANSLATES (locomotion travels) vs stays in place —
    reported as the XY travel span in Blender units, so "walk travels 3.1 BU" vs "walk in-place 0.00 BU".

Run locally (needs Blender + the gitignored model inputs):

  Windows (PowerShell) — a whole folder, or one file (handy for the big GLBs wherever they downloaded):
    & $env:BLENDER_PATH -b -P tools\\blender\\inspect_fbx.py -- --dir assets\\raw\\thug
    & $env:BLENDER_PATH -b -P tools\\blender\\inspect_fbx.py -- --file "$env:USERPROFILE\\Downloads\\Character_output.glb"
  macOS/Linux:
    "$BLENDER_PATH" -b -P tools/blender/inspect_fbx.py -- --dir assets/raw/thug

Scans .fbx/.glb/.gltf. Output is plain text on stdout (paste it back so the render job can be finalized).
Nothing is written to disk and nothing is rendered.
"""
import os
import sys

try:
    import bpy
    from mathutils import Vector
except Exception:  # pragma: no cover - only runs inside Blender
    bpy = None
    Vector = None

# Same root/hips name candidates the renderer tries first (Mixamo + Meshy-native variants); else first root bone.
ROOT_NAMES = ("mixamorig:Hips", "mixamorig1:Hips", "Hips", "hips", "Root", "root", "pelvis", "Pelvis", "Armature|Hips")

# Actions whose NAME carries this token are a contaminating export artefact (the baked "...|baselayer"),
# NOT the intended clip — the render importer drops them. Kept in sync with render_iso_common.CONTAMINANT_TOKENS.
# ONLY 'baselayer' — 'guard'/'hook' would wrongly flag legit combat clips (Boxing_Guard.../Right_Upper_Hook).
CONTAMINANT_TOKENS = ("baselayer",)


def _is_contaminant(name):
    low = (name or "").lower()  # case-insensitive: catches 'BaseLayer', '|baselayer', 'BASELAYER' alike
    return any(tok in low for tok in CONTAMINANT_TOKENS)  # tokens MUST stay lowercase for this to hold


def _argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _get_arg(flag, default):
    a = _argv_after_dashes()
    if flag in a:
        i = a.index(flag)
        if i + 1 < len(a):
            return a[i + 1]
    return default


def _clear_all():
    """Wipe every object + orphan datablock so each FBX is inspected in isolation."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.objects, bpy.data.materials):
        for blk in list(coll):
            try:
                coll.remove(blk)
            except Exception:
                pass


def _pick_root_name(arm_obj):
    names = {b.name for b in arm_obj.data.bones}
    for nm in ROOT_NAMES:
        if nm in names:
            return nm
    roots = [b.name for b in arm_obj.data.bones if b.parent is None]
    return roots[0] if roots else None


def _iter_action_fcurves(action):
    """Every F-curve in an action, ACROSS Blender versions. Legacy (<=4.3) exposes Action.fcurves; the slotted
    'Baklava' actions in 4.4+/5.1 removed it — F-curves now live under
    action.layers[].strips[].channelbag(slot).fcurves. Returns a list (may be empty), never raises."""
    if action is None:
        return []
    try:
        legacy = list(action.fcurves)  # AttributeError on slotted-only builds
    except AttributeError:
        legacy = None
    if legacy:
        return legacy
    out = []
    slots = list(getattr(action, "slots", []) or [])
    for layer in (getattr(action, "layers", []) or []):
        for strip in (getattr(layer, "strips", []) or []):
            cbags = []
            for slot in slots:
                try:
                    cb = strip.channelbag(slot)
                except Exception:
                    cb = None
                if cb is not None:
                    cbags.append(cb)
            if not cbags:
                cbags = list(getattr(strip, "channelbags", []) or [])
            for cb in cbags:
                out.extend(list(getattr(cb, "fcurves", []) or []))
    return out


def _assign_action(arm, action):
    """Assign an action to the armature, binding a slot on slotted (4.4+) actions so it actually drives the rig
    (legacy actions need only the .action assignment). Version-safe; never raises."""
    if arm is None or action is None:
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


def _action_root_travel(action, root_name):
    """Return (has_loc_fcurves, span_xy, span_z) for the root bone's location across the action.
    span_xy is the diagonal of the X/Y bounding box of the root's keyed local translation — a proxy for how
    far the figure 'travels'. ~0 => in-place; large => locomotion carries root motion (needs the strip)."""
    if not action:
        return (False, 0.0, 0.0)
    path = 'pose.bones["%s"].location' % root_name
    chans = {0: [], 1: [], 2: []}
    has = False
    for fc in _iter_action_fcurves(action):
        if fc.data_path == path and fc.array_index in chans:
            has = True
            for kp in fc.keyframe_points:
                chans[fc.array_index].append(kp.co[1])
    def _span(vals):
        return (max(vals) - min(vals)) if vals else 0.0
    sx, sy, sz = _span(chans[0]), _span(chans[1]), _span(chans[2])
    span_xy = (sx * sx + sy * sy) ** 0.5
    return (has, span_xy, sz)


def _world_root_travel(arm_obj, root_name, action, scene):
    """Sample the root bone's WORLD XY at the first/mid/last frame; report the max pairwise XY distance.
    Catches travel that lives on the object transform or an animated root even when local fcurves look small."""
    if not action:
        return 0.0
    fr = action.frame_range
    f0, f1 = int(fr[0]), int(fr[1])
    if f1 <= f0:
        return 0.0
    samples = sorted({f0, (f0 + f1) // 2, f1})
    pts = []
    deps = bpy.context.evaluated_depsgraph_get()
    for f in samples:
        scene.frame_set(f)
        deps.update()
        ev = arm_obj.evaluated_get(deps)
        pb = ev.pose.bones.get(root_name)
        if pb is None:
            return 0.0
        w = ev.matrix_world @ pb.head
        pts.append((w.x, w.y))
    span = 0.0
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            dx = pts[i][0] - pts[j][0]
            dy = pts[i][1] - pts[j][1]
            span = max(span, (dx * dx + dy * dy) ** 0.5)
    return span


def _report_materials(meshes):
    """Report, per mesh material: is a BASE-COLOR image texture actually bound (the thing FBX dropped → grey
    ghost), what image + resolution, and every image the material references. Answers STEP 0's texture question."""
    any_base = False
    for m in meshes:
        mats = [s.material for s in m.material_slots if s.material]
        if not mats:
            print("    - mesh %r: NO material slots" % m.name)
            continue
        for mat in mats:
            imgs, base_tex = [], None
            if getattr(mat, "use_nodes", False) and mat.node_tree:
                for n in mat.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image:
                        sz = n.image.size
                        imgs.append("%s(%dx%d)" % (n.image.name, sz[0] if sz else 0, sz[1] if sz else 0))
                    if n.type == "BSDF_PRINCIPLED":
                        bc = n.inputs.get("Base Color")
                        if bc and bc.is_linked:
                            src = bc.links[0].from_node
                            if src.type == "TEX_IMAGE" and src.image:
                                base_tex = "%s(%dx%d)" % (src.image.name,
                                                          src.image.size[0] if src.image.size else 0,
                                                          src.image.size[1] if src.image.size else 0)
            if base_tex:
                any_base = True
            status = ("BASE-COLOR TEXTURED -> %s" % base_tex) if base_tex else "base-color FLAT (no texture bound — grey-ghost risk)"
            print("    - mesh %r material %r: %s | images: %s" % (m.name, mat.name, status, imgs or "none"))
    print("    => %s" % ("COLOR PRESENT: at least one base-color texture is bound" if any_base
                         else "NO base-color texture bound anywhere — this file renders FLAT/GREY"))


def inspect_one(path, scene):
    print("=" * 78)
    print("FILE: %s" % os.path.basename(path))
    print("      %s" % path)
    _clear_all()
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=path)   # glTF/GLB embeds textures; FBX often drops them
        else:
            bpy.ops.import_scene.fbx(filepath=path)
    except Exception as exc:
        print("  !! import failed: %s" % exc)
        return

    objs = list(bpy.data.objects)
    arms = [o for o in objs if o.type == "ARMATURE"]
    meshes = [o for o in objs if o.type == "MESH"]
    others = [o for o in objs if o.type not in ("ARMATURE", "MESH")]
    print("  objects: %d total  (armatures=%d meshes=%d other=%d)" % (len(objs), len(arms), len(meshes), len(others)))
    for o in others:
        print("    - other: %r (%s)" % (o.name, o.type))

    # meshes: is each one actually skinned to an armature?
    for m in meshes:
        mods = [md for md in m.modifiers if md.type == "ARMATURE" and md.object]
        vg = len(m.vertex_groups)
        verts = len(m.data.vertices)
        skinned = "SKINNED->%s" % mods[0].object.name if mods else "NOT-skinned"
        print("    - mesh: %r  verts=%d  vgroups=%d  %s" % (m.name, verts, vg, skinned))

    # materials/textures — the STEP-0 color check (is a base-color texture bound, at what resolution?)
    print("  materials/textures:")
    _report_materials(meshes)

    # armature(s): bones + root + actions/takes
    all_actions = list(bpy.data.actions)
    print("  actions/takes in file: %d  ->  %s" % (len(all_actions), [a.name for a in all_actions]))
    for arm in arms:
        root = _pick_root_name(arm)
        nbones = len(arm.data.bones)
        print("  armature: %r  bones=%d  root=%r" % (arm.name, nbones, root))
        bone_names = [b.name for b in arm.data.bones]
        print("    bones: %s" % (bone_names if nbones <= 40 else bone_names[:40] + ["...+%d more" % (nbones - 40)]))
        if root is None:
            continue
        multi = len(all_actions) > 1  # 'baselayer' is only a CONTAMINANT when a file ships >1 action;
        for action in all_actions:    # a single-action per-clip export names its REAL clip '<Clip>|baselayer'.
            _assign_action(arm, action)
            has_loc, span_xy, span_z = _action_root_travel(action, root)
            fr = action.frame_range
            wspan = _world_root_travel(arm, root, action, scene)
            travels = max(span_xy, wspan) >= 0.05
            tag = "  <<suspected baselayer artefact — importer drops it>>" if (multi and _is_contaminant(action.name)) else ""
            verdict = ("TRAVELS  (needs root strip)" if travels else "IN-PLACE") + tag
            print("    action %r: frames %d..%d  rootLocKeys=%s  localXYspan=%.3f  worldXYspan=%.3f  -> %s"
                  % (action.name, int(fr[0]), int(fr[1]), has_loc, span_xy, wspan, verdict))


def main():
    if bpy is None:
        print("inspect_fbx.py must run inside Blender:  blender -b -P tools/blender/inspect_fbx.py -- --dir <folder>")
        raise SystemExit(2)
    here = os.path.dirname(os.path.abspath(__file__))
    default_dir = os.path.abspath(os.path.join(here, "..", "..", "assets", "raw", "thug"))
    scene = bpy.context.scene
    # --file <path>: inspect a single model (handy for the big GLBs, wherever they were downloaded)
    one = _get_arg("--file", None)
    if one:
        one = one if os.path.isabs(one) else os.path.abspath(one)
        inspect_one(one, scene)
        print("=" * 78)
        print("INSPECT_OK files=1")
        return
    folder = _get_arg("--dir", default_dir)
    folder = folder if os.path.isabs(folder) else os.path.abspath(folder)
    print("INSPECT dir: %s" % folder)
    if not os.path.isdir(folder):
        print("  !! not a directory")
        raise SystemExit(2)
    exts = (".fbx", ".glb", ".gltf")
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(exts))
    print("  found %d model files: %s" % (len(files), files))
    if not files:
        raise SystemExit(0)
    for fn in files:
        inspect_one(os.path.join(folder, fn), scene)
    print("=" * 78)
    print("INSPECT_OK files=%d" % len(files))


if __name__ == "__main__":
    main()
