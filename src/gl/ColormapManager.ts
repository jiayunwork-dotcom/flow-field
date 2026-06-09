import { GLContext } from './GLContext';
import type { ColormapName } from '../store/types';

const COLORMAP_DATA: Record<ColormapName, number[][]> = {
  viridis: [
    [0.267, 0.005, 0.329], [0.282, 0.141, 0.458], [0.226, 0.336, 0.545],
    [0.128, 0.567, 0.551], [0.369, 0.789, 0.383], [0.993, 0.906, 0.144],
  ],
  magma: [
    [0.001, 0.000, 0.014], [0.183, 0.050, 0.332], [0.494, 0.012, 0.498],
    [0.798, 0.175, 0.404], [0.976, 0.553, 0.250], [0.988, 0.998, 0.645],
  ],
  inferno: [
    [0.001, 0.000, 0.014], [0.207, 0.036, 0.396], [0.504, 0.060, 0.502],
    [0.796, 0.212, 0.340], [0.964, 0.546, 0.147], [0.988, 0.998, 0.645],
  ],
  plasma: [
    [0.050, 0.030, 0.528], [0.232, 0.017, 0.614], [0.470, 0.092, 0.558],
    [0.696, 0.272, 0.398], [0.893, 0.506, 0.201], [0.940, 0.975, 0.131],
  ],
  turbo: [
    [0.190, 0.024, 0.655], [0.301, 0.237, 0.920], [0.263, 0.650, 0.812],
    [0.404, 0.911, 0.411], [0.815, 0.920, 0.109], [0.948, 0.560, 0.024],
    [0.735, 0.016, 0.012],
  ],
};

export class ColormapManager {
  private glCtx: GLContext;
  private textures: Map<ColormapName, WebGLTexture> = new Map();
  private width = 256;

  constructor(glCtx: GLContext) {
    this.glCtx = glCtx;
  }

  getTexture(name: ColormapName): WebGLTexture {
    if (this.textures.has(name)) return this.textures.get(name)!;
    const tex = this.createColormapTexture(name);
    this.textures.set(name, tex);
    return tex;
  }

  private createColormapTexture(name: ColormapName): WebGLTexture {
    const data = COLORMAP_DATA[name];
    const pixels = new Uint8Array(this.width * 4);
    const stops = data.length;

    for (let i = 0; i < this.width; i++) {
      const t = i / (this.width - 1);
      const segT = t * (stops - 1);
      const idx = Math.min(Math.floor(segT), stops - 2);
      const frac = segT - idx;
      const c0 = data[idx];
      const c1 = data[idx + 1];
      pixels[i * 4 + 0] = Math.round((c0[0] + (c1[0] - c0[0]) * frac) * 255);
      pixels[i * 4 + 1] = Math.round((c0[1] + (c1[1] - c0[1]) * frac) * 255);
      pixels[i * 4 + 2] = Math.round((c0[2] + (c1[2] - c0[2]) * frac) * 255);
      pixels[i * 4 + 3] = 255;
    }

    const tex = this.glCtx.createTexture(
      this.width, 1, pixels,
      WebGL2RenderingContext.RGBA8,
      WebGL2RenderingContext.RGBA,
      WebGL2RenderingContext.UNSIGNED_BYTE,
      WebGL2RenderingContext.LINEAR
    );
    if (!tex) throw new Error('Failed to create colormap texture');
    return tex;
  }

  cleanup() {
    this.textures.forEach((tex) => this.glCtx.deleteTexture(tex));
    this.textures.clear();
  }
}
