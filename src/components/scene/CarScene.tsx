"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useEnvironment, useProgress } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import type { Plate } from "@/lib/carState";
import type { CarState } from "@/lib/types";
import { useExplorer } from "@/store/useExplorer";
import { SHEET_PEEK } from "@/lib/layout";
import { CarModel } from "./CarModel";

/** Poly Haven "Driving School" (CC0): an open asphalt lot, projected onto the ground. */
const ENV_URL = "/env/driving_school_2k.hdr";

/** Optional ?view= camera presets (handy for links and screenshots). */
const VIEWS: Record<string, [number, number, number]> = {
  front: [1.2, 1.0, 5.2],
  rear: [-1.2, 1.1, -5.2],
  left: [5.6, 1.2, 0.4],
  right: [-5.6, 1.2, 0.4],
  top: [0.01, 7, 0.5],
  plate: [0.15, 0.15, 3.0],
  plate_rear: [-0.15, 0.8, -3.05],
  scoop: [0.05, 1.5, 3.1],
  spoiler: [2.4, 1.55, -3.9],
  spoiler_close: [1.1, 1.85, -2.9],
};
const DEFAULT_VIEW: [number, number, number] = [4.6, 1.5, 5.2];
const TARGET: [number, number, number] = [0, 0.62, 0];
const MOBILE = 1024; // px, same breakpoint as the layout's lg:

/**
 * Keeps the car framed for the canvas shape: wider FOV in portrait so the whole car fits,
 * and on phones the image is shifted up so the car sits above the collapsed detail sheet.
 */
function frameCamera(cam: THREE.PerspectiveCamera, width: number, height: number) {
  const aspect = width / height;
  cam.fov = aspect >= 1.2 ? 30 : THREE.MathUtils.lerp(52, 30, THREE.MathUtils.clamp((aspect - 0.5) / 0.7, 0, 1));
  const lift = width < MOBILE ? SHEET_PEEK * 0.55 : 0;
  if (lift) cam.setViewOffset(width, height, 0, lift, width, height);
  else cam.clearViewOffset();
  cam.updateProjectionMatrix();
}

/** Portrait screens start further back so the whole car fits across the narrow width. */
function initialDistance(cam: THREE.Camera, width: number, height: number) {
  const aspect = width / height;
  if (aspect >= 1) return;
  const k = THREE.MathUtils.lerp(1.22, 1, THREE.MathUtils.clamp((aspect - 0.45) / 0.55, 0, 1));
  const t = new THREE.Vector3(...TARGET);
  cam.position.sub(t).multiplyScalar(k).add(t);
}

function CameraRig() {
  const { camera, size } = useThree();
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!placed.current && size.width && size.height) {
      initialDistance(camera, size.width, size.height);
      placed.current = true;
    }
    frameCamera(camera as THREE.PerspectiveCamera, size.width, size.height);
  }, [camera, size.width, size.height]);
  return null;
}

/**
 * The HDRI lights the car (reflections) and is also shown as a ground-projected skybox, so
 * the car stands on the lot's asphalt. three's own GroundedSkybox is used: drei's `ground`
 * option relies on a shader chunk that three r187 no longer has.
 */
const SKY_HEIGHT = 2.2; // how high the HDRI camera was above the ground (m)
const SKY_RADIUS = 60; // must stay well outside OrbitControls' maxDistance

function Surroundings() {
  const map = useEnvironment({ files: ENV_URL });
  const sky = useMemo(() => {
    const s = new GroundedSkybox(map, SKY_HEIGHT, SKY_RADIUS);
    s.position.y = SKY_HEIGHT - 0.001; // ground at y = 0, just under the tyres
    return s;
  }, [map]);
  return (
    <>
      <Environment map={map} environmentIntensity={1.05} />
      <primitive object={sky} />
    </>
  );
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  return (
    <div
      className={`pointer-events-none absolute inset-0 grid place-items-center bg-mist transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}
    >
      <div className="flex w-40 flex-col items-center gap-3">
        <span className="headline text-[20px]">My MINI.</span>
        <div className="h-[2px] w-full bg-line">
          <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Loading {Math.round(progress)}%</span>
      </div>
    </div>
  );
}

export default function CarScene({ state, plate }: { state: CarState; plate: Plate | null }) {
  // client-only component (dynamic, ssr: false), so reading the URL here is safe
  const view = VIEWS[new URLSearchParams(window.location.search).get("view") ?? ""] ?? DEFAULT_VIEW;
  const clearSelection = useExplorer((s) => s.setSelectedPart);
  return (
    <div className="absolute inset-0 touch-none bg-mist">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: view, fov: 30, near: 0.1, far: 400 }}
        onPointerMissed={() => clearSelection(null)}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <CameraRig />
        <Suspense fallback={null}>
          <Surroundings />
          <CarModel state={state} plate={plate} />
          <ContactShadows position={[0, 0.005, 0]} opacity={0.75} scale={9} blur={2.2} far={2.2} resolution={512} color="#1a1a1a" />
        </Suspense>
        <OrbitControls
          target={TARGET}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={3.4}
          maxDistance={13}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI / 2 - 0.06}
        />
      </Canvas>
      <LoadingOverlay />
    </div>
  );
}
