// Usage: node scripts/inspect-model.mjs <file.glb>
// Prints node tree with mesh/material names, vertex counts and world bbox.
import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const f = (v) => v.map((x) => x.toFixed(4)).join(",");
function walk(node, depth) {
  const mesh = node.getMesh();
  let info = "";
  if (mesh) {
    const prims = mesh.listPrimitives().map((p) => {
      const n = p.getAttribute("POSITION")?.getCount() ?? 0;
      return `${p.getMaterial()?.getName() ?? "-"}(${n})`;
    });
    const b = getBounds(node);
    info = ` [mesh ${mesh.getName()}] ${prims.join(" ")} bbox(${f(b.min)} | ${f(b.max)})`;
  }
  console.log("  ".repeat(depth) + node.getName() + info);
  node.listChildren().forEach((c) => walk(c, depth + 1));
}
for (const s of root.listScenes()) s.listChildren().forEach((n) => walk(n, 0));
console.log("\nMATERIALS:");
for (const m of root.listMaterials()) {
  const t = m.getBaseColorTexture();
  console.log(" ", m.getName(), "color", f(m.getBaseColorFactor()), "tex", t?.getURI() || t?.getName() || "-", "metal", m.getMetallicFactor(), "rough", m.getRoughnessFactor());
}
console.log("\nTEXTURES:", root.listTextures().map((t) => `${t.getURI() || t.getName()}(${t.getImage()?.byteLength ?? 0})`).join(" "));
