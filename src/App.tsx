import { useMemo, useState } from "react";
import { Stage } from "./components/Stage";
import { ControlPanel } from "./components/ControlPanel";
import { buildingScene } from "./scenes/box";
import { houseScene } from "./scenes/house";
import type { GlobalStyle, ProjectionParams } from "./engine/types";
import "./App.css";

const DEFAULT_PROJECTION: ProjectionParams = {
  vpX: { x: 1.4, y: -0.5 },
  vpZ: { x: -1.4, y: -0.5 },
  origin: { x: 0, y: -0.3 },
  perspective: 0.35,
  verticalScale: 0.52,
  zoom: 1,
};

export default function App() {
  const [scene, setScene] = useState("building");
  const [projection, setProjection] = useState<ProjectionParams>(
    DEFAULT_PROJECTION
  );
  const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
    thicknessFalloff: 0,
    brushOverride: null,
    inkBlend: true,
  });
  const [showGuides, setShowGuides] = useState(true);

  const strokes = useMemo(
    () => (scene === "house" ? houseScene() : buildingScene()),
    [scene]
  );

  return (
    <div className="app">
      <ControlPanel
        projection={projection}
        setProjection={setProjection}
        globalStyle={globalStyle}
        setGlobalStyle={setGlobalStyle}
        scene={scene}
        setScene={setScene}
        showGuides={showGuides}
        setShowGuides={setShowGuides}
        onReset={() => setProjection(DEFAULT_PROJECTION)}
      />
      <Stage
        strokes={strokes}
        projection={projection}
        setProjection={setProjection}
        globalStyle={globalStyle}
        showGuides={showGuides}
      />
    </div>
  );
}
