"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { PartId } from "@/lib/parts";
import type { Plate } from "@/lib/carState";
import type { CarState } from "@/lib/types";
import { useExplorer } from "@/store/useExplorer";
import { makePartMaterial, targetOf } from "./materials";
import { makePlateTexture } from "./plateTexture";

export const MODEL_URL = "/models/f56.glb";

/** Parts that keep their original texture and only get tinted (rims+tyres share one map). */
const KEEP_TEXTURE: PartId[] = ["wheels"];

function prepareStaticMaterials(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.partId) return;
    for (const m of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
      if (m.userData.prepared) continue;
      m.userData.prepared = true;
      if (/red_glass/i.test(m.name)) Object.assign(m, { transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0 });
      else if (/glass_light/i.test(m.name)) Object.assign(m, { transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, depthWrite: false });
      else if (/Window/i.test(m.name)) {
        m.color.set("#0e1114");
        Object.assign(m, { transparent: true, opacity: 0.55, roughness: 0.02, metalness: 0.1, depthWrite: false });
      } else {
        // FBX export left metalness 0.4 / roughness 0.1 on everything; tame it
        m.metalness = Math.min(m.metalness, 0.1);
        m.roughness = Math.max(m.roughness, 0.35);
      }
    }
  });
}

/**
 * part id → its own material (shared by all meshes of that part), attached to the meshes.
 * Cached on the scene: React may run the calling memo twice (StrictMode), and the map we
 * animate must be the exact one whose materials are on the meshes.
 */
function partMaterialsFor(scene: THREE.Object3D, state: CarState) {
  const cached = scene.userData.partMaterials as Map<PartId, THREE.MeshPhysicalMaterial> | undefined;
  if (cached) return cached;
  const mats = new Map<PartId, THREE.MeshPhysicalMaterial>();
  scene.userData.partMaterials = mats;
  scene.traverse((o) => {
    const part = o.userData.part as PartId | undefined;
    if (!part) return;
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.userData.partId = part;
      if (!mats.has(part)) {
        const original = [mesh.material].flat()[0] as THREE.MeshStandardMaterial;
        mats.set(part, makePartMaterial(state[part], KEEP_TEXTURE.includes(part) ? original.map : null));
      }
      mesh.material = mats.get(part)!;
    });
  });
  prepareStaticMaterials(scene);
  scene.traverse((o) => {
    const mask = o.userData.scoopMask as ScoopMask | undefined;
    if (mask && mats.has("hood") && mats.has("hood_scoop")) installScoopMask(mats.get("hood")!, mats.get("hood_scoop")!, mask);
  });
  return mats;
}

type ScoopMask = { cx: number; cz: number; rx: number; rz: number; n: number };

/** Is an object-space point (on the hood) inside the scoop outline? */
function inScoop(m: ScoopMask, x: number, z: number) {
  return Math.abs((x - m.cx) / m.rx) ** m.n + Math.abs((z - m.cz) / m.rz) ** m.n <= 1;
}

/**
 * The hood scoop's raised body is welded into the hood mesh, so it is painted per pixel:
 * the hood shader blends in the hood_scoop material's colour / metalness / roughness inside
 * the scoop outline (a superellipse stored on the hood node by scripts/build-model.mjs).
 */
