import * as THREE from "three";
import type { Plate } from "@/lib/carState";
import { plateFont } from "./plateFont";

// Drawn at 2 px per mm on a 520 × 110 mm EU plate; the model's plates are resized to match
// (scripts/build-model.mjs) and their UVs span the whole texture.
const MM = 2;
const W = 520 * MM;
const H = 110 * MM;

type Style = {
  bg: string;
  fg: string;
  border: string;
  country: string;
  /** character cap height in mm */
  capMm: number;
  weight: number;
  /** extra letter spacing in mm */
  trackingMm: number;
};

const STYLES: Record<Plate["style"], Style> = {
  // Estonian plate (2004+): reflective white, thin black border, black DIN-style characters
  ee: { bg: "#f7f7f4", fg: "#121212", border: "#121212", country: "EST", capMm: 75, weight: 500, trackingMm: 1.5 },
  // Belgian export/transit plate: red background, white characters
  "be-export": { bg: "#c4122f", fg: "#ffffff", border: "#ffffff", country: "B", capMm: 75, weight: 500, trackingMm: 1 },
};

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Blue EU band, 40 mm wide, flush with the plate's left edge. Returns its right edge (px). */
function drawEuBand(ctx: CanvasRenderingContext2D, s: Style, family: string) {
  const inset = 2.5 * MM;
  const bw = 40 * MM;
  ctx.fillStyle = "#003399";
  ctx.beginPath();
  ctx.roundRect(inset, inset, bw, H - inset * 2, [4 * MM, 0, 0, 4 * MM]);
  ctx.fill();
  // circle of 12 stars, ~26 mm across, in the upper part of the band
  ctx.fillStyle = "#ffcc00";
  const cx = inset + bw / 2, cy = inset + 30 * MM, r = 12.5 * MM;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    star(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4 * MM);
  }
  // country code, white, ~20 mm tall
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${(s.country.length > 2 ? 24 : 30) * MM}px ${family}`;
  ctx.fillText(s.country, cx, H - inset - 13 * MM);
  return inset + bw;
}

function draw(ctx: CanvasRenderingContext2D, plate: Plate, family: string) {
  const s = STYLES[plate.style];
  ctx.clearRect(0, 0, W, H);

  // plate body + thin black border just inside the edge
  ctx.fillStyle = s.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 6 * MM);
  ctx.fill();
  ctx.strokeStyle = s.border;
  ctx.lineWidth = 1.6 * MM;
  ctx.beginPath();
  ctx.roundRect(1.8 * MM, 1.8 * MM, W - 3.6 * MM, H - 3.6 * MM, 5 * MM);
  ctx.stroke();

  const left = drawEuBand(ctx, s, family);

  // characters: cap height from the spec, squeezed horizontally only if they don't fit
  ctx.fillStyle = s.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const fontPx = (s.capMm * MM) / 0.7; // Barlow cap height ≈ 0.7 em
  ctx.font = `${s.weight} ${fontPx}px ${family}`;
  const tracking = s.trackingMm * MM;
  const chars = [...plate.number];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const textW = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const avail = W - left - 14 * MM;
  const sx = Math.min(1, avail / textW);
  const x0 = left + (W - left - textW * sx) / 2;
  const baseline = H / 2 + (s.capMm * MM) / 2;
  ctx.save();
  ctx.translate(x0, baseline);
  ctx.scale(sx, 1);
  let x = 0;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, 0);
    x += widths[i] + tracking;
  });
  ctx.restore();
}

/** Plate texture laid out for the model's plate UVs (0..1). Redraws once the font is ready. */
export function makePlateTexture(plate: Plate): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const family = plateFont.style.fontFamily;
  draw(ctx, plate, family);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // glTF UV convention
  tex.anisotropy = 8;

  // the web font may still be loading on first draw
  Promise.all([document.fonts.load(`500 100px ${family}`), document.fonts.load(`600 100px ${family}`)]).then(() => {
    draw(ctx, plate, family);
    tex.needsUpdate = true;
  });
  return tex;
}
