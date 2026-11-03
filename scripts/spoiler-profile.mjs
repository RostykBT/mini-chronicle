// Prints the side profile (z,y in metres) of the current spoiler near x=0 and its plan outline.
import { NodeIO } from "@gltf-transform/core";
const doc = await new NodeIO().read("public/models/f56.glb");
const node = doc.getRoot().listNodes().find((n) => n.getName() === "spoiler");
const prim = node.getMesh().listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const pts = [];
for (let i = 0; i < pos.length; i += 3) pts.push([pos[i] * 100, pos[i + 1] * 100, pos[i + 2] * 100]);
const mid = pts.filter((p) => Math.abs(p[0]) < 0.03).sort((a, b) => a[2] - b[2]);
console.log("centre section (z, y):");
for (const p of mid) console.log(p[2].toFixed(3), p[1].toFixed(3));
// plan outline: for z slices, max |x|
console.log("plan (z -> max|x|):");
for (let z = -1.6; z <= -1.3; z += 0.03) {
  const s = pts.filter((p) => Math.abs(p[2] - z) < 0.015);
  if (s.length) console.log(z.toFixed(2), Math.max(...s.map((p) => Math.abs(p[0]))).toFixed(3), "y", Math.min(...s.map((p) => p[1])).toFixed(3), Math.max(...s.map((p) => p[1])).toFixed(3));
}
// side end: for x near max, list (z,y)
const xmax = Math.max(...pts.map((p) => Math.abs(p[0])));
console.log("xmax", xmax.toFixed(3), "verts", pts.length);
