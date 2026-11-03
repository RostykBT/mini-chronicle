import * as THREE from "three";
import type { Finish } from "@/lib/types";

type MatParams = {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  emissiveIntensity: number;
};

/** Physical-material parameters for each finish type. */
export const FINISH_PARAMS: Record<Finish["finish"], MatParams> = {
  gloss: { metalness: 0.0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, emissiveIntensity: 0 },
  metallic: { metalness: 0.55, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, emissiveIntensity: 0 },
  satin: { metalness: 0.1, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, emissiveIntensity: 0 },
  matte: { metalness: 0.0, roughness: 0.85, clearcoat: 0, clearcoatRoughness: 1, emissiveIntensity: 0 },
  chrome: { metalness: 1.0, roughness: 0.06, clearcoat: 0, clearcoatRoughness: 0, emissiveIntensity: 0 },
  emissive: { metalness: 0.0, roughness: 0.3, clearcoat: 0, clearcoatRoughness: 0, emissiveIntensity: 2.2 },
  // dark tinted glass: mirror-like reflections, no diffuse colour to speak of
  glass: { metalness: 0.9, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, emissiveIntensity: 0 },
};

export function makePartMaterial(finish: Finish, map?: THREE.Texture | null) {
  const p = FINISH_PARAMS[finish.finish];
  const mat = new THREE.MeshPhysicalMaterial({ color: finish.color, map: map ?? null, ...p });
  mat.emissive.set(finish.finish === "emissive" ? finish.color : "#000000");
  return mat;
}

/** Target values a material animates towards. */
export function targetOf(finish: Finish) {
  return { color: new THREE.Color(finish.color), ...FINISH_PARAMS[finish.finish], emissive: finish.finish === "emissive" };
}
