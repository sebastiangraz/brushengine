import { useEffect, useMemo, useRef, useState } from "react";
import { BrushEngine } from "../engine/BrushEngine";
import { loadBrushTextures } from "../engine/brushes";
import { projectNDC } from "../engine/projection";
import type {
  GlobalStyle,
  ProjectionParams,
  StrokeData,
  Vec2,
  Vec3,
} from "../engine/types";

interface Props {
  strokes: StrokeData[];
  projection: ProjectionParams;
  setProjection: (p: ProjectionParams) => void;
  globalStyle: GlobalStyle;
  showGuides: boolean;
}

type Handle = "vpX" | "vpZ" | "origin";

function boundsCorners(strokes: StrokeData[]): Vec3[] {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of strokes)
    for (const p of s.points)
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
  if (!isFinite(min[0])) return [];
  const xs = [min[0], max[0]];
  const ys = [min[1], max[1]];
  const zs = [min[2], max[2]];
  const out: Vec3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push([x, y, z]);
  return out;
}

export function Stage({
  strokes,
  projection,
  setProjection,
  globalStyle,
  showGuides,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BrushEngine | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [ready, setReady] = useState(false);
  const drag = useRef<Handle | null>(null);

  // Create the engine once and load brush textures.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new BrushEngine(canvasRef.current);
    engineRef.current = engine;
    let alive = true;
    loadBrushTextures().then((tex) => {
      if (!alive) return;
      engine.setBrushes(tex);
      setReady(true);
    });
    engine.start();
    return () => {
      alive = false;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      engineRef.current?.resize(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (ready) engineRef.current?.setStrokes(strokes);
  }, [strokes, ready]);
  useEffect(() => {
    engineRef.current?.setProjection(projection);
  }, [projection]);
  useEffect(() => {
    engineRef.current?.setGlobalStyle(globalStyle);
  }, [globalStyle]);

  // --- square-frame NDC <-> pixel mapping ---
  // Mirrors the shader's uFit so guides/handles track the rendered model
  // regardless of canvas aspect.
  const { w, h } = size;
  const minDim = Math.min(w, h);
  const fitX = minDim / w;
  const fitY = minDim / h;
  const ndcToPx = (n: Vec2) => ({
    x: (n.x * fitX * 0.5 + 0.5) * w,
    y: (0.5 - n.y * fitY * 0.5) * h,
  });
  const pxToNdc = (x: number, y: number): Vec2 => ({
    x: ((x / w) * 2 - 1) / fitX,
    y: (1 - (y / h) * 2) / fitY,
  });

  const z = projection.zoom;
  // Where each handle appears on screen (the actual on-screen convergence point).
  const handlePos: Record<Handle, Vec2> = {
    vpX: { x: projection.vpX.x * z, y: projection.vpX.y * z },
    vpZ: { x: projection.vpZ.x * z, y: projection.vpZ.y * z },
    origin: { x: projection.origin.x * z, y: projection.origin.y * z },
  };

  const corners = useMemo(() => boundsCorners(strokes), [strokes]);

  const guideLines = useMemo(() => {
    if (!showGuides) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const key of ["vpX", "vpZ"] as const) {
      const vp = ndcToPx(handlePos[key]);
      for (const c of corners) {
        const p = projectNDC(c, projection);
        if (p.w <= 0.001) continue;
        const px = ndcToPx({ x: p.x, y: p.y });
        lines.push({ x1: vp.x, y1: vp.y, x2: px.x, y2: px.y });
      }
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGuides, corners, projection, w, h]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const n = pxToNdc(e.clientX - r.left, e.clientY - r.top);
    const next = { x: n.x / z, y: n.y / z };
    setProjection({ ...projection, [drag.current]: next });
  };

  return (
    <div
      ref={containerRef}
      className="stage"
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <canvas ref={canvasRef} className="stage-canvas" />
      <svg className="stage-overlay" width={w} height={h}>
        {guideLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="#ff5fbf"
            strokeWidth={0.75}
            opacity={0.4}
          />
        ))}
        {showGuides &&
          (["vpX", "vpZ", "origin"] as const).map((key) => {
            const p = ndcToPx(handlePos[key]);
            const color = key === "origin" ? "#888" : "#ff5fbf";
            return (
              <g key={key}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={9}
                  fill="white"
                  stroke={color}
                  strokeWidth={2}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    drag.current = key;
                    (e.target as Element).setPointerCapture(e.pointerId);
                  }}
                />
                <text
                  x={p.x + 12}
                  y={p.y - 10}
                  fill={color}
                  fontSize={11}
                  fontFamily="ui-monospace, monospace"
                >
                  {key === "vpX" ? "VP→X" : key === "vpZ" ? "VP→Z" : "origin"}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
