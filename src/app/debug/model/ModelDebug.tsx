"use client";

// Debug view for public/models/f56.glb: every recolourable part (node with
// extras.part) gets a distinct colour; hover shows its id.
// ?view=fl|fr|rl|rr|left|right|front|rear|top picks a camera preset.

import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

const VIEWS: Record<string, [number, number, number]> = {
  fl: [3.2, 1.6, 3.6],
  fr: [-3.2, 1.6, 3.6],
  rl: [3.2, 1.6, -3.6],
  rr: [-3.2, 1.6, -3.6],
  left: [5, 0.9, 0],
  right: [-5, 0.9, 0],
  front: [0, 1, 5],
  rear: [0, 1, -5],
  top: [0.01, 6, 0],
  grille: [0.6, 0.7, 3.4],
  scoop: [0.05, 1.5, 3.1],
  spoiler: [-2.4, 1.6, -3.9],
  spoiler_side: [-4.2, 1.4, -1.4],
  spoiler_close: [-1.3, 1.9, -3.2],
};

// Golden-angle hues so neighbouring indices never look alike.
const colorFor = (i: number) =>
  new THREE.Color().setHSL(((i * 137.508) % 360) / 360, 0.7, i % 2 ? 0.45 : 0.62);

function Car({ onHover, onParts }: { onHover: (p: string | null) => void; onParts: (p: string[]) => void }) {
  const src = typeof window === "undefined" ? "/models/f56.glb" : new URLSearchParams(window.location.search).get("src") ?? "/models/f56.glb";
  const { scene } = useGLTF(src);
  const parts = useMemo(() => {
    const list: string[] = [];
    scene.traverse((o) => {
      const part = o.userData.part as string | undefined;
      if (!part) return;
      list.push(part);
      if (new URLSearchParams(window.location.search).has("real")) return;
      const mat = new THREE.MeshStandardMaterial({ color: colorFor(list.length - 1), roughness: 0.5 });
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          (m as THREE.Mesh).material = mat;
          m.userData.partId = part;
        }
      });
    });
    // FBX glass comes through as opaque; make it see-through so lamps are visible
    scene.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
        if (/glass|Window/i.test(mat.name)) Object.assign(mat, { transparent: true, opacity: 0.2, depthWrite: false });
      }
    });
    return list;
  }, [scene]);

  useEffect(() => {
    onParts(parts);
    requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true)));
  }, [parts, onParts]);

  return (
    <primitive
      object={scene}
      scale={src.includes("_jcw") ? 100 : 1}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover((e.object.userData.partId as string) ?? e.object.name);
      }}
      onPointerOut={() => onHover(null)}
    />
  );
}

export default function ModelDebug() {
  const [hover, setHover] = useState<string | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [view, setView] = useState<[number, number, number]>(VIEWS.fl);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    // one-off read of the URL after mount (window is not available during prerender)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v && VIEWS[v]) setView(VIEWS[v]);
  }, []);

  return (
    <div className="relative h-screen w-full bg-neutral-200">
      <Canvas key={view.join()} camera={{ position: view, fov: 35 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.5} />
        <hemisphereLight args={["#ffffff", "#444444", 1.2]} />
        <Car onHover={setHover} onParts={setParts} />
        <OrbitControls target={[0, 0.7, 0]} />
      </Canvas>
      <div className="absolute left-4 top-4 rounded bg-black/70 px-3 py-2 font-mono text-sm text-white">
        {hover ?? "hover a part"}
      </div>
      <ul className="absolute right-4 top-4 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded bg-white/85 px-3 py-2 font-mono text-xs">
        {parts.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `#${colorFor(i).getHexString()}` }} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
