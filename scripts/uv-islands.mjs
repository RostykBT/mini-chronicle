// Usage: node scripts/uv-islands.mjs <glb> <meshSubstr> <x> <y> <z>
// For the position-connected component containing the triangle nearest (x,y,z) [metres],
// list its UV islands (raw vertex connectivity) with UV bbox, tri count and 3D bbox.
import { NodeIO } from "@gltf-transform/core";
const [file, sub, px, py, pz] = process.argv.slice(2);
const doc = await new NodeIO().read(file);
const prim = doc.getRoot().listMeshes().find((m) => m.getName().includes(sub)).listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray(), uv = prim.getAttribute("TEXCOORD_0").getArray(), idx = prim.getIndices().getArray();
const T = idx.length / 3;
const uf = (n) => { const p = Int32Array.from({ length: n }, (_, i) => i); const f = (a) => { while (p[a] !== a) a = p[a] = p[p[a]]; return a; }; return { f, u: (a, b) => { a = f(a); b = f(b); if (a !== b) p[a] = b; } }; };
// position components
const n = pos.length / 3, km = new Map(), w = new Int32Array(n);
for (let i = 0; i < n; i++) { const k = `${Math.round(pos[i*3]*1e6)},${Math.round(pos[i*3+1]*1e6)},${Math.round(pos[i*3+2]*1e6)}`; if (!km.has(k)) km.set(k, i); w[i] = km.get(k); }
const P = uf(n), U = uf(n);
for (let t = 0; t < T; t++) for (const j of [1, 2]) { P.u(w[idx[t*3]], w[idx[t*3+j]]); U.u(idx[t*3], idx[t*3+j]); }
let best = 1e9, bt = 0;
for (let t = 0; t < T; t++) { let d = 0; for (let a = 0; a < 3; a++) d += (((pos[idx[t*3]*3+a] + pos[idx[t*3+1]*3+a] + pos[idx[t*3+2]*3+a]) / 3) * 100 - [px, py, pz][a]) ** 2; if (d < best) { best = d; bt = t; } }
const comp = P.f(w[idx[bt*3]]);
const isl = new Map();
for (let t = 0; t < T; t++) {
  if (P.f(w[idx[t*3]]) !== comp) continue;
  const r = U.f(idx[t*3]); let c = isl.get(r); if (!c) isl.set(r, c = { tris: 0, uv: [1e9, 1e9, -1e9, -1e9], min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] });
  c.tris++;
  for (let j = 0; j < 3; j++) { const v = idx[t*3+j]; c.uv[0] = Math.min(c.uv[0], uv[v*2]); c.uv[1] = Math.min(c.uv[1], uv[v*2+1]); c.uv[2] = Math.max(c.uv[2], uv[v*2]); c.uv[3] = Math.max(c.uv[3], uv[v*2+1]); for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], pos[v*3+a]*100); c.max[a] = Math.max(c.max[a], pos[v*3+a]*100); } }
}
const f = (v) => v.map((x) => x.toFixed(2)).join(",");
[...isl.values()].sort((a, b) => b.tris - a.tris).forEach((c, i) => console.log(i, "tris", c.tris, "uv", f(c.uv), "min", f(c.min), "max", f(c.max)));
