import { GLContext } from './GLContext';
import {
  QUAD_VS,
  FIELD_COMPUTE_FS,
  PARTICLE_UPDATE_FS,
  PARTICLE_POINT_VS,
  PARTICLE_POINT_FS,
  ARROW_FS,
  VORTICITY_FS,
  LIC_FS,
  TRAIL_FADE_FS,
  DISPLAY_FS,
  COLORMAP_FS,
} from './shaders';
import { ColormapManager } from './ColormapManager';
import type { FieldElement, PresetField, CustomField, GlobalParams, VectorFieldData } from '../store/types';

export class FlowFieldRenderer {
  private ctx: GLContext;
  private gl: WebGL2RenderingContext;
  private colormaps: ColormapManager;
  private quadVAO: WebGLVertexArrayObject;

  private fieldProgram: WebGLProgram;
  private particleUpdateProgram: WebGLProgram;
  private particlePointProgram: WebGLProgram;
  private arrowProgram: WebGLProgram;
  private vorticityProgram: WebGLProgram;
  private licProgram: WebGLProgram;
  private trailFadeProgram: WebGLProgram;
  private displayProgram: WebGLProgram;
  private colormapProgram: WebGLProgram;

  private fieldTexture: WebGLTexture | null = null;
  private fieldFBO: WebGLFramebuffer | null = null;
  private importedTexture: WebGLTexture | null = null;

  private posTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private posFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private currentPosIdx = 0;
  private particleTexSize: [number, number] = [256, 256];
  private needsParticleReset = true;

  private trailTexture: WebGLTexture | null = null;
  private trailFBO: WebGLFramebuffer | null = null;

  private licTexture: WebGLTexture | null = null;
  private licFBO: WebGLFramebuffer | null = null;
  private licNoiseTexture: WebGLTexture | null = null;

  private width = 1024;
  private height = 1024;
  private time = 0;
  private frameCount = 0;
  private initialized = false;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = GLContext.create(canvas);
    if (!ctx) throw new Error('Failed to create WebGL2 context');
    this.ctx = ctx;
    this.gl = ctx.gl;
    this.colormaps = new ColormapManager(ctx);

    const { vao } = ctx.setupFullscreenQuad();
    this.quadVAO = vao;

    const p = (vs: string, fs: string) => {
      const prog = ctx.createProgram(vs, fs);
      if (!prog) throw new Error(`Failed to compile shader program`);
      return prog;
    };

    this.fieldProgram = p(QUAD_VS, FIELD_COMPUTE_FS);
    this.particleUpdateProgram = p(QUAD_VS, PARTICLE_UPDATE_FS);
    this.particlePointProgram = p(PARTICLE_POINT_VS, PARTICLE_POINT_FS);
    this.arrowProgram = p(QUAD_VS, ARROW_FS);
    this.vorticityProgram = p(QUAD_VS, VORTICITY_FS);
    this.licProgram = p(QUAD_VS, LIC_FS);
    this.trailFadeProgram = p(QUAD_VS, TRAIL_FADE_FS);
    this.displayProgram = p(QUAD_VS, DISPLAY_FS);
    this.colormapProgram = p(QUAD_VS, COLORMAP_FS);

