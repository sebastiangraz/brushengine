import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders";
import { buildStrokeGeometry } from "./Stroke";
import { meanDepth } from "./projection";
import type {
  GlobalStyle,
  ProjectionParams,
  StrokeData,
  Vec3,
} from "./types";

// Normalise any CSS colour string to straight sRGB floats. We write the colour
// directly to the framebuffer from a RawShaderMaterial (no three colour mgmt),
// so we need the literal sRGB components, not linearised ones.
const _probe = document.createElement("canvas");
_probe.width = _probe.height = 1;
const _pctx = _probe.getContext("2d")!;
function parseColor(css: string): [number, number, number] {
  _pctx.clearRect(0, 0, 1, 1);
  _pctx.fillStyle = "#000";
  _pctx.fillStyle = css;
  _pctx.fillRect(0, 0, 1, 1);
  const d = _pctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

interface StrokeEntry {
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  points: Vec3[];
  brushIndex: number;
}

export class BrushEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera(); // unused matrices; we set gl_Position directly
  private entries: StrokeEntry[] = [];
  private brushes: THREE.Texture[] = [];

  private params: ProjectionParams = {
    vpX: { x: 0.95, y: -0.25 },
    vpZ: { x: -0.95, y: -0.25 },
    origin: { x: 0, y: -0.1 },
    perspective: 0.35,
    verticalScale: 0.9,
    zoom: 1,
  };
  private global: GlobalStyle = { thicknessFalloff: 0, brushOverride: null };

  private width = 1;
  private height = 1;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 0);
  }

  setBrushes(textures: THREE.Texture[]) {
    this.brushes = textures;
    // Re-point existing materials at the (possibly newly loaded) textures.
    for (const e of this.entries) {
      const b = e.material.uniforms.uBrush;
      const idx = e.material.userData.brush as number;
      if (this.brushes[idx]) b.value = this.brushes[idx];
    }
  }

  setStrokes(strokes: StrokeData[]) {
    for (const e of this.entries) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.material.dispose();
    }
    this.entries = [];

    for (const s of strokes) {
      const geo = buildStrokeGeometry(s.points);
      const [r, g, b] = parseColor(s.style.color);
      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uVpX: { value: new THREE.Vector2() },
          uVpZ: { value: new THREE.Vector2() },
          uOrigin: { value: new THREE.Vector2() },
          uPerspective: { value: 0 },
          uVerticalScale: { value: 1 },
          uZoom: { value: 1 },
          uAspect: { value: 1 },
          uWidthPx: { value: s.style.widthPx },
          uViewportH: { value: 1 },
          uThicknessFalloff: { value: 0 },
          uBrush: { value: this.brushes[s.style.brush] ?? null },
          uColor: { value: new THREE.Vector3(r, g, b) },
          uOpacity: { value: s.style.opacity },
        },
      });
      material.userData.brush = s.style.brush;
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.entries.push({
        mesh,
        material,
        points: s.points,
        brushIndex: s.style.brush,
      });
    }
  }

  setProjection(params: ProjectionParams) {
    this.params = params;
  }

  setGlobalStyle(style: GlobalStyle) {
    this.global = style;
  }

  getProjection(): ProjectionParams {
    return this.params;
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
  }

  private renderOnce = () => {
    const p = this.params;
    const dpr = this.renderer.getPixelRatio();
    const viewportH = this.height * dpr;
    const aspect = this.width / this.height;

    for (const e of this.entries) {
      const u = e.material.uniforms;
      u.uVpX.value.set(p.vpX.x, p.vpX.y);
      u.uVpZ.value.set(p.vpZ.x, p.vpZ.y);
      u.uOrigin.value.set(p.origin.x, p.origin.y);
      u.uPerspective.value = p.perspective;
      u.uVerticalScale.value = p.verticalScale;
      u.uZoom.value = p.zoom;
      u.uAspect.value = aspect;
      u.uViewportH.value = viewportH;
      u.uThicknessFalloff.value = this.global.thicknessFalloff;
      const bi = this.global.brushOverride ?? e.brushIndex;
      if (this.brushes[bi]) u.uBrush.value = this.brushes[bi];
      // Painter's order: farther (larger w) draws first.
      e.mesh.renderOrder = -meanDepth(e.points, p);
    }

    this.renderer.render(this.scene, this.camera);
  };

  render() {
    this.renderOnce();
  }

  start() {
    const loop = () => {
      this.renderOnce();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    for (const e of this.entries) {
      e.mesh.geometry.dispose();
      e.material.dispose();
    }
    this.entries = [];
    this.renderer.dispose();
  }
}
