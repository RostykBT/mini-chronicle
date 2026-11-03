import { Barlow_Semi_Condensed } from "next/font/google";

// Closest freely available match to DIN 1451 Mittelschrift, the typeface on Estonian
// (and most EU) plates. Self-hosted by next/font; used by the canvas plate renderer.
export const plateFont = Barlow_Semi_Condensed({ weight: ["500", "600"], subsets: ["latin"], display: "block" });
