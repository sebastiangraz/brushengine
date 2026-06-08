import { useState } from "react";
import type { GlobalStyle, ProjectionParams } from "../engine/types";
import {
  encodeCity,
  decodeCity,
  DEFAULT_CITY,
  type CityParams,
} from "../scenes/city";

interface Props {
  projection: ProjectionParams;
  setProjection: (p: ProjectionParams) => void;
  globalStyle: GlobalStyle;
  setGlobalStyle: (g: GlobalStyle) => void;
  scene: string;
  setScene: (s: string) => void;
  showGuides: boolean;
  setShowGuides: (v: boolean) => void;
  cityParams: CityParams;
  setCityParams: (p: CityParams) => void;
  onReset: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="ctl-row">
      <span className="ctl-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="ctl-value">
        {step >= 1 ? value.toFixed(0) : value.toFixed(2)}
      </span>
    </label>
  );
}

function CitySection({
  cityParams,
  setCityParams,
}: {
  cityParams: CityParams;
  setCityParams: (p: CityParams) => void;
}) {
  const c = cityParams;
  const setP = (patch: Partial<CityParams>) =>
    setCityParams({ ...c, ...patch });
  const code = encodeCity(c);
  const [loadText, setLoadText] = useState("");

  const load = () => {
    const t = loadText.trim();
    if (!t) return;
    if (/^\d+$/.test(t)) {
      setP({ seed: parseInt(t, 10) }); // plain seed number
    } else {
      const decoded = decodeCity(t);
      if (decoded) setCityParams(decoded); // full scene code
    }
    setLoadText("");
  };

  return (
    <>
      <section>
        <h2>City seed</h2>
        <div className="seed-row">
          <input
            className="seed-input"
            type="number"
            value={c.seed}
            onChange={(e) =>
              setP({ seed: parseInt(e.target.value || "0", 10) })
            }
          />
          <button
            title="random seed"
            onClick={() => setP({ seed: Math.floor(Math.random() * 1e3) })}
          >
            ⟳
          </button>
        </div>

        <p className="hint" style={{ marginBottom: 6 }}>
          Scene code — copy to reproduce this exact city elsewhere:
        </p>
        <div className="seed-row">
          <input className="seed-input" readOnly value={code} />
          <button
            title="copy scene code"
            onClick={() => navigator.clipboard?.writeText(code)}
          >
            ⧉
          </button>
        </div>
        <div className="seed-row">
          <input
            className="seed-input"
            placeholder="paste seed # or scene code"
            value={loadText}
            onChange={(e) => setLoadText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button onClick={load}>load</button>
        </div>
      </section>

      <section>
        <h2>City parameters</h2>
        <Slider
          label="buildings"
          value={c.gridSize}
          min={2}
          max={9}
          step={1}
          onChange={(v) => setP({ gridSize: v })}
        />
        <Slider
          label="height peak"
          value={c.heightPeak}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ heightPeak: v })}
        />
        <Slider
          label="height var."
          value={c.heightVar}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ heightVar: v })}
        />
        <Slider
          label="windows"
          value={c.windowDensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ windowDensity: v })}
        />
        <Slider
          label="grid faces"
          value={c.gridDensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ gridDensity: v })}
        />
        <Slider
          label="grid var."
          value={c.gridVar}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ gridVar: v })}
        />
        <Slider
          label="grid gaps"
          value={c.gridGaps}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ gridGaps: v })}
        />
        <Slider
          label="guidelines"
          value={c.guidelineDensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ guidelineDensity: v })}
        />
        <Slider
          label="half-boxes"
          value={c.partialBox}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ partialBox: v })}
        />
        <Slider
          label="size variation"
          value={c.footprintVar}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ footprintVar: v })}
        />
        <Slider
          label="L-shapes"
          value={c.lShapeRatio}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ lShapeRatio: v })}
        />
        <Slider
          label="path wobble"
          value={c.wobble}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ wobble: v })}
        />
        <Slider
          label="guideline length"
          value={c.guidelineLength}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setP({ guidelineLength: v })}
        />
        <button className="reset" onClick={() => setCityParams(DEFAULT_CITY)}>
          reset city defaults
        </button>
      </section>
    </>
  );
}

