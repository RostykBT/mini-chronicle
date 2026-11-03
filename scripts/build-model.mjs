// Builds public/models/f56.glb from the raw FBX2glTF conversion.
//
//   node scripts/build-model.mjs [in=assets-src/f56-raw.glb] [out=public/models/f56.glb]
//
// What it does:
//  1. Scales the model to metres (the source is 1/100) and names everything.
//  2. Splits the single body-paint mesh into wrap panels (hood, doors, fenders, …).
//  3. Splits the contrast-paint mesh into roof / mirror caps / spoiler.
//  4. Pulls every chrome triangle (palette cell 5,0) out of the trim mesh into
//     separately-named chrome parts, so they can be "dechromed".
// Every recolourable part gets its own material and an `extras.part` id that the app
// uses to look it up. Coordinates: +Y up, +Z = front, +X = car's left side.

import { NodeIO } from "@gltf-transform/core";
import { prune, dedup, compactPrimitive, weld } from "@gltf-transform/functions";
import path from "node:path";
import fs from "node:fs";

const IN = process.argv[2] ?? "assets-src/f56-raw.glb";
const OUT = process.argv[3] ?? "public/models/f56.glb";
const SCALE = 100;
/** Reference model for the sport roof spoiler (see loadJcwSpoiler). */
const JCW_MODEL = "assets-src/jcw-2018/2018_mini_john_cooper_works.glb";

const io = new NodeIO();
const doc = await io.read(IN);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const buffer = root.listBuffers()[0];

const findNode = (sub) => root.listNodes().find((n) => n.getName().includes(sub) && n.getMesh());

// ---------------------------------------------------------------- helpers

