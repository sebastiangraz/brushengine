import type { GlobalStyle, ProjectionParams } from "../engine/types";

interface Props {
  projection: ProjectionParams;
  setProjection: (p: ProjectionParams) => void;
  globalStyle: GlobalStyle;
  setGlobalStyle: (g: GlobalStyle) => void;
  scene: string;
  setScene: (s: string) => void;
  showGuides: boolean;
  setShowGuides: (v: boolean) => void;
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
      <span className="ctl-value">{value.toFixed(2)}</span>
    </label>
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
  onReset,
}: Props) {
  const p = projection;
  const set = (patch: Partial<ProjectionParams>) =>
    setProjection({ ...p, ...patch });

  return (
    <aside className="panel">
      <h1>Brush&nbsp;Engine</h1>
      <p className="sub">
        2-point perspective · screen-space brush ribbons
      </p>

      <section>
        <h2>Scene</h2>
        <div className="seg">
          {["building", "house"].map((s) => (
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

      <section>
        <h2>Brush</h2>
        <div className="seg">
          {[
            { v: null as number | null, label: "auto" },
            { v: 0, label: "stroke 1" },
            { v: 1, label: "stroke 2" },
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
