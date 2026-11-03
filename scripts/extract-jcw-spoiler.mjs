// Cuts the roof spoiler out of the 2018 JCW reference model (assets-src/jcw-2018) into
// assets-src/jcw-2018/spoiler.glb: every triangle behind the roof's rear edge and above
// the rear window, from the given meshes, in WORLD space metres (Y up, +Z front).
//
//   node scripts/extract-jcw-spoiler.mjs [zMax=-1.30] [yMin=1.18]
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
const zMax = Number(process.argv[2] ?? -1.30), yMin = Number(process.argv[3] ?? 1.18);
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const src = await io.read("assets-src/jcw-2018/2018_mini_john_cooper_works.glb");
const out = new Document(); const buf = out.createBuffer(); const scene = out.createScene();
for (const node of src.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const lp = prim.getAttribute("POSITION").getArray(), idx = prim.getIndices().getArray();
    const ln = prim.getAttribute("NORMAL")?.getArray();
    const P = [], N = [], I = [], remap = new Map();
    const world = (i) => [0, 1, 2].map((a) => (m[a] * lp[i*3] + m[4+a] * lp[i*3+1] + m[8+a] * lp[i*3+2] + m[12+a]) * 100);
    const wn = (i) => { const v = [0, 1, 2].map((a) => m[a] * ln[i*3] + m[4+a] * ln[i*3+1] + m[8+a] * ln[i*3+2]); const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    for (let t = 0; t < idx.length; t += 3) {
      const vs = [idx[t], idx[t+1], idx[t+2]], ws = vs.map(world);
      if (!ws.every((p) => p[2] < zMax && p[1] > yMin && Math.abs(p[0]) < 0.62)) continue;
      for (let j = 0; j < 3; j++) {
        if (!remap.has(vs[j])) { remap.set(vs[j], P.length / 3); P.push(...ws[j]); if (ln) N.push(...wn(vs[j])); }
        I.push(remap.get(vs[j]));
      }
    }
    if (!I.length) continue;
    const name = `${mesh.getName()}`.replace(/^LOD0_[^:]*:/, "").slice(0, 60);
    const p = out.createPrimitive()
      .setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buf))
      .setIndices(out.createAccessor().setType("SCALAR").setArray(new Uint32Array(I)).setBuffer(buf))
      .setMaterial(out.createMaterial(prim.getMaterial()?.getName() ?? "m").setBaseColorFactor([0.5, 0.5, 0.5, 1]));
    if (ln) p.setAttribute("NORMAL", out.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buf));
    const n = out.createNode(name).setMesh(out.createMesh(name).addPrimitive(p)).setExtras({ part: name });
    scene.addChild(n);
    const xs = P.filter((_, i) => i % 3 === 0), ys = P.filter((_, i) => i % 3 === 1), zs = P.filter((_, i) => i % 3 === 2);
    console.log(name.padEnd(48), "tris", String(I.length / 3).padStart(5), "x", Math.min(...xs).toFixed(3), Math.max(...xs).toFixed(3), "y", Math.min(...ys).toFixed(3), Math.max(...ys).toFixed(3), "z", Math.min(...zs).toFixed(3), Math.max(...zs).toFixed(3));
  }
}
await io.write("assets-src/jcw-2018/spoiler.glb", out);