function installScoopMask(hood: THREE.MeshPhysicalMaterial, scoop: THREE.MeshPhysicalMaterial, m: ScoopMask) {
  const uniforms = {
    uScoop: { value: new THREE.Vector4(m.cx, m.cz, m.rx, m.rz) },
    uScoopN: { value: m.n },
    uScoopColor: { value: scoop.color }, // same Color object → follows the animation
    uScoopMetal: { value: scoop.metalness },
    uScoopRough: { value: scoop.roughness },
  };
  hood.userData.scoopUniforms = uniforms;
  hood.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vScoopPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvScoopPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vScoopPos;
uniform vec4 uScoop; uniform float uScoopN; uniform vec3 uScoopColor;
uniform float uScoopMetal; uniform float uScoopRough;
float scoopMask() {
  vec2 d = abs(vec2(vScoopPos.x - uScoop.x, vScoopPos.z - uScoop.y)) / uScoop.zw;
  float s = pow(d.x, uScoopN) + pow(d.y, uScoopN);
  float w = max(fwidth(s), 1e-4);
  return 1.0 - smoothstep(1.0 - w, 1.0 + w, s);
}`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat sm = scoopMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, uScoopColor, sm);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uScoopMetal, sm);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uScoopRough, sm);");
  };
  hood.customProgramCacheKey = () => "hood-scoop-mask";
}

/** Put the given plate (or the model's original texture when null) on both plate meshes. */
function applyPlate(scene: THREE.Object3D, plate: Plate | null) {
  const tex = plate ? makePlateTexture(plate) : null;
  scene.traverse((o) => {
    if (!o.userData.plate) return;
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!("origMap" in mat.userData)) mat.userData.origMap = mat.map;
      const prev = mat.map;
      mat.map = tex ?? (mat.userData.origMap as THREE.Texture | null);
      mat.color.set("#ffffff");
      // real plates are retro-reflective: a little self-illumination keeps the white white
      mat.emissiveMap = tex;
      mat.emissive.set(tex ? "#ffffff" : "#000000");
      mat.emissiveIntensity = tex ? 0.35 : 0;
      mat.metalness = 0;
      mat.roughness = 0.45;
      mat.needsUpdate = true;
      if (prev && prev !== mat.userData.origMap && prev !== mat.map) prev.dispose();
    });
  });
}

/** Ease each part material towards its target finish; adds a hover/selection glow. */
function animateMaterials(materials: Map<PartId, THREE.MeshPhysicalMaterial>, state: CarState, dt: number) {
  const k = 1 - Math.exp(-dt * 6);
  const { hoveredPart, selectedPart } = useExplorer.getState();
  for (const [part, mat] of materials) {
    const target = targetOf(state[part]);
    mat.color.lerp(target.color, k);
    mat.metalness += (target.metalness - mat.metalness) * k;
    mat.roughness += (target.roughness - mat.roughness) * k;
    mat.clearcoat += (target.clearcoat - mat.clearcoat) * k;
    mat.clearcoatRoughness += (target.clearcoatRoughness - mat.clearcoatRoughness) * k;
    if (target.emissive) {
      mat.emissive.lerp(target.color, k);
      mat.emissiveIntensity += (target.emissiveIntensity - mat.emissiveIntensity) * k;
    } else {
      const highlight = part === selectedPart ? 0.35 : part === hoveredPart ? 0.18 : 0;
      mat.emissive.set("#5ab4ff");
      mat.emissiveIntensity += (highlight - mat.emissiveIntensity) * Math.min(1, k * 3);
    }
  }
  // keep the hood's scoop mask in step with the hood_scoop material
  const u = materials.get("hood")?.userData.scoopUniforms;
  const scoop = materials.get("hood_scoop");
  if (u && scoop) {
    u.uScoopMetal.value = scoop.metalness;
    u.uScoopRough.value = scoop.roughness;
  }
}

export function CarModel({ state, plate }: { state: CarState; plate: Plate | null }) {
  const { scene } = useGLTF(MODEL_URL);
  const plateKey = plate ? `${plate.style}|${plate.number}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => applyPlate(scene, plate), [scene, plateKey]);
  const setHovered = useExplorer((s) => s.setHoveredPart);
  const setSelected = useExplorer((s) => s.setSelectedPart);

  // build once per loaded scene (initial colours = state at first render); animated below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const materials = useMemo(() => partMaterialsFor(scene, state), [scene]);

  // Animate every part towards its finish at the current time.
  useFrame((_, dt) => animateMaterials(materials, state, dt));

  const partOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const part = (e.object.userData.partId as PartId | undefined) ?? null;
    // the scoop is painted onto the hood mesh: pick it by where the hood was hit
    const mask = (e.object.userData.scoopMask ?? e.object.parent?.userData.scoopMask) as ScoopMask | undefined;
    if (part === "hood" && mask) {
      const p = e.object.worldToLocal(e.point.clone());
      if (inScoop(mask, p.x, p.z)) return "hood_scoop";
    }
    return part;
  };

  return (
    <primitive
      object={scene}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const p = partOf(e);
        if (p !== useExplorer.getState().hoveredPart) setHovered(p);
        document.body.style.cursor = p ? "pointer" : "";
      }}
      onPointerOut={() => {
        setHovered(null);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const p = partOf(e);
        setSelected(p === useExplorer.getState().selectedPart ? null : p);
      }}
    />
  );
}

useGLTF.preload(MODEL_URL);