/** Connected components of a primitive (vertices welded by position). Returns comp id per triangle. */
function triangleComponents(prim) {
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const n = pos.length / 3;
  const keyMap = new Map();
  const weldIdx = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e6)},${Math.round(pos[i * 3 + 1] * 1e6)},${Math.round(pos[i * 3 + 2] * 1e6)}`;
    if (!keyMap.has(k)) keyMap.set(k, i);
    weldIdx[i] = keyMap.get(k);
  }
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < idx.length; t += 3)
    for (const j of [1, 2]) { const a = find(weldIdx[idx[t]]), b = find(weldIdx[idx[t + j]]); if (a !== b) par[a] = b; }
  const triCount = idx.length / 3;
  const rootOf = new Int32Array(triCount);
  for (let t = 0; t < triCount; t++) rootOf[t] = find(weldIdx[idx[t * 3]]);
  // relabel by size, largest = 0 (matches scripts/components.mjs output)
  const sizes = new Map();
  for (const r of rootOf) sizes.set(r, (sizes.get(r) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const label = new Map(order.map((r, i) => [r, i]));
  return { comp: Int32Array.from(rootOf, (r) => label.get(r)), sizes: order.map((r) => sizes.get(r)) };
}

/** Triangle centroids in metres. */
function centroids(prim) {
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const out = new Float32Array(idx.length);
  for (let t = 0; t < idx.length; t += 3)
    for (let a = 0; a < 3; a++)
      out[t + a] = ((pos[idx[t] * 3 + a] + pos[idx[t + 1] * 3 + a] + pos[idx[t + 2] * 3 + a]) / 3) * SCALE;
  return out; // [x0,y0,z0,x1,...]
}

/** Give small components the label of the nearest already-labelled big-component triangle. */
function snapSmallComponents(labels, comp, sizes, cent, minTris) {
  const big = [];
  for (let t = 0; t < labels.length; t++) if (sizes[comp[t]] >= minTris) big.push(t);
  const compLabel = new Map();
  for (let c = 0; c < sizes.length; c++) {
    if (sizes[c] >= minTris) continue;
    // component centroid
    let x = 0, y = 0, z = 0, k = 0;
    for (let t = 0; t < labels.length; t++) if (comp[t] === c) { x += cent[t * 3]; y += cent[t * 3 + 1]; z += cent[t * 3 + 2]; k++; }
    x /= k; y /= k; z /= k;
    let best = Infinity, bestLabel = null;
    for (const t of big) {
      const d = (cent[t * 3] - x) ** 2 + (cent[t * 3 + 1] - y) ** 2 + (cent[t * 3 + 2] - z) ** 2;
      if (d < best) { best = d; bestLabel = labels[t]; }
    }
    compLabel.set(c, bestLabel);
  }
  for (let t = 0; t < labels.length; t++) if (compLabel.has(comp[t])) labels[t] = compLabel.get(comp[t]);
}

/**
 * Split `prim` into one new node per label. Triangles labelled null stay in the
 * original primitive (if keepRest) or are dropped.
 */
function splitPrimitive(srcNode, prim, labels, { materialFor, parent, keepRestName }) {
  const idx = prim.getIndices().getArray();
  const groups = new Map();
  labels.forEach((l, t) => { const k = l ?? "__rest"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const made = [];
  for (const [label, tris] of groups) {
    if (label === "__rest" && !keepRestName) continue;
    const name = label === "__rest" ? keepRestName : label;
    const newIdx = new Uint32Array(tris.length * 3);
    tris.forEach((t, i) => newIdx.set(idx.subarray(t * 3, t * 3 + 3), i * 3));
    const p = doc.createPrimitive().setIndices(doc.createAccessor().setType("SCALAR").setArray(newIdx).setBuffer(buffer));
    for (const sem of prim.listSemantics()) p.setAttribute(sem, prim.getAttribute(sem));
    p.setMaterial(materialFor(label === "__rest" ? null : label) ?? prim.getMaterial());
    compactPrimitive(p);
    const mesh = doc.createMesh(name).addPrimitive(p);
    const node = doc.createNode(name).setMesh(mesh).setMatrix(srcNode.getMatrix());
    if (label !== "__rest") node.setExtras({ part: name });
    parent.addChild(node);
    made.push(name);
  }
  return made;
}

const side = (x) => (x > 0 ? "l" : "r");

/**
 * The car has the sport (JCW-style) roof spoiler, not the source model's base ducktail.
 * Its geometry comes from a 2018 MINI JCW model (assets-src/jcw-2018). Both models share
 * the same roof (they coincide to ~1 mm, see scripts/compare-roofs.mjs), so the parts are
 * copied in world space as-is. Whole UV islands are taken (scripts/jcw-roof-islands.mjs)
 * rather than cutting triangles, so the edges stay clean:
 *  - spoiler       painted blade: the roof-mesh islands behind the roof (top, underside,
 *                  raised centre); it overlaps our roof's rear edge from above, as on the JCW
 *  - spoiler_lip   black trim strip under the blade (the side fins are left out on purpose)
 * Returns { label: primitive } in our object space (÷ SCALE).
 */
async function loadJcwSpoiler(materialFor) {
  const { KHRONOS_EXTENSIONS } = await import("@gltf-transform/extensions");
  const src = await new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).read(JCW_MODEL);
  const groupsOut = { spoiler: { P: [], N: [] }, spoiler_lip: { P: [], N: [] } };
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const isBlade = mesh.getName().includes("Color_2"), isTrim = mesh.getName().includes("details");
    if (!isBlade && !isTrim) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const lp = prim.getAttribute("POSITION").getArray(), ln = prim.getAttribute("NORMAL").getArray();
      const idx = prim.getIndices().getArray();
      const W = (i) => [0, 1, 2].map((a) => (m[a] * lp[i * 3] + m[4 + a] * lp[i * 3 + 1] + m[8 + a] * lp[i * 3 + 2] + m[12 + a]) * 100);
      const Nw = (i) => { const v = [0, 1, 2].map((a) => m[a] * ln[i * 3] + m[4 + a] * ln[i * 3 + 1] + m[8 + a] * ln[i * 3 + 2]); const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
      // UV islands (raw vertex connectivity) with world bounding boxes
      const par = Int32Array.from({ length: lp.length / 3 }, (_, i) => i);
      const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
      for (let t = 0; t < idx.length; t += 3) for (const j of [1, 2]) { const a = find(idx[t]), b = find(idx[t + j]); if (a !== b) par[a] = b; }
      const bb = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        const r = find(idx[t]);
        let b = bb.get(r); if (!b) bb.set(r, b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
        for (let j = 0; j < 3; j++) { const p = W(idx[t + j]); for (let a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], p[a]); b.max[a] = Math.max(b.max[a], p[a]); } }
      }
      const islandLabel = (b) => {
        const cx = (b.min[0] + b.max[0]) / 2;
        if (isBlade) return b.min[2] < -1.4 && b.max[2] < -1.27 && b.min[1] > 1.3 && b.max[0] - b.min[0] > 0.8 ? "spoiler" : null;
        // trim: islands entirely in the spoiler zone; fins (one-sided islands) are skipped
        const inZone = b.max[2] < -1.28 && b.min[1] > 1.18 && b.min[0] > -0.62 && b.max[0] < 0.62;
        return inZone && Math.abs(cx) < 0.3 ? "spoiler_lip" : null;
      };
      for (let t = 0; t < idx.length; t += 3) {
        const vs = [idx[t], idx[t + 1], idx[t + 2]], ws = vs.map(W);
        const label = islandLabel(bb.get(find(idx[t])));
        if (!label) continue;
        for (let j = 0; j < 3; j++) { groupsOut[label].P.push(...ws[j].map((v) => v / SCALE)); groupsOut[label].N.push(...Nw(vs[j])); }
      }
    }
  }
  const out = {};
  for (const [label, { P, N }] of Object.entries(groupsOut)) {
    if (!P.length) { console.warn("JCW spoiler: no triangles for", label); continue; }
    out[label] = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from({ length: P.length / 3 }, (_, i) => i)).setBuffer(buffer))
      .setMaterial(materialFor(label));
  }
  return out;
}

/** One material per recolourable part, cloned from a template so the look stays the same. */
function partMaterial(template, name) {
  return template.clone().setName(`mat_${name}`);
}

// ---------------------------------------------------------------- new hierarchy

const car = doc.createNode("F56").setScale([SCALE, SCALE, SCALE]);
const groups = Object.fromEntries(
  ["body", "contrast", "chrome", "trim", "glass", "lights", "interior", "wheels", "misc"].map((g) => {
    const n = doc.createNode(g); car.addChild(n); return [g, n];
  }),
);

// ---------------------------------------------------------------- 1. body paint → panels

/** Hood-scoop outline (object space), stored on the hood node; filled in below. */
let scoopMask = null;

{
  const node = findNode("Paint_Geo");
  const [paint, contrast] = node.getMesh().listPrimitives(); // [Paint_Material1, carP_2]

  // --- paint panels
  const { comp, sizes } = triangleComponents(paint);
  const cent = centroids(paint);
  const labels = new Array(comp.length).fill(null);

  // Component 5 is the right door as its own clean mesh. The left door is welded into
  // component 3 together with both fenders, so we find it by mirroring: rasterise the
  // right door's side silhouette (Y/Z plane) and call every left-side triangle that
  // falls inside it "door_l".
  const CELL = 0.01; // 1 cm
  const pos = paint.getAttribute("POSITION").getArray();
  const idx = paint.getIndices().getArray();
  const vtx = (t, j, a) => pos[idx[t * 3 + j] * 3 + a] * SCALE;
  const doorMask = new Set();
  for (let t = 0; t < comp.length; t++) {
    if (comp[t] !== 5) continue;
    const ys = [0, 1, 2].map((j) => vtx(t, j, 1)), zs = [0, 1, 2].map((j) => vtx(t, j, 2));
    // sample densely enough that no 1 cm cell inside the triangle is skipped
    const edge = Math.max(Math.hypot(ys[1] - ys[0], zs[1] - zs[0]), Math.hypot(ys[2] - ys[0], zs[2] - zs[0]), Math.hypot(ys[2] - ys[1], zs[2] - zs[1]));
    const steps = Math.max(2, Math.ceil((edge / CELL) * 2));
    for (let i = 0; i <= steps; i++) for (let k = 0; k <= steps - i; k++) {
      const a = i / steps, b = k / steps;
      const y = ys[0] + a * (ys[1] - ys[0]) + b * (ys[2] - ys[0]);
      const z = zs[0] + a * (zs[1] - zs[0]) + b * (zs[2] - zs[0]);
      doorMask.add(`${Math.round(y / CELL)},${Math.round(z / CELL)}`);
    }
  }
  // a vertex counts as "in the door" if it is within 1 cell of the silhouette
  const inDoor = (y, z) => {
    const cy = Math.round(y / CELL), cz = Math.round(z / CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (doorMask.has(`${cy + dy},${cz + dz}`)) return true;
    return false;
  };
  const allVerts = (t, fn) => [0, 1, 2].every((j) => fn(vtx(t, j, 0), vtx(t, j, 1), vtx(t, j, 2)));

  for (let t = 0; t < comp.length; t++) {
    const x = cent[t * 3], y = cent[t * 3 + 1], z = cent[t * 3 + 2];
    switch (comp[t]) {
      case 1: labels[t] = "hood"; break;
      case 2: labels[t] = "bumper_f"; break;
      case 4: labels[t] = "tailgate"; break;
      case 5: labels[t] = "door_r"; break; // the only stand-alone door mesh (x < 0 → right side)
      case 3: // front fenders + left door, welded together
        labels[t] = x > 0.55 && allVerts(t, (_x, vy, vz) => inDoor(vy, vz)) ? "door_l" : `fender_${side(x)}`;
        break;
      case 0: // rear quarters + C-pillars + rear bumper
        if (allVerts(t, (_x, vy, vz) => vz < -1.56 && vy < 0.63)) labels[t] = "bumper_r";
        else labels[t] = `quarter_${side(x)}`;
        break;
      default: break; // small bits, snapped below
    }
  }
  snapSmallComponents(labels, comp, sizes, cent, 1000);

  // Hood scoop: its own small paint shell at the front-centre of the hood
  // (component 10 in scripts/components.mjs: x ±0.24, y 0.75–0.82, z 1.65–1.77).
  {
    const bb = new Map();
    for (let t = 0; t < comp.length; t++) {
      let b = bb.get(comp[t]); if (!b) bb.set(comp[t], b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
      for (let a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], cent[t * 3 + a]); b.max[a] = Math.max(b.max[a], cent[t * 3 + a]); }
    }
    const scoop = [...bb.entries()].filter(([, b]) =>
      b.min[2] > 1.6 && b.max[2] < 1.8 && b.min[1] > 0.73 && b.max[1] < 0.84 && b.max[0] - b.min[0] > 0.35 && b.max[0] - b.min[0] < 0.55,
    ).map(([c]) => c);
    if (scoop.length !== 1) console.warn("hood scoop: expected 1 component, found", scoop.length);
    for (let t = 0; t < comp.length; t++) if (scoop.includes(comp[t])) labels[t] = "hood_scoop";
    // That component is only the scoop's rim; its raised body is welded into the hood with
    // big triangles that cross the outline, so it can't be split cleanly by triangles.
    // Instead we store the rim's outline (top view, object space) on the hood node and the
    // app masks the scoop per pixel in the hood's shader (see CarModel.tsx).
    if (scoop.length === 1) {
      const b = bb.get(scoop[0]);
      scoopMask = {
        cx: (b.min[0] + b.max[0]) / 2 / SCALE,
        cz: (b.min[2] + b.max[2]) / 2 / SCALE,
        rx: (b.max[0] - b.min[0]) / 2 / SCALE,
        rz: (b.max[2] - b.min[2]) / 2 / SCALE,
        n: 4, // superellipse exponent: the outline is a rounded rectangle
      };
    }
  }
  const tmpl = paint.getMaterial();
  const mats = new Map();
  splitPrimitive(node, paint, labels, {
    parent: groups.body,
    materialFor: (l) => { if (!mats.has(l)) mats.set(l, partMaterial(tmpl, l)); return mats.get(l); },
  });
  if (scoopMask) groups.body.listChildren().find((n) => n.getName() === "hood").setExtras({ part: "hood", scoopMask });
  else console.warn("hood scoop mask missing");

  // --- contrast: roof / mirror caps / spoiler
  const c2 = triangleComponents(contrast);
  const cc = centroids(contrast);
  // Panorama glass roof (S402): inside the roof shell, the glass panels + frame are
  // separate raw-vertex islands (scripts/roof-islands.mjs) within x ±0.41, z -1.12…0.16.
  const sunroofTri = new Uint8Array(c2.comp.length);
  {
    const ci = contrast.getIndices().getArray();
    const cp = contrast.getAttribute("POSITION").getArray();
    const par = Int32Array.from({ length: cp.length / 3 }, (_, i) => i);
    const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
    for (let t = 0; t < ci.length / 3; t++) for (const j of [1, 2]) { const a = find(ci[t * 3]), b = find(ci[t * 3 + j]); if (a !== b) par[a] = b; }
    const bb = new Map();
    for (let t = 0; t < ci.length / 3; t++) {
      const r = find(ci[t * 3]);
      let b = bb.get(r); if (!b) bb.set(r, b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
      for (let j = 0; j < 3; j++) for (let a = 0; a < 3; a++) { const p = cp[ci[t * 3 + j] * 3 + a] * SCALE; b.min[a] = Math.min(b.min[a], p); b.max[a] = Math.max(b.max[a], p); }
    }
    const isGlass = (b) => b.min[0] > -0.41 && b.max[0] < 0.41 && b.min[2] > -1.12 && b.max[2] < 0.16 && b.min[1] > 1.36;
    for (let t = 0; t < ci.length / 3; t++) if (isGlass(bb.get(find(ci[t * 3])))) sunroofTri[t] = 1;
  }

  const cl = Array.from(c2.comp, (c, t) => {
    if (sunroofTri[t]) return "sunroof";
    if (c === 0) return "roof";
    if (c === 2) return "spoiler";
    return `mirror_cap_${side(cc[t * 3])}`;
  });
  const ctmpl = contrast.getMaterial();
  splitPrimitive(node, contrast, cl, { parent: groups.contrast, materialFor: (l) => partMaterial(ctmpl, l) });

  // Swap the base ducktail for the sport spoiler from the JCW reference model.
  const spoilerNode = groups.contrast.listChildren().find((n) => n.getName() === "spoiler");
  const oldPrim = spoilerNode.getMesh().listPrimitives()[0];
  const jcw = await loadJcwSpoiler((l) => partMaterial(oldPrim.getMaterial(), l));
  spoilerNode.getMesh().removePrimitive(oldPrim);
  oldPrim.dispose();
  spoilerNode.getMesh().addPrimitive(jcw.spoiler);
  for (const label of ["spoiler_lip"]) {
    if (!jcw[label]) continue;
    const n = doc.createNode(label).setMesh(doc.createMesh(label).addPrimitive(jcw[label])).setMatrix(spoilerNode.getMatrix()).setExtras({ part: label });
    groups.contrast.addChild(n);
  }

  node.dispose();
}

// ---------------------------------------------------------------- 2. trim → chrome parts + rest

{
  const node = findNode("Coloured_Geo");
  const prim = node.getMesh().listPrimitives()[0];
  const uv = prim.getAttribute("TEXCOORD_0").getArray();
  const idx = prim.getIndices().getArray();
  const cent = centroids(prim);
  // The horizontal bar across the grille (between honeycomb and number plate) is its own
  // component; it becomes "grille_bar" so a stripe colour can be put on it.
  const { comp } = triangleComponents(prim);
  const bbox = new Map();
  for (let t = 0; t < comp.length; t++) {
    let b = bbox.get(comp[t]); if (!b) bbox.set(comp[t], b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    for (let a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], cent[t * 3 + a]); b.max[a] = Math.max(b.max[a], cent[t * 3 + a]); }
  }
  const isGrilleBar = (c) => { const b = bbox.get(c); return b.min[2] > 1.8 && b.min[1] > 0.53 && b.max[1] < 0.59 && b.max[0] - b.min[0] > 0.8; };
  // US-size front number-plate holder (component 17: x ±0.16, y 0.34–0.51, z ≈ 1.9).
  // The real car never had one, so it is dropped.
  const isPlateHolder = (c) => {
    const b = bbox.get(c);
    const w = b.max[0] - b.min[0];
    return b.min[2] > 1.86 && w > 0.22 && w < 0.36 && b.min[1] > 0.32 && b.max[1] < 0.53 && Math.abs(b.min[0] + b.max[0]) < 0.02;
  };
  const holderComps = new Set([...bbox.keys()].filter(isPlateHolder));
  if (holderComps.size !== 1) console.warn("plate holder: expected 1 component, found", holderComps.size);
  const labels = [];
  for (let t = 0; t < idx.length / 3; t++) {
    if (holderComps.has(comp[t])) { labels.push("__drop"); continue; }
    if (isGrilleBar(comp[t])) { labels.push("grille_bar"); continue; }
    let u = 0, v = 0;
    for (let j = 0; j < 3; j++) { u += uv[idx[t * 3 + j] * 2] / 3; v += uv[idx[t * 3 + j] * 2 + 1] / 3; }
    const chrome = Math.floor(u * 8) === 5 && Math.floor(v * 8) === 0;
    if (!chrome) { labels.push(null); continue; }
    const x = cent[t * 3], y = cent[t * 3 + 1], z = cent[t * 3 + 2];
    let l;
    if (z > 1.7) l = "chrome_grille_surround";
    else if (z < -1.75 && y < 0.4) l = "chrome_exhaust";
    else if (y > 0.86) l = z > 0.6 ? "chrome_cowl" : "chrome_window_trim";
    else if (Math.abs(x) > 0.78 && z > 0.6) l = `chrome_side_scuttle_${side(x)}`;
    else if (Math.abs(x) > 0.78 && z > -0.7) l = `chrome_door_handle_${side(x)}`;
    else if (Math.abs(x) > 0.7 && z < -1.0) l = "chrome_fuel_cap";
    else l = "chrome_misc";
    labels.push(l);
  }
  const tmpl = prim.getMaterial();
  // chrome parts get a plain (untextured) material; the app owns their look
  splitPrimitive(node, prim, labels, {
    parent: groups.chrome,
    keepRestName: "trim",
    materialFor: (l) => {
      if (!l) return tmpl;
      if (l === "grille_bar") return partMaterial(tmpl, l);
      return doc.createMaterial(`mat_${l}`).setBaseColorFactor([0.8, 0.8, 0.8, 1]).setMetallicFactor(1).setRoughnessFactor(0.08);
    },
  });
  // move "trim" (the rest) and the grille bar out of the chrome group
  for (const [name, group] of [["trim", groups.trim], ["grille_bar", groups.trim]]) {
    const n = groups.chrome.listChildren().find((c) => c.getName() === name);
    groups.chrome.removeChild(n); group.addChild(n);
  }
  // delete the dropped geometry (pruned on write)
  groups.chrome.listChildren().find((c) => c.getName() === "__drop")?.dispose();
  node.dispose();
}

// ---------------------------------------------------------------- 2b. lights → chrome rings + rest

{
  const node = findNode("Light_Geo");
  const prim = node.getMesh().listPrimitives()[0];
  const uv = prim.getAttribute("TEXCOORD_0").getArray();
  const idx = prim.getIndices().getArray();
  const cent = centroids(prim);
  const T = idx.length / 3;
  // UV islands = connectivity over raw (unwelded) vertex indices
  const par = Int32Array.from({ length: uv.length / 2 }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < T; t++) for (const j of [1, 2]) { const a = find(idx[t * 3]), b = find(idx[t * 3 + j]); if (a !== b) par[a] = b; }
  const isl = new Map();
  for (let t = 0; t < T; t++) {
    const r = find(idx[t * 3]);
    let b = isl.get(r); if (!b) isl.set(r, b = { u0: 1, v0: 1, u1: 0, v1: 0, z: 0, n: 0, y0: 1e9, y1: -1e9 });
    for (let j = 0; j < 3; j++) { const v = idx[t * 3 + j]; b.u0 = Math.min(b.u0, uv[v * 2]); b.v0 = Math.min(b.v0, uv[v * 2 + 1]); b.u1 = Math.max(b.u1, uv[v * 2]); b.v1 = Math.max(b.v1, uv[v * 2 + 1]); }
    b.z += cent[t * 3 + 2]; b.n++;
    b.y0 = Math.min(b.y0, cent[t * 3 + 1]); b.y1 = Math.max(b.y1, cent[t * 3 + 1]);
  }
  // Pre-LCI F56 LED headlights: the DRL ring is not lit along its bottom (~lowest 22%
  // of the ring's height). That part becomes its own unlit "headlight_ring_lower" part.
  const DRL_UNLIT_FRACTION = 0.22;
  const labels = [];
  for (let t = 0; t < T; t++) {
    const b = isl.get(find(idx[t * 3]));
    const z = b.z / b.n, x = cent[t * 3];
    // headlight outer ring: oval island bottom-left of the light texture
    if (z > 1.3 && b.u0 < 0.05 && b.u1 < 0.3 && b.v0 > 0.6 && b.v1 > 0.95) {
      const lower = cent[t * 3 + 1] < b.y0 + DRL_UNLIT_FRACTION * (b.y1 - b.y0);
      labels.push(`${lower ? "headlight_ring_lower" : "headlight_drl"}_${side(x)}`);
    }
    // taillight surround: big metallic ring island on the right of the texture
    else if (z < -1.5 && b.u0 > 0.58 && b.u1 > 0.97 && b.v0 < 0.5 && b.v1 > 0.95) labels.push(`chrome_taillight_ring_${side(x)}`);
    else labels.push(null);
  }
  splitPrimitive(node, prim, labels, {
    parent: groups.chrome,
    keepRestName: "lights",
    materialFor: (l) => l ? doc.createMaterial(`mat_${l}`).setBaseColorFactor([0.8, 0.8, 0.8, 1]).setMetallicFactor(1).setRoughnessFactor(0.08) : prim.getMaterial(),
  });
  const rest = groups.chrome.listChildren().find((c) => c.getName() === "lights");
  groups.chrome.removeChild(rest); groups.lights.addChild(rest);
  node.dispose();
}

// ---------------------------------------------------------------- 2c. number plates → front / rear, EU size

{
  const node = findNode("ManufacturerPlate_Geo");
  const prim = node.getMesh().listPrimitives()[0];
  const cent = centroids(prim);
  const labels = Array.from({ length: cent.length / 3 }, (_, t) => (cent[t * 3 + 2] > 0 ? "plate_front" : "plate_rear"));
  // The source plates are US-sized (0.30 × 0.16 m). Resize each one about its centre to an
  // EU plate (0.52 × 0.11 m) so the app can draw real plate textures without distortion.
  const pos = prim.getAttribute("POSITION");
  const arr = pos.getArray().slice();
  const idx = prim.getIndices().getArray();
  for (const front of [true, false]) {
    const verts = new Set();
    for (let t = 0; t < labels.length; t++) if ((labels[t] === "plate_front") === front) for (let j = 0; j < 3; j++) verts.add(idx[t * 3 + j]);
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const v of verts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], arr[v * 3 + a]); max[a] = Math.max(max[a], arr[v * 3 + a]); }
    const c = min.map((m, a) => (m + max[a]) / 2);
    const sx = 0.52 / ((max[0] - min[0]) * SCALE), sy = 0.11 / ((max[1] - min[1]) * SCALE);
    for (const v of verts) {
      arr[v * 3] = c[0] + (arr[v * 3] - c[0]) * sx;
      arr[v * 3 + 1] = c[1] + (arr[v * 3 + 1] - c[1]) * sy;
      arr[v * 3 + 2] = c[2] + (arr[v * 3 + 2] - c[2]) * sy; // keep the plate's tilt
    }
  }
  prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(arr).setBuffer(buffer));
  const tmpl = prim.getMaterial();
  splitPrimitive(node, prim, labels, { parent: groups.trim, materialFor: (l) => partMaterial(tmpl, l) });
  // tagged "plate" (not "part"): the app draws them from the timeline's plate history
  for (const n of groups.trim.listChildren()) if (n.getName().startsWith("plate_")) n.setExtras({ plate: n.getName().slice(6) });
  node.dispose();
}

// ---------------------------------------------------------------- 3. everything else: rename + regroup

const rename = [
  ["Base_Geo", "base", "trim"],
  ["SeatBelt_Geo", "seatbelts", "interior"],
  ["Window_Geo", "glass_outer", "glass"],
  ["WindowInside_Geo", "glass_inner", "glass"],
  ["Engine_Geo", "engine", "misc"],
  ["Grille1_Geo", "grille_1", "trim"],
  ["Grille2_Geo", "grille_2", "trim"],
  ["Grille3_Geo", "grille_3", "trim"],
  ["Grille4_Geo", "grille_4", "trim"],
  ["Grille5_Geo", "grille_5", "trim"],
  ["InteriorTillingColourZone_Geo", "interior_trim", "interior"],
  ["Interior_Geo", "interior", "interior"],
  ["Badge_Geo", "badges", "trim"],
];
for (const [sub, name, group] of rename) {
  const n = root.listNodes().find((x) => x.getName().includes(sub) && x.getMesh() && x.getParentNode()?.getName() === "RootNode");
  if (!n) { console.warn("missing", sub); continue; }
  n.setName(name); n.getMesh().setName(name);
  n.getParentNode().removeChild(n); groups[group].addChild(n);
}
const oldRoot = scene.listChildren().find((n) => n.getName() === "RootNode");
for (const [sub, group] of [["Wheel1A_3D", "wheels"], ["Common", "wheels"]]) {
  const n = oldRoot.listChildren().find((x) => x.getName() === sub);
  if (n) { oldRoot.removeChild(n); groups[group].addChild(n); }
}
for (const n of root.listNodes()) {
  if (n.getName() === "3DWheel Front L") n.setName("wheel_fl");
  if (n.getName() === "3DWheel Front R") n.setName("wheel_fr");
  if (n.getName() === "3DWheel Rear L") n.setName("wheel_rl");
  if (n.getName() === "3DWheel Rear R") n.setName("wheel_rr");
}
// Mark wheels + callipers as recolourable groups
groups.wheels.listChildren().find((n) => n.getName() === "Wheel1A_3D")?.setName("rims").setExtras({ part: "wheels" });
groups.wheels.listChildren().find((n) => n.getName() === "Common")?.setName("callipers").setExtras({ part: "callipers" });

if (oldRoot.listChildren().length) console.warn("left in RootNode:", oldRoot.listChildren().map((n) => n.getName()));
scene.removeChild(oldRoot); oldRoot.dispose();
scene.addChild(car);

// ---------------------------------------------------------------- write

// ---------------------------------------------------------------- 4. fix cut-out materials
// FBX2glTF dropped the TransparentColor maps and left baseColor alpha = 0 on these, so
// badges ("MINI" wings, "S", "COOPER") vanished and the interior rendered half-invisible.
// Their diffuse PNGs already carry the cut-out mask in alpha → alpha 1 + MASK mode.
for (const m of root.listMaterials()) {
  if (!/BadgeA|InteriorA|EngineA/.test(m.getName())) continue;
  const c = m.getBaseColorFactor();
  m.setBaseColorFactor([c[0], c[1], c[2], 1]).setAlphaMode("MASK").setAlphaCutoff(0.5);
}

await doc.transform(dedup(), prune({ keepExtras: true }), weld());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);

const parts = root.listNodes().filter((n) => n.getExtras()?.part).map((n) => n.getExtras().part);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
console.log("parts:", parts.join(", "));
