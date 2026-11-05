// Open road ribbons. Winding is counter-clockwise from above so the normal points up.
// Triangle order per span: (left, right, nextLeft) then (right, nextRight, nextLeft).

export function buildRibbon(edges) {
  const count = edges.length;
  const positions = new Float32Array(count * 6);
  const indices = new Uint32Array(Math.max(0, count - 1) * 6);
  for (let index = 0; index < count; index += 1) {
    const edge = edges[index];
    const offset = index * 6;
    positions[offset] = edge.lx;
    positions[offset + 1] = edge.ly;
    positions[offset + 2] = edge.lz;
    positions[offset + 3] = edge.rx;
    positions[offset + 4] = edge.ry;
    positions[offset + 5] = edge.rz;
  }
  let cursor = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const base = index * 2;
    indices[cursor++] = base;
    indices[cursor++] = base + 1;
    indices[cursor++] = base + 2;
    indices[cursor++] = base + 1;
    indices[cursor++] = base + 3;
    indices[cursor++] = base + 2;
  }
  return { positions, indices };
}

export function edgesAlong(samples, leftOf, rightOf, lift = 0) {
  const leftFn = typeof leftOf === "function" ? leftOf : () => leftOf;
  const rightFn = typeof rightOf === "function" ? rightOf : () => rightOf;
  return samples.map((sample) => {
    const left = leftFn(sample);
    const right = rightFn(sample);
    return {
      lx: sample.x + sample.right.x * left,
      ly: sample.y + lift,
      lz: sample.z + sample.right.z * left,
      rx: sample.x + sample.right.x * right,
      ry: sample.y + lift,
      rz: sample.z + sample.right.z * right,
    };
  });
}

export function firstTriangleNormal(positions, indices) {
  const ia = indices[0] * 3;
  const ib = indices[1] * 3;
  const ic = indices[2] * 3;
  const e1x = positions[ib] - positions[ia];
  const e1y = positions[ib + 1] - positions[ia + 1];
  const e1z = positions[ib + 2] - positions[ia + 2];
  const e2x = positions[ic] - positions[ia];
  const e2y = positions[ic + 1] - positions[ia + 1];
  const e2z = positions[ic + 2] - positions[ia + 2];
  return {
    x: e1y * e2z - e1z * e2y,
    y: e1z * e2x - e1x * e2z,
    z: e1x * e2y - e1y * e2x,
  };
}

export function ribbonGeometry(THREE, edges) {
  const { positions, indices } = buildRibbon(edges);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function checkRibbonFacesUp() {
  const errors = [];
  const flat = buildRibbon([
    { lx: -2, ly: 0, lz: 0, rx: 2, ry: 0, rz: 0 },
    { lx: -2, ly: 0, lz: -4, rx: 2, ry: 0, rz: -4 },
  ]);
  const flatNormal = firstTriangleNormal(flat.positions, flat.indices);
  if (flatNormal.y <= 0) errors.push(`flat ribbon normal y=${flatNormal.y}`);
  const sloped = buildRibbon([
    { lx: -2, ly: 1, lz: 0, rx: 2, ry: 1, rz: 0 },
    { lx: -2, ly: 0.6, lz: -4, rx: 2, ry: 0.6, rz: -4 },
  ]);
  const slopedNormal = firstTriangleNormal(sloped.positions, sloped.indices);
  if (slopedNormal.y <= 0) errors.push(`sloped ribbon normal y=${slopedNormal.y}`);
  return errors;
}
