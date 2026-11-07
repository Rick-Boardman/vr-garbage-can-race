# Build the two garbage-can shells in Blender and write Three.js geometry.
# Blender is Z-up and faces -Y. The game is Y-up and faces -Z, and the chase
# camera sees the can's +Z face, so a Blender -Y point becomes Three +Z.
# Run inside Blender: exec(open(this file).read()).

import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(r"E:\projects\nexus\vr\garbage-can-race")
JS_PATH = ROOT / "src" / "can-geometry.js"
GLB_DIR = ROOT / "assets" / "cans"

SEGS = 32


def collection():
    name = "GCR cans"
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
        if edge.calc_face_angle() > math.radians(46):
            edge.smooth = False


def finish(bm, obj):
    shade(bm)
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()


def add_ring(bm, z, radius, segs):
    ring = []
    for index in range(segs):
        angle = (index / segs) * math.tau
        ring.append(bm.verts.new((math.cos(angle) * radius, math.sin(angle) * radius, z)))
    return ring


def bridge(bm, lower, upper):
    count = len(lower)
    for index in range(count):
        nxt = (index + 1) % count
        bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))


def add_torus(bm, center, major, minor, axis, major_segs=18, minor_segs=8, sweep=None):
    cx, cy, cz = center
    steps = major_segs if sweep is None else major_segs
    span = math.tau if sweep is None else sweep
    rings = []
    for major_index in range(steps + (0 if sweep is None else 1)):
        major_angle = (major_index / steps) * span
        ring = []
        for minor_index in range(minor_segs):
            minor_angle = (minor_index / minor_segs) * math.tau
            tube = major + minor * math.cos(minor_angle)
            along = minor * math.sin(minor_angle)
            if axis == "x":
                point = (cx + along, cy + math.cos(major_angle) * tube, cz + math.sin(major_angle) * tube)
            else:
                point = (cx + math.cos(major_angle) * tube, cy + math.sin(major_angle) * tube, cz + along)
            ring.append(bm.verts.new(point))
        rings.append(ring)
    pairs = len(rings) if sweep is None else len(rings) - 1
    for major_index in range(pairs):
        nxt = (major_index + 1) % len(rings)
        bridge(bm, rings[major_index], rings[nxt])


def build_round(col):
    obj = replace_object(col, "gcr-can-round")
    bm = bmesh.new()
    # A rolled galvanized can: foot, bead, waist, shoulder, neck.
    radii = [0.372, 0.40, 0.458, 0.442, 0.45, 0.434, 0.452, 0.466, 0.448, 0.47]
    heights = [0.0, 0.045, 0.11, 0.18, 0.32, 0.48, 0.64, 0.78, 0.88, 0.945]
    rings = [add_ring(bm, z, radius, SEGS) for z, radius in zip(heights, radii)]
    for lower, upper in zip(rings, rings[1:]):
        bridge(bm, lower, upper)
    center = bm.verts.new((0.0, 0.0, 0.02))
    for index in range(SEGS):
        nxt = (index + 1) % SEGS
        bm.faces.new((center, rings[0][nxt], rings[0][index]))
    add_torus(bm, (0.0, 0.0, 0.955), 0.458, 0.026, "z", 32, 8)
    # Side D-handles. They stay off the +Z logo face (Blender -Y).
    for side in (-1, 1):
        add_torus(bm, (side * 0.50, 0.0, 0.74), 0.105, 0.016, "x", 16, 8)
        add_torus(bm, (side * 0.455, 0.0, 0.84), 0.02, 0.012, "x", 8, 6)
        add_torus(bm, (side * 0.455, 0.0, 0.64), 0.02, 0.012, "x", 8, 6)
    finish(bm, obj)
    return obj


