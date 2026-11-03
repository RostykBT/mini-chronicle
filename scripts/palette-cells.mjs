// Usage: node scripts/palette-cells.mjs <file.glb> <meshSubstr> <diffuse.png> <material.png>
// For each connected component of the mesh, report which 8x8 palette cells its UVs use.
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
const [file, sub, diffPath, matPath] = process.argv.slice(2);
const load = async (p) => { const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true }); return { data, info }; };
const diff = await load(diffPath), mat = await load(matPath);
const sample = (img, cx, cy) => { const { data, info } = img; const x = Math.floor((cx + 0.5) * info.width / 8), y = Math.floor((cy + 0.5) * info.height / 8); const o = (y * info.width + x) * info.channels; return [...data.slice(o, o + info.channels)]; };
const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
const doc = await new NodeIO().read(file);
const mesh = doc.getRoot().listMeshes().find((m) => m.getName().includes(sub));
const prim = mesh.listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray(), uv = prim.getAttribute("TEXCOORD_0").getArray(), idx = prim.getIndices().getArray();
const n = pos.length / 3, keyMap = new Map(), weld = new Int32Array(n);
for (let i = 0; i < n; i++) { const k = `${Math.round(pos[i*3]*1e6)},${Math.round(pos[i*3+1]*1e6)},${Math.round(pos[i*3+2]*1e6)}`; if (!keyMap.has(k)) keyMap.set(k, i); weld[i] = keyMap.get(k); }
const par = Int32Array.from({ length: n }, (_, i) => i); const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
for (let t = 0; t < idx.length; t += 3) for (const j of [1, 2]) { const a = find(weld[idx[t]]), b = find(weld[idx[t+j]]); if (a !== b) par[a] = b; }
const comps = new Map();
for (let t = 0; t < idx.length; t += 3) {
  const r = find(weld[idx[t]]); let c = comps.get(r); if (!c) comps.set(r, c = { tris: 0, cells: new Map(), min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] });
  c.tris++;
  let u = 0, v = 0; for (let j = 0; j < 3; j++) { const vi = idx[t+j]; u += uv[vi*2]/3; v += uv[vi*2+1]/3; for (let a = 0; a < 3; a++) { const p = pos[vi*3+a]*100; c.min[a] = Math.min(c.min[a], p); c.max[a] = Math.max(c.max[a], p); } }
  const cx = Math.min(7, Math.max(0, Math.floor(u * 8))), cy = Math.min(7, Math.max(0, Math.floor(v * 8)));
  const key = `${cx},${cy}`; c.cells.set(key, (c.cells.get(key) ?? 0) + 1);
}
const f = (v) => v.map((x) => x.toFixed(2).padStart(6)).join(" ");
[...comps.values()].sort((a, b) => b.tris - a.tris).forEach((c, i) => {
  const cells = [...c.cells.entries()].sort((a, b) => b[1] - a[1]).map(([k, cnt]) => { const [x, y] = k.split(",").map(Number); return `${k}:${cnt} d${hex(sample(diff, x, y))} m${hex(sample(mat, x, y))}`; });
  console.log(`${String(i).padStart(3)} tris ${String(c.tris).padStart(5)} min ${f(c.min)} max ${f(c.max)} | ${cells.join("  ")}`);
});
