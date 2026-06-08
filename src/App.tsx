import { useMemo, useState } from "react";
import { Stage } from "./components/Stage";
import { ControlPanel } from "./components/ControlPanel";
import { buildingScene } from "./scenes/box";
import { houseScene } from "./scenes/house";
import { cityScene, DEFAULT_CITY, type CityParams } from "./scenes/city";
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

// Worm's-eye view that suits a clustered skyline rising from a ground line.
const CITY_PROJECTION: ProjectionParams = {
  vpX: { x: 2.2, y: -0.04 },
  vpZ: { x: -2.2, y: -0.04 },
  origin: { x: 0, y: -0.86 },
  perspective: 0.24,
  verticalScale: 0.38,
  zoom: 1.05,
};

const SCENE_PROJECTION: Record<string, ProjectionParams> = {
  building: DEFAULT_PROJECTION,
  house: DEFAULT_PROJECTION,
  city: CITY_PROJECTION,
};

export default function App() {
  const [scene, setScene] = useState("city");
  const [projection, setProjection] =
    useState<ProjectionParams>(DEFAULT_PROJECTION);
  const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
    thicknessFalloff: 0,
    brushOverride: 2,
    inkBlend: true,
  });
  const [showGuides, setShowGuides] = useState(true);
  const [cityParams, setCityParams] = useState<CityParams>(DEFAULT_CITY);

  // Switching scene also drops in that scene's natural default camera.
  const changeScene = (s: string) => {
    setScene(s);
    setProjection(SCENE_PROJECTION[s] ?? DEFAULT_PROJECTION);
  };

  const strokes = useMemo(() => {
    if (scene === "house") return houseScene();
    if (scene === "city") return cityScene(cityParams);
    return buildingScene();
  }, [scene, cityParams]);

  return (
    <div className="app">
      <ControlPanel
        projection={projection}
        setProjection={setProjection}
        globalStyle={globalStyle}
        setGlobalStyle={setGlobalStyle}
        scene={scene}
        setScene={changeScene}
        showGuides={showGuides}
        setShowGuides={setShowGuides}
        cityParams={cityParams}
        setCityParams={setCityParams}
        onReset={() =>
          setProjection(SCENE_PROJECTION[scene] ?? DEFAULT_PROJECTION)
        }
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
