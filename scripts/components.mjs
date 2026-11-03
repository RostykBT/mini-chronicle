// Usage: node scripts/components.mjs <file.glb> <meshNameSubstring>
// Splits each primitive of a mesh into connected components (welded by position)
// and prints bbox (scaled x100 => metres) + triangle count for each.
import { NodeIO } from "@gltf-transform/core";
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const mesh = doc.getRoot().listMeshes().find((m) => m.getName().includes(process.argv[3]));
for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const n = pos.length / 3;
  // weld by quantised position
  const key = new Map(); const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i*3]*1e6)},${Math.round(pos[i*3+1]*1e6)},${Math.round(pos[i*3+2]*1e6)}`;
    if (!key.has(k)) key.set(k, i); weld[i] = key.get(k);
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { uni(weld[idx[t]], weld[idx[t+1]]); uni(weld[idx[t]], weld[idx[t+2]]); }
  const comps = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(weld[idx[t]]);
    let c = comps.get(r); if (!c) comps.set(r, c = { tris: 0, min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] });
    c.tris++;
    for (let j = 0; j < 3; j++) { const v = idx[t+j]; for (let a = 0; a < 3; a++) { const p = pos[v*3+a]*100; c.min[a] = Math.min(c.min[a], p); c.max[a] = Math.max(c.max[a], p); } }
  }
  const list = [...comps.values()].sort((a, b) => b.tris - a.tris);
  console.log(`\n== ${prim.getMaterial()?.getName()} : ${list.length} components, ${idx.length/3} tris`);
  const f = (v) => v.map((x) => x.toFixed(2).padStart(6)).join(" ");
  list.forEach((c, i) => console.log(`${String(i).padStart(3)} tris ${String(c.tris).padStart(5)}  min ${f(c.min)}  max ${f(c.max)}`));
}
