# blockout_thug.py — a CRUDE PRIMITIVE "thug" blockout (boxes + cylinders) with a simple armature and three
# baked clips (idle / walk / attack). PLACEHOLDER ONLY — NOT ART, NOT SHIPPED. Its sole job is to prove the
# Blender -> sprite-sheet -> Phaser pipeline end-to-end so the real Meshy/Mixamo thug FBX later only has to
# swap the model (same render_iso_unit.py, same manifest, same Phaser ingest).
#
# Build approach: each body part is a primitive mesh assigned 100% to ONE vertex group; all parts are joined
# into a single mesh bound to a 6-bone armature (spine/head/armL/armR/legL/legR) by an Armature modifier.
# Rotating pose bones gives rigid limb swing — exactly what a blocky placeholder wants. Forward = +Y, up = +Z,
# feet on z=0, centred on x=y=0 (so the render's foot-anchor pre-pass is trivial).
#
# Standalone:  blender -b -P blockout_thug.py -- --save /tmp/thug.blend
# Library:     from blockout_thug import build_thug  ->  returns (armature_obj, mesh_obj, action_names)

import sys
import math

import bpy  # type: ignore

# desaturated noir palette (NOT faction colours — faction lives on the Phaser base-plate, never the body)
COAT_HEX = "#36383F"     # charcoal coat/torso
TROUSER_HEX = "#2E3138"  # slate trousers
SKIN_HEX = "#C9A57E"     # muted warm beige
HAT_HEX = "#241D17"      # dark sepia-brown fedora
BAT_HEX = "#5A4632"      # worn wood bat

PART_GROUP = "__group__"  # custom prop key stashing the intended vertex-group name on each part


def _reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for item in list(coll):
            coll.remove(item)


def _mat(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    h = hexcol.lstrip("#")
    rgb = tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.8
    m["__base_hex__"] = hexcol
    return m


def _box(name, center, size, group, mat):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    o[PART_GROUP] = group
    return o


def _cyl(name, center, radius, depth, group, mat, axis="Z"):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=center, vertices=16)
    o = bpy.context.active_object
    o.name = name
    if axis == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.data.materials.append(mat)
    o[PART_GROUP] = group
    return o


def _build_parts():
    coat = _mat("coat", COAT_HEX)
    trouser = _mat("trouser", TROUSER_HEX)
    skin = _mat("skin", SKIN_HEX)
    hat = _mat("hat", HAT_HEX)
    bat = _mat("bat", BAT_HEX)
    parts = []
    # torso/coat -> spine
    parts.append(_box("torso", (0, 0, 1.20), (0.50, 0.30, 0.66), "spine", coat))
    # head -> head; fedora crown+brim -> head
    parts.append(_box("head", (0, 0, 1.62), (0.26, 0.26, 0.24), "head", skin))
    parts.append(_cyl("brim", (0, 0, 1.74), 0.30, 0.04, "head", hat))
    parts.append(_cyl("crown", (0, 0, 1.83), 0.17, 0.16, "head", hat))
    # legs -> legL/legR
    parts.append(_box("legL", (0.13, 0, 0.45), (0.18, 0.20, 0.90), "legL", trouser))
    parts.append(_box("legR", (-0.13, 0, 0.45), (0.18, 0.20, 0.90), "legR", trouser))
    # arms -> armL/armR (coat sleeves)
    parts.append(_box("armL", (0.34, 0, 1.18), (0.16, 0.18, 0.60), "armL", coat))
    parts.append(_box("armR", (-0.34, 0, 1.18), (0.16, 0.18, 0.60), "armR", coat))
    # bat in the right hand -> armR (swings with the arm)
    parts.append(_cyl("bat", (-0.34, 0.18, 0.92), 0.045, 0.70, "armR", bat, axis="Y"))
    return parts


