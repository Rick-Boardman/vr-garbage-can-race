# Higher-quality prop meshes for Garbage Can Race.
# Blender is Z-up. Three is Y-up, local forward is -Z.
# A Blender +Y point becomes Three -Z (the nose and the vehicle front).
# Run inside Blender: exec(open(this file).read()).

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(r"E:\projects\nexus\vr\garbage-can-race")
JS_PATH = ROOT / "src" / "prop-geometry.js"

NAMES = (
    "head", "hair", "soft", "crisp", "ellipsoid", "crown", "trunk",
    "wheel", "sedan", "truck", "bus",
)


def collection():
    name = "GCR props"
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def replace_object(col, name):
    old = bpy.data.objects.get(name)
    if old is not None:
        mesh = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return obj


def shade(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            continue
        if edge.calc_face_angle() > math.radians(50):
            edge.smooth = False


def finish(bm, obj):
    shade(bm)
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()


def three_arrays(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    positions = []
    normals = []
    # (x, y, z) -> (x, z, -y) is a rotation, so Blender's winding stays the
    # front face. Swapping an edge here turned every mesh inside out.
    for tri in mesh.loop_triangles:
        for index in tri.loops:
            loop = mesh.loops[index]
            co = mesh.vertices[loop.vertex_index].co
            normal = loop.normal
            positions.extend((co.x, co.z, -co.y))
            normals.extend((normal.x, normal.z, -normal.y))
    assert_outward(positions, normals, obj.name)
    return positions, normals


def assert_outward(positions, normals, kind):
    worst = 1.0
    for index in range(0, len(positions), 9):
        ax, ay, az = positions[index:index + 3]
        bx, by, bz = positions[index + 3:index + 6]
        cx, cy, cz = positions[index + 6:index + 9]
        abx, aby, abz = bx - ax, by - ay, bz - az
        acx, acy, acz = cx - ax, cy - ay, cz - az
        nx = aby * acz - abz * acy
        ny = abz * acx - abx * acz
        nz = abx * acy - aby * acx
        length = math.hypot(nx, ny, nz) or 1.0
        anx = (normals[index] + normals[index + 3] + normals[index + 6]) / 3
        any_ = (normals[index + 1] + normals[index + 4] + normals[index + 7]) / 3
        anz = (normals[index + 2] + normals[index + 5] + normals[index + 8]) / 3
        dot = (nx * anx + ny * any_ + nz * anz) / length
        if dot < worst:
            worst = dot
    if worst < 0.2:
        raise RuntimeError(f"{kind} winding faces inward ({worst:.3f})")


def bridge(bm, lower, upper):
    count = len(lower)
    for index in range(count):
        nxt = (index + 1) % count
        bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))


def beveled_cube(bm, offset, segments):
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(
        bm,
        geom=list(bm.edges),
        offset=offset,
        segments=segments,
        affect="EDGES",
        profile=0.6,
    )


def build_soft(col):
    obj = replace_object(col, "gcr-soft")
    bm = bmesh.new()
    beveled_cube(bm, 0.14, 2)
    finish(bm, obj)
    return obj


def build_crisp(col):
    obj = replace_object(col, "gcr-crisp")
    bm = bmesh.new()
    beveled_cube(bm, 0.04, 1)
    finish(bm, obj)
    return obj


def build_ellipsoid(col):
    obj = replace_object(col, "gcr-ellipsoid")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    finish(bm, obj)
    return obj


def deform_head(co, ears=True):
    # Nose toward Blender +Y, which the game sees as -Z.
    if co.y > 0.25 and abs(co.x) < 0.28 and -0.2 < co.z < 0.28:
        co.y += 0.34 * ((co.y - 0.25) / 0.7)
        co.x *= 0.82
    if co.y > 0.2 and abs(co.x) < 0.5 and 0.18 < co.z < 0.5:
        co.y += 0.08
    if co.z < -0.25:
        co.z -= 0.06
        co.y += 0.04
    if ears and abs(co.x) > 0.62 and abs(co.z) < 0.28 and abs(co.y) < 0.4:
        co.x += math.copysign(0.16, co.x)
        co.y *= 0.55
        co.z *= 0.85


def build_head(col):
    obj = replace_object(col, "gcr-head")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=12, radius=0.9)
    for vert in bm.verts:
        deform_head(vert.co)
    finish(bm, obj)
    return obj


