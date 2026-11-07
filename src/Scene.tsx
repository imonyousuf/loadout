import { Canvas, advance, useFrame, useThree } from "@react-three/fiber";
import { Edges, Line, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LIMITS, PALLET, type Pallet } from "./engine/pack";
import type { Product } from "./engine/products";

const ACCENT = "#ff5b1f";
/**
 * Recording mode (?capture), used to film the tour: the scene draws only when a recorder steps
 * it, one exact frame at a time, so footage is smooth however slow the machine rendering it is.
 */
const CAPTURE = typeof location !== "undefined" && new URLSearchParams(location.search).has("capture");
const DECK = PALLET.deckHeight;
const GAP = 0.18; // visual gap between cases, in inches

export interface Hover {
  index: number;
  layer: number;
}

interface Props {
  pallet: Pallet | null;
  /** every product, built-in and user-added, by id */
  products: Record<string, Product>;
  /** changes whenever the whole pallet should rebuild from scratch */
  buildId: string;
  focusLayer: number | null;
  focusProduct: string | null;
  onHover: (h: Hover | null) => void;
  autoRotate: boolean;
  reduceMotion: boolean;
}

export default function Scene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={CAPTURE ? "never" : "always"}
      camera={{ position: [118, 92, 138], fov: 34, near: 1, far: 2000 }}
      gl={{ antialias: !CAPTURE, preserveDrawingBuffer: CAPTURE }}
      onPointerMissed={() => props.onHover(null)}
    >
      {CAPTURE && <CaptureClock />}
      <color attach="background" args={["#0b0b0c"]} />
      <fog attach="fog" args={["#0b0b0c", 220, 520]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[60, 140, 70]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-bias={-0.0002}
        shadow-normalBias={0.5}
      />
      <directionalLight position={[-80, 40, -60]} intensity={0.5} color="#ffd9c4" />
      <Floor />
      <PalletDeck />
      <HeightLimit />
      <Cases {...props} />
      <OrbitControls
        target={[0, 30, 0]}
        enablePan={false}
        minDistance={90}
        maxDistance={260}
        maxPolarAngle={Math.PI * 0.47}
        autoRotate={props.autoRotate && !props.reduceMotion}
        autoRotateSpeed={CAPTURE ? 1.1 : 0.55}
        enableDamping
      />
      <Resize />
    </Canvas>
  );
}

/** In recording mode, lets the recorder draw a frame at an exact time, in seconds. */
function CaptureClock() {
  useEffect(() => {
    (window as unknown as { __advance: (s: number) => void }).__advance = (s) => advance(s);
  }, []);
  return null;
}

/** Keeps the camera framing sensible on narrow screens. */
function Resize() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = size.width < 640 ? 46 : 34;
    cam.updateProjectionMatrix();
  }, [camera, size.width]);
  return null;
}

