import * as THREE from "three";

export const BRUSH_URLS = ["/brushes/stroke1.svg", "/brushes/stroke2.svg"];

/**
 * Load the bundled SVG strokes as textures. SVGs render into an <img>, which we
 * upload as a normal texture; the ink lives in the alpha channel and is recolored
 * per-stroke in the fragment shader.
 */
export function loadBrushTextures(
  urls: string[] = BRUSH_URLS,
): Promise<THREE.Texture[]> {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(
            url,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.generateMipmaps = true;
              tex.anisotropy = 4;
              tex.needsUpdate = true;
              resolve(tex);
            },
            undefined,
            reject,
          );
        }),
    ),
  );
}
