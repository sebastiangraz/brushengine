import * as THREE from "three";
import { BRUSH_DATA_URIS } from "./brushData";

/**
 * Load the bundled SVG strokes as textures. SVGs render into an <img>, which we
 * upload as a normal texture; the ink lives in the alpha channel and is recolored
 * per-stroke in the fragment shader.
 *
 * Defaults to the inlined base64 data URIs (see brushData.ts) so the package is
 * self-contained; pass your own URLs to override.
 */
export function loadBrushTextures(
  urls: string[] = BRUSH_DATA_URIS,
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
