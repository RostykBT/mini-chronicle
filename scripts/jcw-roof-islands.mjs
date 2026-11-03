// Raw-vertex (UV-seam) islands of the JCW roof/spoiler mesh, world space metres.
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
const doc = await new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).read("assets-src/jcw-2018/2018_mini_john_cooper_works.glb");
const node = doc.getRoot().listNodes().find((n) => n.getMesh()?.getName().includes("Color_2"));
const m = node.getWorldMatrix(), prim = node.getMesh().listPrimitives()[0];
const lp = prim.getAttribute("POSITION").getArray(), idx = prim.getIndices().getArray();
const W = (i) => [0, 1, 2].map((a) => (m[a] * lp[i*3] + m[4+a] * lp[i*3+1] + m[8+a] * lp[i*3+2] + m[12+a]) * 100);
const par = Int32Array.from({ length: lp.length / 3 }, (_, i) => i); const f = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
for (let t = 0; t < idx.length; t += 3) for (const j of [1, 2]) { const a = f(idx[t]), b = f(idx[t+j]); if (a !== b) par[a] = b; }
const isl = new Map();
for (let t = 0; t < idx.length; t += 3) { const r = f(idx[t]); let c = isl.get(r); if (!c) isl.set(r, c = { tris: 0, min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] }); c.tris++; for (let j = 0; j < 3; j++) { const p = W(idx[t+j]); for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], p[a]); c.max[a] = Math.max(c.max[a], p[a]); } } }
const fm = (v) => v.map((x) => x.toFixed(3).padStart(7)).join(" ");
[...isl.values()].sort((a, b) => b.tris - a.tris).forEach((c, i) => console.log(String(i).padStart(3), String(c.tris).padStart(5), "min", fm(c.min), "max", fm(c.max)));