export function ControlPanel({
  projection,
  setProjection,
  globalStyle,
  setGlobalStyle,
  scene,
  setScene,
  showGuides,
  setShowGuides,
  cityParams,
  setCityParams,
  onReset,
}: Props) {
  const p = projection;
  const set = (patch: Partial<ProjectionParams>) =>
    setProjection({ ...p, ...patch });

  return (
    <aside className="panel">
      <h1>Brush&nbsp;Engine</h1>
      <p className="sub">2-point perspective · screen-space brush ribbons</p>

      <section>
        <h2>Scene</h2>
        <div className="seg">
          {["building", "house", "city"].map((s) => (
            <button
              key={s}
              className={scene === s ? "on" : ""}
              onClick={() => setScene(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {scene === "city" && (
        <CitySection cityParams={cityParams} setCityParams={setCityParams} />
      )}

      <section>
        <h2>Brush</h2>
        <div className="seg">
          {[
            { v: null as number | null, label: "auto" },
            { v: 0, label: "stroke 1" },
            { v: 1, label: "stroke 2" },
            { v: 2, label: "stroke 3" },
          ].map((b) => (
            <button
              key={String(b.v)}
              className={globalStyle.brushOverride === b.v ? "on" : ""}
              onClick={() =>
                setGlobalStyle({ ...globalStyle, brushOverride: b.v })
              }
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Blending</h2>
        <label className="ctl-check">
          <input
            type="checkbox"
            checked={globalStyle.inkBlend}
            onChange={(e) =>
              setGlobalStyle({ ...globalStyle, inkBlend: e.target.checked })
            }
          />
          CMYK ink mix (darken overlaps)
        </label>
        <p className="hint">
          Overlapping strokes multiply like real ink — even two strokes of the
          same colour deepen where they cross.
        </p>
      </section>

      <section>
        <h2>Thickness</h2>
        <Slider
          label="dist. falloff"
          value={globalStyle.thicknessFalloff}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) =>
            setGlobalStyle({ ...globalStyle, thicknessFalloff: v })
          }
        />
        <p className="hint">
          0 = constant width regardless of distance · 1 = full perspective
          foreshortening · &gt;1 exaggerates.
        </p>
      </section>

      <section>
        <h2>Perspective</h2>
        <Slider
          label="focal / strength"
          value={p.perspective}
          min={0.02}
          max={1.2}
          step={0.01}
          onChange={(v) => set({ perspective: v })}
        />
        <Slider
          label="vertical scale"
          value={p.verticalScale}
          min={0.2}
          max={2}
          step={0.01}
          onChange={(v) => set({ verticalScale: v })}
        />
        <Slider
          label="zoom"
          value={p.zoom}
          min={0.3}
          max={2.5}
          step={0.01}
          onChange={(v) => set({ zoom: v })}
        />
      </section>

      <section>
        <h2>Vanishing points</h2>
        <p className="hint">Drag the pink handles on the canvas, or:</p>
        <Slider
          label="VP→X  x"
          value={p.vpX.x}
          min={-3}
          max={3}
          step={0.01}
          onChange={(v) => set({ vpX: { ...p.vpX, x: v } })}
        />
        <Slider
          label="VP→X  y"
          value={p.vpX.y}
          min={-2}
          max={2}
          step={0.01}
          onChange={(v) => set({ vpX: { ...p.vpX, y: v } })}
        />
        <Slider
          label="VP→Z  x"
          value={p.vpZ.x}
          min={-3}
          max={3}
          step={0.01}
          onChange={(v) => set({ vpZ: { ...p.vpZ, x: v } })}
        />
        <Slider
          label="VP→Z  y"
          value={p.vpZ.y}
          min={-2}
          max={2}
          step={0.01}
          onChange={(v) => set({ vpZ: { ...p.vpZ, y: v } })}
        />
      </section>

      <section>
        <label className="ctl-check">
          <input
            type="checkbox"
            checked={showGuides}
            onChange={(e) => setShowGuides(e.target.checked)}
          />
          show vanishing-point guides
        </label>
        <button className="reset" onClick={onReset}>
          reset view
        </button>
      </section>
    </aside>
  );
}