def build_square(col):
    obj = replace_object(col, "gcr-can-square")
    bm = bmesh.new()
    height = 0.96
    half = 0.43
    thick = 0.05
    inner = half - thick

    def loop(z, h):
        return [
            bm.verts.new((-h, -h, z)),
            bm.verts.new((h, -h, z)),
            bm.verts.new((h, h, z)),
            bm.verts.new((-h, h, z)),
        ]

    outer_bottom = loop(0.0, half)
    outer_top = loop(height, half + 0.012)
    inner_bottom = loop(0.025, inner)
    inner_top = loop(height - 0.01, inner - 0.01)
    bridge(bm, outer_bottom, outer_top)
    bridge(bm, inner_top, inner_bottom)
    bridge(bm, outer_top, inner_top)
    bm.faces.new((inner_bottom[0], inner_bottom[1], inner_bottom[2], inner_bottom[3]))
    vertical = [
        edge for edge in bm.edges
        if abs(edge.verts[0].co.z - edge.verts[1].co.z) > 0.5
        and max(abs(edge.verts[0].co.x), abs(edge.verts[0].co.y)) > 0.40
    ]
    top = [
        edge for edge in bm.edges
        if abs(edge.verts[0].co.z - height) < 0.02 and abs(edge.verts[1].co.z - height) < 0.02
        and max(abs(edge.verts[0].co.x), abs(edge.verts[0].co.y)) > 0.40
    ]
    bmesh.ops.bevel(bm, geom=vertical + top, offset=0.028, segments=3, affect="EDGES", profile=0.55)
    for side in (-1, 1):
        add_torus(bm, (side * 0.50, 0.0, 0.74), 0.10, 0.016, "x", 16, 8)
    finish(bm, obj)
    return obj


def three_arrays(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    positions = []
    normals = []
    # (x, y, z) -> (x, z, -y) is a rotation, so Blender's winding stays the
    # front face. Swapping an edge here turned the shell inside out.
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


def logo_z(positions):
    # Triangle centers. A flat wall keeps its vertices out at the corners.
    best = 0.35
    for index in range(0, len(positions), 9):
        cx = (positions[index] + positions[index + 3] + positions[index + 6]) / 3
        cy = (positions[index + 1] + positions[index + 4] + positions[index + 7]) / 3
        cz = (positions[index + 2] + positions[index + 5] + positions[index + 8]) / 3
        if abs(cx) < 0.22 and 0.30 < cy < 0.82 and cz > best:
            best = cz
    return best


def write_js(shells):
    def array(values):
        body = ",".join(f"{value:.5f}" for value in values)
        return f"new Float32Array([{body}])"

    lines = [
        "// Generated by scripts/build_cans.py. Do not edit by hand.",
        "// Y-up. Local -Z points down the road. The logo face is +Z,",
        "// which is the side the chase camera sees.",
        "export const CAN_SHELLS = {",
    ]
    for name, payload in shells.items():
        lines.append(f"  {name}: {{")
        lines.append(f"    logoZ: {payload['logoZ']:.5f},")
        lines.append(f"    positions: {array(payload['positions'])},")
        lines.append(f"    normals: {array(payload['normals'])},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    JS_PATH.write_text("\n".join(lines), encoding="utf-8")


def export_glb(objects, filename):
    GLB_DIR.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = GLB_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
    )
    return str(path)


def face_normal_z(positions, normals):
    # Sample triangle centers. A flat wall only has vertices at its corners.
    best = None
    best_z = -1e9
    for index in range(0, len(positions), 9):
        cx = (positions[index] + positions[index + 3] + positions[index + 6]) / 3
        cy = (positions[index + 1] + positions[index + 4] + positions[index + 7]) / 3
        cz = (positions[index + 2] + positions[index + 5] + positions[index + 8]) / 3
        nz = (normals[index + 2] + normals[index + 5] + normals[index + 8]) / 3
        if abs(cx) < 0.22 and 0.30 < cy < 0.82 and cz > best_z:
            best_z = cz
            best = nz
    return best


def main():
    col = collection()
    round_can = build_round(col)
    square_can = build_square(col)
    shells = {}
    report = {}
    for name, obj in ("round", round_can), ("square", square_can):
        positions, normals = three_arrays(obj)
        outward = face_normal_z(positions, normals)
        if outward is None or outward < 0.35:
            raise RuntimeError(f"{name} logo face normal Z is {outward}")
        shells[name] = {
            "positions": positions,
            "normals": normals,
            "logoZ": logo_z(positions),
        }
        report[name] = {
            "verts": len(positions) // 3,
            "logoZ": shells[name]["logoZ"],
            "normalZ": outward,
        }
    write_js(shells)
    report["roundGlb"] = export_glb([round_can], "round.glb")
    report["squareGlb"] = export_glb([square_can], "square.glb")
    global result
    result = report


main()
