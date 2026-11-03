// Lists UV islands of the contrast-paint roof (Paint_Geo primitive 1, biggest component).
import { NodeIO } from "@gltf-transform/core";
const doc = await new NodeIO().read("assets-src/f56-raw.glb");
const prim = doc.getRoot().listMeshes().find((m) => m.getName().includes("Paint_Geo")).listPrimitives()[1];
const pos = prim.getAttribute("POSITION").getArray(), uv = prim.getAttribute("TEXCOORD_0")?.getArray(), nrm = prim.getAttribute("NORMAL").getArray(), idx = prim.getIndices().getArray();
const T = idx.length / 3;
const par = Int32Array.from({ length: pos.length / 3 }, (_, i) => i);
const f = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
for (let t = 0; t < T; t++) for (const j of [1, 2]) { const a = f(idx[t*3]), b = f(idx[t*3+j]); if (a !== b) par[a] = b; }
const isl = new Map();
for (let t = 0; t < T; t++) {
  const r = f(idx[t*3]); let c = isl.get(r); if (!c) isl.set(r, c = { tris: 0, min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9], ny: 0 });
  c.tris++;
  for (let j = 0; j < 3; j++) { const v = idx[t*3+j]; c.ny += nrm[v*3+1] / 3; for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], pos[v*3+a]*100); c.max[a] = Math.max(c.max[a], pos[v*3+a]*100); } }
}
const fm = (v) => v.map((x) => x.toFixed(2)).join(",");
console.log("has uv", !!uv);
[...isl.values()].sort((a, b) => b.tris - a.tris).forEach((c, i) => console.log(i, c.tris, "min", fm(c.min), "max", fm(c.max), "ny", (c.ny / c.tris).toFixed(2)));