def build_hair(col):
    obj = replace_object(col, "gcr-hair")
    bm = bmesh.new()
    # The head's cranium, grown by one hair thickness along the outward normal.
    # Ears stay on the head so they poke through a short cut. Blender +Y is the face.
    bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=12, radius=0.9)
    for vert in bm.verts:
        deform_head(vert.co, ears=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    for vert in bm.verts:
        vert.co += vert.normal * 0.06
    # Opening stops just above the brow. The underside of the skull stays bare.
    delete = [
        vert for vert in bm.verts
        if (vert.co.y > 0.15 and vert.co.z < 0.36) or vert.co.z < -0.38
    ]
    if delete:
        bmesh.ops.delete(bm, geom=delete, context="VERTS")
    finish(bm, obj)
    return obj


def build_crown(col):
    obj = replace_object(col, "gcr-crown")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
    for index, vert in enumerate(bm.verts):
        wobble = 0.08 * math.sin(index * 2.3) + 0.05 * math.cos(index * 1.7)
        vert.co += vert.co.normalized() * wobble
    finish(bm, obj)
    return obj


def build_trunk(col):
    obj = replace_object(col, "gcr-trunk")
    bm = bmesh.new()
    segs = 10
    profile = [(-0.5, 0.30), (-0.32, 0.24), (0.05, 0.18), (0.5, 0.16)]
    rings = []
    for z, radius in profile:
        ring = []
        for index in range(segs):
            angle = (index / segs) * math.tau
            ring.append(bm.verts.new((math.cos(angle) * radius, math.sin(angle) * radius, z)))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        bridge(bm, lower, upper)
    bottom = bm.verts.new((0.0, 0.0, -0.5))
    top = bm.verts.new((0.0, 0.0, 0.5))
    for index in range(segs):
        nxt = (index + 1) % segs
        bm.faces.new((bottom, rings[0][index], rings[0][nxt]))
        bm.faces.new((top, rings[-1][nxt], rings[-1][index]))
    finish(bm, obj)
    return obj


def build_wheel(col):
    obj = replace_object(col, "gcr-wheel")
    bm = bmesh.new()
    segs = 22
    profile = [
        (-0.12, 0.22),
        (-0.09, 0.31),
        (-0.045, 0.345),
        (0.0, 0.328),
        (0.045, 0.345),
        (0.09, 0.31),
        (0.12, 0.22),
    ]
    rings = []
    for z, radius in profile:
        ring = []
        for index in range(segs):
            angle = (index / segs) * math.tau
            bump = 1 + 0.012 * math.sin(angle * 8)
            ring.append(bm.verts.new((math.cos(angle) * radius * bump, math.sin(angle) * radius * bump, z)))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        bridge(bm, lower, upper)
    for cap, ring, flip in ((-0.12, rings[0], False), (0.12, rings[-1], True)):
        center = bm.verts.new((0.0, 0.0, cap))
        for index in range(segs):
            nxt = (index + 1) % segs
            if flip:
                bm.faces.new((center, ring[nxt], ring[index]))
            else:
                bm.faces.new((center, ring[index], ring[nxt]))
    finish(bm, obj)
    return obj


def loft(bm, sections, count=12):
    rings = []
    for y, hw, z0, z1 in sections:
        ring = []
        for index in range(count):
            angle = (index / count) * math.tau
            cosine = math.cos(angle)
            sine = math.sin(angle)
            x = math.copysign(abs(cosine) ** 0.42, cosine) * hw
            center = (z0 + z1) * 0.5
            half = (z1 - z0) * 0.5
            z = center + math.copysign(abs(sine) ** 0.42, sine) * half
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        bridge(bm, lower, upper)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return rings


def build_sedan(col):
    obj = replace_object(col, "gcr-sedan")
    bm = bmesh.new()
    # Blender +Y is the hood (Three -Z).
    loft(bm, [
        (-2.08, 0.74, 0.30, 0.50),
        (-1.72, 0.88, 0.32, 0.72),
        (-1.28, 0.76, 0.42, 0.78),
        (-0.85, 0.86, 0.34, 0.90),
        (-0.35, 0.74, 0.40, 1.22),
        (0.15, 0.72, 0.42, 1.24),
        (0.55, 0.78, 0.38, 1.16),
        (0.95, 0.90, 0.34, 0.86),
        (1.28, 0.76, 0.42, 0.80),
        (1.75, 0.88, 0.32, 0.76),
        (2.08, 0.72, 0.30, 0.52),
    ])
    finish(bm, obj)
    return obj


def build_truck(col):
    obj = replace_object(col, "gcr-truck")
    bm = bmesh.new()
    loft(bm, [
        (0.42, 0.98, 0.64, 1.58),
        (1.05, 1.02, 0.66, 1.74),
        (1.70, 0.98, 0.68, 1.62),
        (2.15, 0.94, 0.70, 1.20),
        (2.65, 0.92, 0.72, 1.12),
        (3.08, 0.86, 0.74, 1.02),
    ])
    finish(bm, obj)
    return obj


def build_bus(col):
    obj = replace_object(col, "gcr-bus")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((2.35, 9.5, 1.85)), verts=list(bm.verts))
    bmesh.ops.translate(bm, vec=Vector((0.0, -0.15, 1.48)), verts=list(bm.verts))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.07, segments=2, affect="EDGES", profile=0.5)
    finish(bm, obj)
    return obj


