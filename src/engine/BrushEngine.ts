import * as THREE from "three";
import {
  vertexShader,
  fragmentShader,
  compositeVertexShader,
  compositeFragmentShader,
} from "./shaders";
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

  // Offscreen target + fullscreen composite for the two-pass ink-mix pipeline.
  private target: THREE.WebGLRenderTarget;
  private compositeScene = new THREE.Scene();
  private compositeMat: THREE.RawShaderMaterial;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      // The composite pass emits premultiplied colour (see compositeFragmentShader),
      // so the canvas must be a premultiplied-alpha surface.
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 0);

    // Plain 8-bit is enough: the composite only SUBTRACTS to un-premultiply
    // (Cp = T - (1 - a)), it never divides by alpha, so there's no precision
    // blow-up at soft edges. We deliberately avoid a HalfFloat target here —
    // Safari/WebKit can't reliably MSAA-resolve an RGBA16F colour buffer, which
    // left the offscreen coverage aliased and the old divide amplified that into
    // hard, pixelated brush edges. An 8-bit MSAA target resolves everywhere.
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      samples: 4, // MSAA on the offscreen pass so stroke edges stay smooth
    });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      "aPos",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2),
    );
    quad.setIndex([0, 1, 2]); // so three knows the vertex count to draw
    this.compositeMat = new THREE.RawShaderMaterial({
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms: { uTex: { value: this.target.texture }, uInk: { value: 1 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    const mesh = new THREE.Mesh(quad, this.compositeMat);
    mesh.frustumCulled = false;
    this.compositeScene.add(mesh);
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
   * Configure blending for the current ink-mix setting. The canvas is always
   * transparent (cleared to white *rgb* but zero alpha — the white rgb is the
   * multiply identity; the zero alpha keeps non-ink areas see-through).
   * - ink mix on: RGB multiplies (dst * src) so overlapping ink darkens, while
   *   alpha accumulates "over" so coverage builds up. Order-independent.
   * - off: ordinary alpha "over" on both channels.
   */
  private applyBlendMode() {
    this.renderer.setClearColor(0xffffff, 0);
    for (const b of this.batches) {
      const m = b.material;
      m.uniforms.uInkBlend.value = this.global.inkBlend ? 1 : 0;
      if (this.global.inkBlend) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = THREE.ZeroFactor; // RGB: dst * src  (multiply / darken)
        m.blendDst = THREE.SrcColorFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.OneFactor; // alpha: src + dst*(1-src)  (over)
        m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
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
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(Math.max(1, s.x), Math.max(1, s.y));
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

    // Both modes render into the offscreen MSAA target first, then a composite
    // pass blits it to the canvas. Routing plain "over" through the same target
    // (rather than straight to the default framebuffer) is deliberate: Safari
    // won't reliably multisample the default drawing buffer, so direct-to-canvas
    // strokes came out jagged — explicit render-target MSAA resolves everywhere.
    this.renderer.setRenderTarget(this.target);
    if (this.global.inkBlend) {
      // Pass 1: multiply strokes into the target (target.rgb = T over white,
      // target.a = coverage). The target MUST start at white RGB / zero alpha —
      // white is the multiply identity, zero alpha means "no ink". The renderer
      // is premultiplied-alpha, so three's own clear would premultiply our
      // (1,1,1,0) down to (0,0,0,0) and the multiply blend would wipe every
      // stroke to black. Clear the target by hand to dodge that.
      const gl = this.renderer.getContext();
      this.renderer.autoClear = false;
      gl.clearColor(1, 1, 1, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = true;
    } else {
      // Plain "over": three clears the target to transparent (premultiplied
      // (1,1,1,0) -> (0,0,0,0)), strokes composite premultiplied over it.
      this.renderer.render(this.scene, this.camera);
    }
    this.compositeMat.uniforms.uInk.value = this.global.inkBlend ? 1 : 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compositeScene, this.camera);
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
    this.target.dispose();
    this.compositeMat.dispose();
    this.renderer.dispose();
  }
}
