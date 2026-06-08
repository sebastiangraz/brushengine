import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders";
import { buildMergedGeometry, type BatchItem } from "./Stroke";
import type { GlobalStyle, ProjectionParams, StrokeData } from "./types";

// Normalise any CSS colour string to straight sRGB floats, cached. We write the
// colour directly to the framebuffer from a RawShaderMaterial (no three colour
// management), so we need literal sRGB components, not linearised ones.
const _probe = document.createElement("canvas");
_probe.width = _probe.height = 1;
const _pctx = _probe.getContext("2d", { willReadFrequently: true })!;
const _colorCache = new Map<string, [number, number, number]>();
function parseColor(css: string): [number, number, number] {
  const hit = _colorCache.get(css);
  if (hit) return hit;
  _pctx.clearRect(0, 0, 1, 1);
  _pctx.fillStyle = "#000";
  _pctx.fillStyle = css;
  _pctx.fillRect(0, 0, 1, 1);
  const d = _pctx.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [d[0] / 255, d[1] / 255, d[2] / 255];
  _colorCache.set(css, rgb);
  return rgb;
}

interface Batch {
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  brushIndex: number;
}

export class BrushEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera(); // unused matrices; we set gl_Position directly
  private batches: Batch[] = [];
  private brushes: THREE.Texture[] = [];

  private params: ProjectionParams = {
    vpX: { x: 0.95, y: -0.25 },
    vpZ: { x: -0.95, y: -0.25 },
    origin: { x: 0, y: -0.1 },
    perspective: 0.35,
    verticalScale: 0.9,
    zoom: 1,
  };
  private global: GlobalStyle = {
    thicknessFalloff: 0,
    brushOverride: null,
    inkBlend: true,
  };

  private width = 1;
  private height = 1;
  private raf = 0;
  private dirty = true; // only do work / re-render when something changed

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
    this.dirty = true;
  }

  setStrokes(strokes: StrokeData[]) {
    for (const b of this.batches) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.material.dispose();
    }
    this.batches = [];

    // Group strokes by brush index, then merge each group into one geometry so
    // the whole scene draws in a handful of calls instead of one per stroke.
    const groups = new Map<number, BatchItem[]>();
    for (const s of strokes) {
      const bi = s.style.brush;
      let arr = groups.get(bi);
      if (!arr) groups.set(bi, (arr = []));
      arr.push({
        points: s.points,
        color: parseColor(s.style.color),
        widthPx: s.style.widthPx,
        opacity: s.style.opacity,
      });
    }

    for (const [brushIndex, items] of groups) {
      const geo = buildMergedGeometry(items);
      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uVpX: { value: new THREE.Vector2() },
          uVpZ: { value: new THREE.Vector2() },
          uOrigin: { value: new THREE.Vector2() },
          uPerspective: { value: 0 },
          uVerticalScale: { value: 1 },
          uZoom: { value: 1 },
          uFit: { value: new THREE.Vector2(1, 1) },
          uMinDim: { value: 1 },
          uThicknessFalloff: { value: 0 },
          uBrush: { value: this.brushes[brushIndex] ?? null },
          uInkBlend: { value: 1 },
        },
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.batches.push({ mesh, material, brushIndex });
    }

    this.applyBlendMode();
    this.dirty = true;
  }

  /**
   * Configure blending for the current ink-mix setting.
   * - ink mix on: opaque white canvas + multiply blending (dst * src), so
   *   overlapping ink darkens. Order-independent, so no sorting needed.
   * - off: transparent canvas + ordinary alpha ("over") blending.
   */
  private applyBlendMode() {
    const ink = this.global.inkBlend;
    this.renderer.setClearColor(0xffffff, ink ? 1 : 0);
    for (const b of this.batches) {
      const m = b.material;
      m.uniforms.uInkBlend.value = ink ? 1 : 0;
      if (ink) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = THREE.ZeroFactor;
        m.blendDst = THREE.SrcColorFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor; // keep the canvas opaque
      } else {
        m.blending = THREE.NormalBlending;
      }
    }
  }

  setProjection(params: ProjectionParams) {
    this.params = params;
    this.dirty = true;
  }

  setGlobalStyle(style: GlobalStyle) {
    this.global = style;
    this.applyBlendMode();
    this.dirty = true;
  }

  getProjection(): ProjectionParams {
    return this.params;
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.dirty = true;
  }

  private renderOnce = () => {
    if (!this.dirty) return; // scene is static between interactions
    this.dirty = false;

    const p = this.params;
    const minDim = Math.min(this.width, this.height);
    const fitX = minDim / this.width;
    const fitY = minDim / this.height;
    const override = this.global.brushOverride;

    for (const b of this.batches) {
      const u = b.material.uniforms;
      u.uVpX.value.set(p.vpX.x, p.vpX.y);
      u.uVpZ.value.set(p.vpZ.x, p.vpZ.y);
      u.uOrigin.value.set(p.origin.x, p.origin.y);
      u.uPerspective.value = p.perspective;
      u.uVerticalScale.value = p.verticalScale;
      u.uZoom.value = p.zoom;
      u.uFit.value.set(fitX, fitY);
      u.uMinDim.value = minDim;
      u.uThicknessFalloff.value = this.global.thicknessFalloff;
      const bi = override ?? b.brushIndex;
      if (this.brushes[bi]) u.uBrush.value = this.brushes[bi];
    }

    this.renderer.render(this.scene, this.camera);
  };

  render() {
    this.dirty = true;
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
    for (const b of this.batches) {
      b.mesh.geometry.dispose();
      b.material.dispose();
    }
    this.batches = [];
    this.renderer.dispose();
  }
}