def extreme_normal(positions, normals, axis, find_max):
    # Triangle centers. A corner vertex shares a side face, so its normal is mixed.
    best_value = -1e9 if find_max else 1e9
    best_normal = None
    for index in range(0, len(positions), 9):
        value = (
            positions[index + axis]
            + positions[index + 3 + axis]
            + positions[index + 6 + axis]
        ) / 3
        normal = (
            normals[index + axis]
            + normals[index + 3 + axis]
            + normals[index + 6 + axis]
        ) / 3
        if (find_max and value > best_value) or (not find_max and value < best_value):
            best_value = value
            best_normal = normal
    return best_normal


def orientation_ok(positions, normals, kind):
    if kind in ("head", "sedan", "truck", "bus"):
        sample = extreme_normal(positions, normals, 2, False)
        return sample, sample is not None and sample < -0.25
    if kind == "hair":
        sample = extreme_normal(positions, normals, 2, True)
        return sample, sample is not None and sample > 0.25
    sample = extreme_normal(positions, normals, 0, True)
    return sample, sample is not None and sample > 0.25


def commit(obj, kind):
    positions, normals = three_arrays(obj)
    sample, ok = orientation_ok(positions, normals, kind)
    if not ok:
        # Split normals ignore Mesh.flip_normals(). Reverse the faces and shade again.
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        shade(bm)
        bm.to_mesh(mesh)
        bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = True
        mesh.update()
        positions, normals = three_arrays(obj)
        sample, ok = orientation_ok(positions, normals, kind)
    if not ok:
        raise RuntimeError(f"{kind} outward normal failed: {sample}")
    return {"positions": positions, "normals": normals, "normal": sample, "verts": len(positions) // 3}


def write_js(meshes):
    def array(values):
        return "new Float32Array([" + ",".join(f"{value:.5f}" for value in values) + "])"

    lines = [
        "// Generated by scripts/build_props.py. Do not edit by hand.",
        "// Y-up. Local -Z is the face, the hood, and the bus front.",
        "export const PROP_MESHES = {",
    ]
    for name in NAMES:
        payload = meshes[name]
        lines.append(f"  {name}: {{")
        lines.append(f"    positions: {array(payload['positions'])},")
        lines.append(f"    normals: {array(payload['normals'])},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    JS_PATH.write_text("\n".join(lines), encoding="utf-8")


def main():
    col = collection()
    objects = {
        "soft": build_soft(col),
        "crisp": build_crisp(col),
        "ellipsoid": build_ellipsoid(col),
        "head": build_head(col),
        "hair": build_hair(col),
        "crown": build_crown(col),
        "trunk": build_trunk(col),
        "wheel": build_wheel(col),
        "sedan": build_sedan(col),
        "truck": build_truck(col),
        "bus": build_bus(col),
    }
    meshes = {name: commit(obj, name) for name, obj in objects.items()}
    write_js(meshes)
    global result
    result = {name: {"verts": payload["verts"], "normal": round(payload["normal"], 3)} for name, payload in meshes.items()}


main()