def _join_with_groups(parts):
    # give each part a vertex group (named for its bone) with all verts weight 1, then join into one mesh.
    for o in parts:
        grp = o[PART_GROUP]
        vg = o.vertex_groups.new(name=grp)
        vg.add([v.index for v in o.data.vertices], 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.active_object
    mesh.name = "thug_mesh"
    return mesh


# bone rest layout: (name, head, tail, parent)
BONES = [
    ("root", (0, 0, 0.90), (0, 0, 1.00), None),
    ("spine", (0, 0, 0.90), (0, 0, 1.53), "root"),
    ("head", (0, 0, 1.53), (0, 0, 1.80), "spine"),
    ("armL", (0.34, 0, 1.45), (0.34, 0, 0.88), "spine"),
    ("armR", (-0.34, 0, 1.45), (-0.34, 0, 0.88), "spine"),
    ("legL", (0.13, 0, 0.90), (0.13, 0, 0.04), "root"),
    ("legR", (-0.13, 0, 0.90), (-0.13, 0, 0.04), "root"),
]


def _build_armature():
    arm_data = bpy.data.armatures.new("thug_arm")
    arm = bpy.data.objects.new("thug_rig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for name, head, tail, _parent in BONES:
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        made[name] = b
    for name, _h, _t, parent in BONES:
        if parent:
            made[name].parent = made[parent]
            made[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _bind(mesh, arm):
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # ARMATURE_NAME => bind by matching vertex-group names to bone names (no auto weights)
    bpy.ops.object.parent_set(type="ARMATURE_NAME")


def _key(arm, frame, rotations):
    """rotations: {bone: (rx_deg, ry_deg, rz_deg)} — set + keyframe at `frame`."""
    bpy.context.scene.frame_set(frame)
    for bone, (rx, ry, rz) in rotations.items():
        pb = arm.pose.bones[bone]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)


def _new_action(arm, name):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    return act


def _author_idle(arm):
    _new_action(arm, "idle")
    # a shallow breath + tiny weight shift; loops 1->12 (12 == 1 pose, excluded as terminal dup on sample)
    _key(arm, 1, {"spine": (0, 0, 0), "armL": (0, 0, 0), "armR": (0, 0, 0), "head": (0, 0, 0)})
    _key(arm, 6, {"spine": (-2.5, 0, 0), "armL": (4, 0, 0), "armR": (4, 0, 0), "head": (1.5, 0, 0)})
    _key(arm, 12, {"spine": (0, 0, 0), "armL": (0, 0, 0), "armR": (0, 0, 0), "head": (0, 0, 0)})


def _author_walk(arm):
    _new_action(arm, "walk")
    # legs swing opposite; arms counter-swing the legs. loops 1->20 (21 == 1 pose).
    sw = 26  # leg swing degrees
    asw = 18  # arm swing degrees
    _key(arm, 1, {"legL": (sw, 0, 0), "legR": (-sw, 0, 0), "armL": (-asw, 0, 0), "armR": (asw, 0, 0), "spine": (3, 0, 0)})
    _key(arm, 6, {"legL": (0, 0, 0), "legR": (0, 0, 0), "armL": (0, 0, 0), "armR": (0, 0, 0), "spine": (3, 0, 0)})
    _key(arm, 11, {"legL": (-sw, 0, 0), "legR": (sw, 0, 0), "armL": (asw, 0, 0), "armR": (-asw, 0, 0), "spine": (3, 0, 0)})
    _key(arm, 16, {"legL": (0, 0, 0), "legR": (0, 0, 0), "armL": (0, 0, 0), "armR": (0, 0, 0), "spine": (3, 0, 0)})
    _key(arm, 21, {"legL": (sw, 0, 0), "legR": (-sw, 0, 0), "armL": (-asw, 0, 0), "armR": (asw, 0, 0), "spine": (3, 0, 0)})


def _author_attack(arm):
    _new_action(arm, "attack")
    # raise the bat (armR back/up) then swing down/forward; settle. non-looping 1->16, terminal included.
    _key(arm, 1, {"armR": (0, 0, 0), "spine": (0, 0, 0), "armL": (0, 0, 0)})
    _key(arm, 5, {"armR": (-120, 0, 0), "spine": (0, 0, -8), "armL": (-10, 0, 0)})   # wind up overhead
    _key(arm, 9, {"armR": (75, 0, 0), "spine": (0, 0, 10), "armL": (10, 0, 0)})       # swing through
    _key(arm, 12, {"armR": (95, 0, 0), "spine": (0, 0, 6), "armL": (6, 0, 0)})        # follow-through
    _key(arm, 16, {"armR": (0, 0, 0), "spine": (0, 0, 0), "armL": (0, 0, 0)})         # settle


def build_thug():
    """Build the placeholder thug into the current scene. Returns (arm_obj, mesh_obj, action_names)."""
    _reset_scene()
    parts = _build_parts()
    mesh = _join_with_groups(parts)
    arm = _build_armature()
    _bind(mesh, arm)
    _author_idle(arm)
    _author_walk(arm)
    _author_attack(arm)
    # leave the rig on the idle action at frame 1
    arm.animation_data.action = bpy.data.actions["idle"]
    bpy.context.scene.frame_set(1)
    return arm, mesh, ["idle", "walk", "attack"]


def _argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


if __name__ == "__main__":
    args = _argv_after_dashes()
    arm, mesh, actions = build_thug()
    print("BLOCKOUT_OK actions=%s parts_joined_into=%s" % (",".join(actions), mesh.name))
    if "--save" in args:
        out = args[args.index("--save") + 1]
        bpy.ops.wm.save_as_mainfile(filepath=out)
        print("BLOCKOUT_SAVED %s" % out)
