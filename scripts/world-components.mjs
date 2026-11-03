// Usage: node scripts/world-components.mjs <glb> <meshSubstr>
// Connected components (welded by position) of a mesh, in WORLD space metres (×100).
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
const [file, sub] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).read(file);
const node = doc.getRoot().listNodes().find((n) => n.getMesh()?.getName().includes(sub));
const m = node.getWorldMatrix();
const prim = node.getMesh().listPrimitives()[0];
const lp = prim.getAttribute("POSITION").getArray(), idx = prim.getIndices().getArray();
const n = lp.length / 3, pos = new Float32Array(lp.length);
for (let i = 0; i < n; i++) { const [x, y, z] = [lp[i*3], lp[i*3+1], lp[i*3+2]]; for (let a = 0; a < 3; a++) pos[i*3+a] = (m[a]*x + m[4+a]*y + m[8+a]*z + m[12+a]) * 100; }
const km = new Map(), w = new Int32Array(n);
for (let i = 0; i < n; i++) { const k = `${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`; if (!km.has(k)) km.set(k, i); w[i] = km.get(k); }
const par = Int32Array.from({ length: n }, (_, i) => i); const f = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
for (let t = 0; t < idx.length; t += 3) for (const j of [1, 2]) { const a = f(w[idx[t]]), b = f(w[idx[t+j]]); if (a !== b) par[a] = b; }
const comps = new Map();
for (let t = 0; t < idx.length; t += 3) { const r = f(w[idx[t]]); let c = comps.get(r); if (!c) comps.set(r, c = { tris: 0, min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] }); c.tris++; for (let j = 0; j < 3; j++) for (let a = 0; a < 3; a++) { const p = pos[idx[t+j]*3+a]; c.min[a] = Math.min(c.min[a], p); c.max[a] = Math.max(c.max[a], p); } }
const fm = (v) => v.map((x) => x.toFixed(3).padStart(7)).join(" ");
console.log("world matrix", [...m].map((x) => +x.toFixed(4)).join(","));
[...comps.values()].sort((a, b) => b.tris - a.tris).forEach((c, i) => console.log(String(i).padStart(3), String(c.tris).padStart(5), "min", fm(c.min), "max", fm(c.max)));