    this.initNoiseTexture();
    this.recreateTextures();
    this.initialized = true;
  }

  private initNoiseTexture() {
    const size = 512;
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 255;
    }
    this.licNoiseTexture = this.ctx.createTexture(
      size, size, data,
      WebGL2RenderingContext.R8,
      WebGL2RenderingContext.RED,
      WebGL2RenderingContext.UNSIGNED_BYTE,
      WebGL2RenderingContext.NEAREST
    );
  }

  resize(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.ctx.resize(width, height);
    this.recreateTextures();
  }

  private recreateTextures() {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    ctx.deleteTexture(this.fieldTexture);
    ctx.deleteFBO(this.fieldFBO);
    this.fieldTexture = ctx.createTexture(w, h, null);
    this.fieldFBO = ctx.createFBO(this.fieldTexture!);

    ctx.deleteTexture(this.trailTexture);
    ctx.deleteFBO(this.trailFBO);
    this.trailTexture = ctx.createTexture(w, h, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.trailFBO = ctx.createFBO(this.trailTexture!);

    ctx.deleteTexture(this.licTexture);
    ctx.deleteFBO(this.licFBO);
    this.licTexture = ctx.createTexture(w, h, null);
    this.licFBO = ctx.createFBO(this.licTexture!);

    this.createParticleTextures();
    this.needsParticleReset = true;
  }

  private createParticleTextures() {
    const { ctx } = this;
    const [w, h] = this.particleTexSize;
    for (let i = 0; i < 2; i++) {
      ctx.deleteTexture(this.posTextures[i]);
      ctx.deleteFBO(this.posFBOs[i]);
      this.posTextures[i] = ctx.createTexture(w, h, null);
      this.posFBOs[i] = ctx.createFBO(this.posTextures[i]!);
    }
  }

  setParticleCount(count: number) {
    const side = Math.ceil(Math.sqrt(count));
    if (this.particleTexSize[0] === side) return;
    this.particleTexSize = [side, side];
    this.createParticleTextures();
    this.needsParticleReset = true;
  }

  resetParticles() {
    this.needsParticleReset = true;
  }

  setImportedField(field: VectorFieldData | null) {
    const { ctx } = this;
    ctx.deleteTexture(this.importedTexture);
    this.importedTexture = null;
    if (field) {
      const rgba = new Float32Array(field.width * field.height * 4);
      for (let i = 0; i < field.width * field.height; i++) {
        rgba[i * 4 + 0] = field.data[i * 2];
        rgba[i * 4 + 1] = field.data[i * 2 + 1];
      }
      this.importedTexture = ctx.createTexture(field.width, field.height, rgba);
    }
  }

  render(params: {
    elements: FieldElement[];
    presetFields: PresetField[];
    customFields: CustomField[];
    globalParams: GlobalParams;
    showArrows: boolean;
    showParticles: boolean;
    showStreamlines: boolean;
    showLIC: boolean;
    showVorticity: boolean;
    operationMode: 'none' | 'divergence' | 'curl' | 'gradient';
    colorRange: { min: number; max: number; locked: boolean };
    operationRange: { min: number; max: number; locked: boolean };
    licDirty: boolean;
    licStepSize: number;
    licKernelLength: number;
    arrowSpacing: number;
    importedField: VectorFieldData | null;
  }) {
    const { gl, ctx } = this;
    this.time += 0.016;
    this.frameCount++;

    this.setParticleCount(params.globalParams.particleCount);

    this.computeField(params);

    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (params.showLIC) {
      if (params.licDirty) {
        this.computeLIC(params.licStepSize, params.licKernelLength);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.displayProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.licTexture);
      gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_texture'), 0);
      gl.bindVertexArray(this.quadVAO);
      ctx.drawFullscreenQuad();
      gl.disable(gl.BLEND);
    }

    if (params.showArrows) {
      this.renderArrows(params.colorRange, params.arrowSpacing, params.globalParams.colormap);
    }

    if (params.showParticles) {
      this.renderParticles(params.globalParams, params.colorRange);
    }

    if (params.operationMode !== 'none') {
      this.renderOperationOverlay(params.operationMode, params.operationRange);
    }

    if (params.showVorticity) {
      this.renderVorticity(params.operationRange);
    }
  }

  private computeField(params: {
    elements: FieldElement[];
    presetFields: PresetField[];
    customFields: CustomField[];
    importedField: VectorFieldData | null;
  }) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.fieldProgram);

    gl.uniform2f(gl.getUniformLocation(this.fieldProgram, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'u_time'), this.time);
    gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'u_hasImported'), params.importedField ? 1.0 : 0.0);

    if (params.importedField && this.importedTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.importedTexture);
      gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_importedTexture'), 0);
    }

    const elemCount = Math.min(params.elements.length, 16);
    gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_elementCount'), elemCount);
    const elemData = new Float32Array(16 * 4);
    const angleData = new Float32Array(16);
    for (let i = 0; i < elemCount; i++) {
      const e = params.elements[i];
      const typeMap: Record<string, number> = { source: 0, sink: 1, vortex: 2, uniform: 3 };
      elemData[i * 4 + 0] = e.x;
      elemData[i * 4 + 1] = e.y;
      elemData[i * 4 + 2] = typeMap[e.type] ?? 0;
      elemData[i * 4 + 3] = e.strength;
      angleData[i] = e.angle ?? 0;
    }
    gl.uniform4fv(gl.getUniformLocation(this.fieldProgram, 'u_elements'), elemData);
    gl.uniform1fv(gl.getUniformLocation(this.fieldProgram, 'u_uniformAngle'), angleData);

    const presetCount = Math.min(params.presetFields.length, 5);
    gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_presetCount'), presetCount);
    const presetData = new Float32Array(5 * 4);
    const formulaTypes = new Int32Array(5);
    const formulaTypeMap: Record<string, number> = { uniform: 0, rotation: 1, divergence: 2, dipole: 3, saddle: 4 };
    for (let i = 0; i < presetCount; i++) {
      const p = params.presetFields[i];
      presetData[i * 4 + 0] = p.active ? 1.0 : 0.0;
      presetData[i * 4 + 1] = Object.values(p.params)[0] ?? 1.0;
      presetData[i * 4 + 2] = 0;
      presetData[i * 4 + 3] = 0;
      formulaTypes[i] = formulaTypeMap[p.id] ?? 0;
    }
    gl.uniform4fv(gl.getUniformLocation(this.fieldProgram, 'u_presets'), presetData);
    gl.uniform1iv(gl.getUniformLocation(this.fieldProgram, 'u_presetFormulaType'), formulaTypes);

    const customCount = Math.min(params.customFields.length, 4);
    gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_customCount'), customCount);
    const customParamData = new Float32Array(4 * 4);
    const customActiveData = new Float32Array(4);
    for (let i = 0; i < customCount; i++) {
      const c = params.customFields[i];
      customActiveData[i] = c.active ? 1.0 : 0.0;
    }
    gl.uniform4fv(gl.getUniformLocation(this.fieldProgram, 'u_customParams'), customParamData);
    gl.uniform1fv(gl.getUniformLocation(this.fieldProgram, 'u_customActive'), customActiveData);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
  }

  private renderArrows(colorRange: { min: number; max: number }, arrowSpacing: number, colormap: string) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.arrowProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.arrowProgram, 'u_fieldTexture'), 0);

    const cmapTex = this.colormaps.getTexture(colormap as any);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.arrowProgram, 'u_colormapTexture'), 1);

    const dpr = window.devicePixelRatio || 1;
    gl.uniform2f(gl.getUniformLocation(this.arrowProgram, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.arrowProgram, 'u_spacing'), arrowSpacing * dpr);
    gl.uniform2f(gl.getUniformLocation(this.arrowProgram, 'u_colormapRange'), colorRange.min, colorRange.max);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
    gl.disable(gl.BLEND);
  }

  private renderParticles(globalParams: GlobalParams, colorRange: { min: number; max: number }) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    const [tw, th] = this.particleTexSize;

    const readIdx = this.currentPosIdx;
    const writeIdx = 1 - this.currentPosIdx;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.posFBOs[writeIdx]);
    gl.viewport(0, 0, tw, th);
    gl.useProgram(this.particleUpdateProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.particleUpdateProgram, 'u_positionTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.particleUpdateProgram, 'u_fieldTexture'), 1);

    gl.uniform2f(gl.getUniformLocation(this.particleUpdateProgram, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_dt'), globalParams.integrationStep);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_speedScale'), globalParams.speedScale);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_time'), this.time);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_resetPass'), this.needsParticleReset ? 1.0 : 0.0);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();

    this.currentPosIdx = writeIdx;
    this.needsParticleReset = false;

    // Fade trail
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFBO);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
    gl.useProgram(this.trailFadeProgram);
    const fadeAmount = 1.0 - 1.0 / globalParams.trailLength;
    gl.uniform1f(gl.getUniformLocation(this.trailFadeProgram, 'u_fadeAmount'), fadeAmount);
    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
    gl.disable(gl.BLEND);

    // Draw particles on trail
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFBO);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.particlePointProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[this.currentPosIdx]);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_positionTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_fieldTexture'), 1);

    const cmapTex = this.colormaps.getTexture(globalParams.colormap);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_colormapTexture'), 2);

    gl.uniform2f(gl.getUniformLocation(this.particlePointProgram, 'u_textureSize'), tw, th);
    gl.uniform1f(gl.getUniformLocation(this.particlePointProgram, 'u_pointSize'), 1.5);
    gl.uniform2f(gl.getUniformLocation(this.particlePointProgram, 'u_colormapRange'), colorRange.min, colorRange.max);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.POINTS, 0, tw * th);
    gl.disable(gl.BLEND);

    // Display trail to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trailTexture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_texture'), 0);
    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
    gl.disable(gl.BLEND);
  }

  private computeLIC(stepSize: number, kernelLength: number) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.licFBO);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.licProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.licProgram, 'u_fieldTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.licNoiseTexture);
    gl.uniform1i(gl.getUniformLocation(this.licProgram, 'u_noiseTexture'), 1);

    gl.uniform2f(gl.getUniformLocation(this.licProgram, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.licProgram, 'u_stepSize'), stepSize);
    gl.uniform1i(gl.getUniformLocation(this.licProgram, 'u_kernelLength'), kernelLength);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
  }

  private renderOperationOverlay(mode: string, range: { min: number; max: number }) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.colormapProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.colormapProgram, 'u_dataTexture'), 0);

    const cmapTex = this.colormaps.getTexture('viridis');
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.colormapProgram, 'u_colormapTexture'), 1);

    gl.uniform2f(gl.getUniformLocation(this.colormapProgram, 'u_range'), range.min, range.max);
    const modeMap: Record<string, number> = { none: 0, divergence: 1, curl: 2, gradient: 3 };
    gl.uniform1i(gl.getUniformLocation(this.colormapProgram, 'u_mode'), modeMap[mode] ?? 0);
    gl.uniform2f(gl.getUniformLocation(this.colormapProgram, 'u_resolution'), w, h);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
    gl.disable(gl.BLEND);
  }

  private renderVorticity(range: { min: number; max: number }) {
    const { gl, ctx } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.vorticityProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.vorticityProgram, 'u_dataTexture'), 0);

    gl.uniform2f(gl.getUniformLocation(this.vorticityProgram, 'u_resolution'), w, h);
    gl.uniform2f(gl.getUniformLocation(this.vorticityProgram, 'u_range'), range.min, range.max);

    gl.bindVertexArray(this.quadVAO);
    ctx.drawFullscreenQuad();
    gl.disable(gl.BLEND);
  }

  computeFieldRange(): { min: number; max: number } {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < w * h; i++) {
      const vx = pixels[i * 4];
      const vy = pixels[i * 4 + 1];
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag < min) min = mag;
      if (mag > max) max = mag;
    }

    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
  }

  computeOperationRange(mode: 'divergence' | 'curl' | 'gradient'): { min: number; max: number } {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

    let min = Infinity;
    let max = -Infinity;
    const dx = 2.0 / w;
    const dy = 2.0 / h;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const idxUp = (y + 1) * w + x;
        const idxDown = (y - 1) * w + x;
        const idxRight = y * w + (x + 1);
        const idxLeft = y * w + (x - 1);

        let val = 0;
        if (mode === 'divergence') {
          const dvx_dx = (pixels[idxRight * 4] - pixels[idxLeft * 4]) / (2 * dx);
          const dvy_dy = (pixels[idxUp * 4 + 1] - pixels[idxDown * 4 + 1]) / (2 * dy);
          val = dvx_dx + dvy_dy;
        } else if (mode === 'curl') {
          const dvx_dy = (pixels[idxUp * 4] - pixels[idxDown * 4]) / (2 * dy);
          const dvy_dx = (pixels[idxRight * 4 + 1] - pixels[idxLeft * 4 + 1]) / (2 * dx);
          val = dvy_dx - dvx_dy;
        } else if (mode === 'gradient') {
          const magR = Math.sqrt(pixels[idxRight * 4] ** 2 + pixels[idxRight * 4 + 1] ** 2);
          const magL = Math.sqrt(pixels[idxLeft * 4] ** 2 + pixels[idxLeft * 4 + 1] ** 2);
          const magU = Math.sqrt(pixels[idxUp * 4] ** 2 + pixels[idxUp * 4 + 1] ** 2);
          const magD = Math.sqrt(pixels[idxDown * 4] ** 2 + pixels[idxDown * 4 + 1] ** 2);
          val = Math.sqrt(((magR - magL) / (2 * dx)) ** 2 + ((magU - magD) / (2 * dy)) ** 2);
        }

        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
  }

  getCanvas(): HTMLCanvasElement {
    return this.ctx.canvas;
  }

  destroy() {
    this.colormaps.cleanup();
    this.ctx.deleteProgram(this.fieldProgram);
    this.ctx.deleteProgram(this.particleUpdateProgram);
    this.ctx.deleteProgram(this.particlePointProgram);
    this.ctx.deleteProgram(this.arrowProgram);
    this.ctx.deleteProgram(this.vorticityProgram);
    this.ctx.deleteProgram(this.licProgram);
    this.ctx.deleteProgram(this.trailFadeProgram);
    this.ctx.deleteProgram(this.displayProgram);
    this.ctx.deleteProgram(this.colormapProgram);
  }
}