/** A halftone dot floor that fades out from the pallet, plus a shadow catcher. */
function Floor() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uDot: { value: new THREE.Color("#3a3a40") }, uAccent: { value: new THREE.Color(ACCENT) } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vP; uniform vec3 uDot; uniform vec3 uAccent;
          void main(){
            float d = length(vP);
            vec2 g = fract(vP / 4.0) - 0.5;
            float r = mix(0.26, 0.04, smoothstep(30.0, 190.0, d));
            float dotMask = 1.0 - smoothstep(r - 0.03, r, length(g));
            float fade = 1.0 - smoothstep(60.0, 210.0, d);
            // a faint safety-orange ring where the forklift drops the pallet
            float ring = smoothstep(1.2, 0.0, abs(d - 46.0)) * 0.35;
            vec3 col = mix(uDot, uAccent, ring);
            gl_FragColor = vec4(col, max(dotMask * fade * 0.9, ring * fade));
          }`,
      }),
    [],
  );
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh material={mat} position={[0, 0, 0.02]}>
        <planeGeometry args={[440, 440]} />
      </mesh>
      <mesh receiveShadow position={[0, 0, 0.04]}>
        <planeGeometry args={[440, 440]} />
        <shadowMaterial opacity={0.45} />
      </mesh>
    </group>
  );
}

/** A 48 × 40 wooden skid: three stringers, top deck boards. */
function PalletDeck() {
  const wood = "#b98e5c";
  const boards = 7;
  const boardW = 5.2;
  const step = (PALLET.width - boardW) / (boards - 1);
  return (
    <group>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} castShadow receiveShadow position={[0, (DECK - 0.75) / 2, k * (PALLET.width / 2 - 1.75)]}>
          <boxGeometry args={[PALLET.length, DECK - 0.75, 3.5]} />
          <meshStandardMaterial color="#8c6a43" roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: boards }, (_, i) => (
        <mesh key={i} castShadow receiveShadow position={[0, DECK - 0.375, -PALLET.width / 2 + boardW / 2 + i * step]}>
          <boxGeometry args={[PALLET.length, 0.75, boardW]} />
          <meshStandardMaterial color={wood} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** A dashed outline at the 60 in load limit. */
function HeightLimit() {
  const y = DECK + LIMITS.maxLoadHeight;
  const hx = PALLET.length / 2;
  const hz = PALLET.width / 2;
  const pts: [number, number, number][] = [
    [-hx, y, -hz],
    [hx, y, -hz],
    [hx, y, hz],
    [-hx, y, hz],
    [-hx, y, -hz],
  ];
  return <Line points={pts} color={ACCENT} lineWidth={1.2} dashed dashSize={2} gapSize={1.6} transparent opacity={0.7} />;
}

/** Page time in seconds: real time, or the recorder's exact time in recording mode. */
const seconds = () => performance.now() / 1000;

const easeOutBack = (t: number) => {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** The cases. New cases drop in one after another; cases that did not move stay put. */
function Cases({ pallet, products, buildId, focusLayer, focusProduct, onHover, reduceMotion }: Props) {
  const boxes = pallet?.boxes ?? [];
  const layerOf = useMemo(() => {
    if (!pallet) return [] as number[];
    return pallet.boxes.map((b) => pallet.layers.findIndex((l) => Math.abs(l.y - b.y) < 1e-6));
  }, [pallet]);

  const keys = useMemo(() => boxes.map((b) => `${b.productId}|${b.x.toFixed(2)}|${b.y.toFixed(2)}|${b.z.toFixed(2)}|${b.dx.toFixed(2)}`), [boxes]);
  const prevKeys = useRef<Set<string>>(new Set());
  const prevBuild = useRef(buildId);
  const anim = useRef<{ start: number; order: Map<number, number>; per: number }>({ start: -1, order: new Map(), per: 0.03 });
  const last = useRef(seconds());

  // a layout effect, so new cases are hidden before the next frame draws them at rest
  useLayoutEffect(() => {
    const rebuild = prevBuild.current !== buildId;
    prevBuild.current = buildId;
    const fresh: number[] = [];
    keys.forEach((k, i) => {
      if (rebuild || !prevKeys.current.has(k)) fresh.push(i);
    });
    fresh.sort((a, b) => boxes[a].seq - boxes[b].seq);
    const order = new Map<number, number>();
    fresh.forEach((i, n) => order.set(i, n));
    anim.current = { start: seconds(), order, per: Math.min(0.045, 2.6 / Math.max(fresh.length, 1)) };
    prevKeys.current = new Set(keys);
  }, [keys, buildId, boxes]);

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const now = seconds();
    // dimming eases at the same speed whatever the frame rate
    const ease = 1 - Math.pow(0.8, Math.min(0.1, Math.max(0, now - last.current)) * 60);
    last.current = now;
    const { start, order, per } = anim.current;
    const t = now - start;
    boxes.forEach((b, i) => {
      const m = refs.current[i];
      if (!m) return;
      const restY = DECK + b.y + b.dy / 2;
      const n = order.get(i);
      let y = restY;
      let s = 1;
      let vis = true;
      if (n !== undefined && !reduceMotion) {
        const local = (t - n * per) / 0.42;
        if (local <= 0) vis = false;
        else if (local < 1) {
          const e = easeOutBack(local);
          y = restY + (1 - e) * 34;
          s = 0.92 + 0.08 * Math.min(1, local * 1.6);
        }
      }
      m.visible = vis;
      m.position.y = y;
      m.scale.setScalar(s);
      const dim = (focusLayer !== null && layerOf[i] !== focusLayer) || (focusProduct !== null && b.productId !== focusProduct);
      const mat = m.material as THREE.MeshStandardMaterial;
      const target = dim ? 0.12 : 1;
      mat.opacity += (target - mat.opacity) * ease;
      if (Math.abs(mat.opacity - target) < 0.005) mat.opacity = target;
      const want = mat.opacity < 0.999;
      if (mat.transparent !== want) {
        mat.transparent = want;
        mat.depthWrite = !want;
        mat.needsUpdate = true;
      }
    });
  });

  return (
    <group position={[-PALLET.length / 2, 0, -PALLET.width / 2]}>
      {boxes.map((b, i) => {
        const p = products[b.productId];
        if (!p) return null;
        return (
          <mesh
            key={keys[i] + "#" + i}
            ref={(m) => {
              refs.current[i] = m;
            }}
            position={[b.x + b.dx / 2, DECK + b.y + b.dy / 2, b.z + b.dz / 2]}
            castShadow
            receiveShadow
            onPointerOver={(e) => {
              e.stopPropagation();
              if (e.object.visible) onHover({ index: i, layer: layerOf[i] });
            }}
            onPointerOut={() => onHover(null)}
          >
            <boxGeometry args={[b.dx - GAP, b.dy - GAP, b.dz - GAP]} />
            <meshStandardMaterial color={p.color} roughness={p.fragile ? 0.95 : 0.6} metalness={0.02} />
            <Edges threshold={15} color={p.fragile ? "#b9b2a0" : "#0b0b0c"} />
          </mesh>
        );
      })}
    </group>
  );
}
