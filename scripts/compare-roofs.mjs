// Compares the roof top profile (x≈0) of our model and the JCW reference to align the spoiler.
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
async function pts(file, meshSub, scale) {
  const doc = await io.read(file);
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !meshSub.some((s) => node.getName().includes(s) || node.getMesh().getName().includes(s))) continue;
    const m = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) {
      const p = prim.getAttribute("POSITION").getArray();
      for (let i = 0; i < p.length; i += 3) out.push([0, 1, 2].map((a) => (m[a] * p[i] + m[4 + a] * p[i + 1] + m[8 + a] * p[i + 2] + m[12 + a]) * scale));
    }
  }
  return out;
}
const ours = await pts("public/models/f56.glb", ["roof", "sunroof", "spoiler"], 1);
const jcw = await pts("assets-src/jcw-2018/2018_mini_john_cooper_works.glb", ["Color_2"], 100);
const top = (P, z) => { const s = P.filter((p) => Math.abs(p[0]) < 0.06 && Math.abs(p[2] - z) < 0.02); return s.length ? Math.max(...s.map((p) => p[1])).toFixed(3) : "  -  "; };
const halfW = (P, z) => { const s = P.filter((p) => Math.abs(p[2] - z) < 0.02 && p[1] > 1.25); return s.length ? Math.max(...s.map((p) => Math.abs(p[0]))).toFixed(3) : "  -  "; };
console.log("   z   ours_y  jcw_y   ours_w  jcw_w");
for (let z = -1.0; z >= -1.62; z -= 0.04) console.log(z.toFixed(2), " ", top(ours, z), " ", top(jcw, z), " ", halfW(ours, z), " ", halfW(jcw, z));
