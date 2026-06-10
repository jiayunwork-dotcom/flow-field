import { GLContext } from './GLContext';
import {
  QUAD_VS,
  FIELD_COMPUTE_FS,
  PARTICLE_UPDATE_FS,
  VELOCITY_UPDATE_FS,
  PARTICLE_POINT_VS,
  PARTICLE_POINT_FS,
  ARROW_FS,
  VORTICITY_FS,
  LIC_FS,
  TRAIL_FADE_FS,
  DISPLAY_FS,
  COLORMAP_FS,
  HEATMAP_FS,
  STREAMLINE_VS,
  STREAMLINE_FS,
  PROBE_LINE_VS,
  PROBE_LINE_FS,
  PROBE_POINT_VS,
  PROBE_POINT_FS,
} from './shaders';
import { ColormapManager } from './ColormapManager';
import type { FieldElement, PresetField, CustomField, GlobalParams, VectorFieldData } from '../store/types';
import { createCustomFieldTexture } from '../fields/ExpressionParser';

export class FlowFieldRenderer {
  private ctx: GLContext;
  private gl: WebGL2RenderingContext;
  private colormaps: ColormapManager;
  private quadVAO: WebGLVertexArrayObject;
  private particleVAO: WebGLVertexArrayObject;

  private fieldProgram: WebGLProgram;
  private particleUpdateProgram: WebGLProgram;
  private velocityUpdateProgram: WebGLProgram;
  private particlePointProgram: WebGLProgram;
  private arrowProgram: WebGLProgram;
  private vorticityProgram: WebGLProgram;
  private licProgram: WebGLProgram;
  private trailFadeProgram: WebGLProgram;
  private displayProgram: WebGLProgram;
  private colormapProgram: WebGLProgram;
  private heatmapProgram: WebGLProgram;
  private streamlineProgram: WebGLProgram;
  private probeLineProgram: WebGLProgram;
  private probePointProgram: WebGLProgram;

  private fieldTexture: WebGLTexture | null = null;
  private fieldFBO: WebGLFramebuffer | null = null;
  private importedTexture: WebGLTexture | null = null;
  private customFieldTexture: WebGLTexture | null = null;

  private posTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private posFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private velTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private velFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private currentPosIdx = 0;
  private particleTexSize: [number, number] = [256, 256];
  private needsParticleReset = true;

  private trailTexture: WebGLTexture | null = null;
  private trailFBO: WebGLFramebuffer | null = null;
  private trailTempTexture: WebGLTexture | null = null;
  private trailTempFBO: WebGLFramebuffer | null = null;

  private licTexture: WebGLTexture | null = null;
  private licFBO: WebGLFramebuffer | null = null;
  private licNoiseTexture: WebGLTexture | null = null;

  private streamlineVBO: WebGLBuffer | null = null;
  private streamlineSpeedVBO: WebGLBuffer | null = null;
  private streamlineVertCount = 0;

  private snapshotFieldTexture: WebGLTexture | null = null;

  private snapshotPosTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private snapshotPosFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private snapshotVelTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private snapshotVelFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private snapshotCurrentPosIdx = 0;
  private snapshotNeedsReset = true;

  private snapshotTrailTexture: WebGLTexture | null = null;
  private snapshotTrailFBO: WebGLFramebuffer | null = null;
  private snapshotTrailTempTexture: WebGLTexture | null = null;
  private snapshotTrailTempFBO: WebGLFramebuffer | null = null;

  private probeVBO: WebGLBuffer | null = null;

  private width = 1024;
  private height = 1024;
  private time = 0;
  private frameCount = 0;
  private drawCallCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = GLContext.create(canvas);
    if (!ctx) throw new Error('Failed to create WebGL2 context');
    this.ctx = ctx;
    this.gl = this.ctx.gl;
    this.colormaps = new ColormapManager(ctx);

    const { vao } = this.ctx.setupFullscreenQuad();
    this.quadVAO = vao;

    const pVAO = this.ctx.gl.createVertexArray()!;
    this.particleVAO = pVAO;

    const p = (vs: string, fs: string) => {
      const prog = this.ctx.createProgram(vs, fs);
      if (!prog) throw new Error(`Failed to compile shader program`);
      return prog;
    };

    this.fieldProgram = p(QUAD_VS, FIELD_COMPUTE_FS);
    this.particleUpdateProgram = p(QUAD_VS, PARTICLE_UPDATE_FS);
    this.velocityUpdateProgram = p(QUAD_VS, VELOCITY_UPDATE_FS);
    this.particlePointProgram = p(PARTICLE_POINT_VS, PARTICLE_POINT_FS);
    this.arrowProgram = p(QUAD_VS, ARROW_FS);
    this.vorticityProgram = p(QUAD_VS, VORTICITY_FS);
    this.licProgram = p(QUAD_VS, LIC_FS);
    this.trailFadeProgram = p(QUAD_VS, TRAIL_FADE_FS);
    this.displayProgram = p(QUAD_VS, DISPLAY_FS);
    this.colormapProgram = p(QUAD_VS, COLORMAP_FS);
    this.heatmapProgram = p(QUAD_VS, HEATMAP_FS);
    this.streamlineProgram = p(STREAMLINE_VS, STREAMLINE_FS);
    this.probeLineProgram = p(PROBE_LINE_VS, PROBE_LINE_FS);
    this.probePointProgram = p(PROBE_POINT_VS, PROBE_POINT_FS);

    this.streamlineVBO = this.gl.createBuffer();
    this.streamlineSpeedVBO = this.gl.createBuffer();
    this.probeVBO = this.gl.createBuffer();

    this.initNoiseTexture();
    this.recreateTextures();
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
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    this.ctx.deleteTexture(this.fieldTexture);
    this.ctx.deleteFBO(this.fieldFBO);
    this.fieldTexture = this.ctx.createTexture(w, h, null);
    this.fieldFBO = this.ctx.createFBO(this.fieldTexture!);

    this.ctx.deleteTexture(this.trailTexture);
    this.ctx.deleteFBO(this.trailFBO);
    this.trailTexture = this.ctx.createTexture(w, h, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.trailFBO = this.ctx.createFBO(this.trailTexture!);

    this.ctx.deleteTexture(this.trailTempTexture);
    this.ctx.deleteFBO(this.trailTempFBO);
    this.trailTempTexture = this.ctx.createTexture(w, h, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.trailTempFBO = this.ctx.createFBO(this.trailTempTexture!);

    this.ctx.deleteTexture(this.licTexture);
    this.ctx.deleteFBO(this.licFBO);
    this.licTexture = this.ctx.createTexture(w, h, null);
    this.licFBO = this.ctx.createFBO(this.licTexture!);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFBO);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.createParticleTextures();
    this.needsParticleReset = true;

    this.createSnapshotTextures();
    this.snapshotNeedsReset = true;
  }

  private createParticleTextures() {
    const [w, h] = this.particleTexSize;
    for (let i = 0; i < 2; i++) {
      this.ctx.deleteTexture(this.posTextures[i]);
      this.ctx.deleteFBO(this.posFBOs[i]);
      this.posTextures[i] = this.ctx.createTexture(w, h, null);
      this.posFBOs[i] = this.ctx.createFBO(this.posTextures[i]!);

      this.ctx.deleteTexture(this.velTextures[i]);
      this.ctx.deleteFBO(this.velFBOs[i]);
      this.velTextures[i] = this.ctx.createTexture(w, h, null);
      this.velFBOs[i] = this.ctx.createFBO(this.velTextures[i]!);
    }
  }

  private createSnapshotTextures() {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    const [tw, th] = this.particleTexSize;

    for (let i = 0; i < 2; i++) {
      this.ctx.deleteTexture(this.snapshotPosTextures[i]);
      this.ctx.deleteFBO(this.snapshotPosFBOs[i]);
      this.snapshotPosTextures[i] = this.ctx.createTexture(tw, th, null);
      this.snapshotPosFBOs[i] = this.ctx.createFBO(this.snapshotPosTextures[i]!);

      this.ctx.deleteTexture(this.snapshotVelTextures[i]);
      this.ctx.deleteFBO(this.snapshotVelFBOs[i]);
      this.snapshotVelTextures[i] = this.ctx.createTexture(tw, th, null);
      this.snapshotVelFBOs[i] = this.ctx.createFBO(this.snapshotVelTextures[i]!);
    }

    this.ctx.deleteTexture(this.snapshotTrailTexture);
    this.ctx.deleteFBO(this.snapshotTrailFBO);
    this.snapshotTrailTexture = this.ctx.createTexture(w, h, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.snapshotTrailFBO = this.ctx.createFBO(this.snapshotTrailTexture!);

    this.ctx.deleteTexture(this.snapshotTrailTempTexture);
    this.ctx.deleteFBO(this.snapshotTrailTempFBO);
    this.snapshotTrailTempTexture = this.ctx.createTexture(w, h, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.snapshotTrailTempFBO = this.ctx.createFBO(this.snapshotTrailTempTexture!);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapshotTrailFBO);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setParticleCount(count: number) {
    const side = Math.ceil(Math.sqrt(count));
    if (this.particleTexSize[0] === side) return;
    this.particleTexSize = [side, side];
    this.createParticleTextures();
    this.needsParticleReset = true;
    this.createSnapshotTextures();
    this.snapshotNeedsReset = true;
  }

  resetParticles() {
    this.needsParticleReset = true;
    this.snapshotNeedsReset = true;
  }

  setImportedField(field: VectorFieldData | null) {
    this.ctx.deleteTexture(this.importedTexture);
    this.importedTexture = null;
    if (field) {
      const rgba = new Float32Array(field.width * field.height * 4);
      for (let i = 0; i < field.width * field.height; i++) {
        rgba[i * 4 + 0] = field.data[i * 2];
        rgba[i * 4 + 1] = field.data[i * 2 + 1];
      }
      this.importedTexture = this.ctx.createTexture(field.width, field.height, rgba);
    }
  }

  updateCustomFieldTexture(customFields: CustomField[]) {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    this.ctx.deleteTexture(this.customFieldTexture);
    this.customFieldTexture = null;

    const activeCustom = customFields.filter(f => f.active);
    if (activeCustom.length === 0) return;

    const combined = new Float32Array(w * h * 4);
    for (const cf of activeCustom) {
      const fieldData = createCustomFieldTexture(cf.formulaX, cf.formulaY, w, h);
      for (let i = 0; i < w * h; i++) {
        combined[i * 4 + 0] += fieldData[i * 2];
        combined[i * 4 + 1] += fieldData[i * 2 + 1];
      }
    }
    this.customFieldTexture = this.ctx.createTexture(w, h, combined);
  }

  saveSnapshot() {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    this.ctx.deleteTexture(this.snapshotFieldTexture);
    this.snapshotFieldTexture = null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.snapshotFieldTexture = this.ctx.createTexture(w, h, pixels);
    this.snapshotNeedsReset = true;

    const { gl: gl2 } = this;
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, this.snapshotTrailFBO);
    gl2.viewport(0, 0, w, h);
    gl2.clearColor(0, 0, 0, 1);
    gl2.clear(gl2.COLOR_BUFFER_BIT);
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  }

  getProbeVelocity(probePoint: { x: number; y: number }): { vx: number; vy: number; magnitude: number } {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    const ux = (probePoint.x + 1) * 0.5;
    const uy = (probePoint.y + 1) * 0.5;
    const px = Math.floor(ux * w);
    const py = Math.floor(uy * h);

    if (px < 0 || px >= w || py < 0 || py >= h) {
      return { vx: 0, vy: 0, magnitude: 0 };
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    const pixel = new Float32Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const vx = pixel[0];
    const vy = pixel[1];
    const magnitude = Math.sqrt(vx * vx + vy * vy);
    return { vx, vy, magnitude };
  }

  computeProbeTrajectory(probePoint: { x: number; y: number }, stepSize: number): Float32Array {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFBO);
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const aspect = w / h;
    const sampleField = (nx: number, ny: number): [number, number] => {
      const ux = (nx / aspect + 1) * 0.5;
      const uy = (ny + 1) * 0.5;
      const px = Math.floor(ux * w);
      const py = Math.floor(uy * h);
      if (px < 0 || px >= w || py < 0 || py >= h) return [0, 0];
      const idx = py * w + px;
      return [pixels[idx * 4], pixels[idx * 4 + 1]];
    };

    const rk4 = (px: number, py: number, dt: number): [number, number] => {
      const [k1x, k1y] = sampleField(px, py);
      const [k2x, k2y] = sampleField(px + k1x * dt * 0.5, py + k1y * dt * 0.5);
      const [k3x, k3y] = sampleField(px + k2x * dt * 0.5, py + k2y * dt * 0.5);
      const [k4x, k4y] = sampleField(px + k3x * dt, py + k3y * dt);
      return [
        px + (k1x + 2 * k2x + 2 * k3x + k4x) * dt / 6,
        py + (k1y + 2 * k2y + 2 * k3y + k4y) * dt / 6,
      ];
    };

    const positions: number[] = [];
    let px = probePoint.x;
    let py = probePoint.y;
    const maxSteps = 200;
    const dt = stepSize * 2.0;

    for (let step = 0; step < maxSteps; step++) {
      const [vx, vy] = sampleField(px, py);
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag < 0.0001) break;

      positions.push(px, py);

      const [npx, npy] = rk4(px, py, dt);
      px = npx;
      py = npy;

      if (px < -aspect || px > aspect || py < -1 || py > 1) break;
    }

    return new Float32Array(positions);
  }

  private computeEmitterUniforms(elements: FieldElement[]) {
    const emitters = elements.filter(e => e.type === 'emitter');
    const count = Math.min(emitters.length, 8);
    const emitterData = new Float32Array(8 * 4);
    const emitterDir = new Float32Array(8);

    for (let i = 0; i < count; i++) {
      const e = emitters[i];
      emitterData[i * 4 + 0] = e.x;
      emitterData[i * 4 + 1] = e.y;
      emitterData[i * 4 + 2] = (e.spreadAngle ?? 30) * Math.PI / 180;
      emitterData[i * 4 + 3] = e.initialSpeed ?? 1.0;
      emitterDir[i] = e.angle ?? 0;
    }

    const totalRate = emitters.reduce((sum, e) => sum + (e.rate ?? 100), 0);
    const avgLife = 300;
    const particleCount = this.particleTexSize[0] * this.particleTexSize[1];
    const resetsPerSecond = particleCount / avgLife * 60;
    const emitterFraction = Math.min(totalRate / (resetsPerSecond + totalRate + 0.001), 0.9);

    return { count, emitterData, emitterDir, emitterFraction };
  }

  private setEmitterUniforms(program: WebGLProgram, emitterInfo: ReturnType<typeof this.computeEmitterUniforms>) {
    const { gl } = this;
    gl.uniform1i(gl.getUniformLocation(program, 'u_emitterCount'), emitterInfo.count);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_emitters'), emitterInfo.emitterData);
    gl.uniform1fv(gl.getUniformLocation(program, 'u_emitterDir'), emitterInfo.emitterDir);
    gl.uniform1f(gl.getUniformLocation(program, 'u_emitterFraction'), emitterInfo.emitterFraction);
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
    showHeatmap: boolean;
    heatmapOpacity: number;
    operationMode: 'none' | 'divergence' | 'curl' | 'gradient';
    colorRange: { min: number; max: number; locked: boolean };
    operationRange: { min: number; max: number; locked: boolean };
    licDirty: boolean;
    licStepSize: number;
    licKernelLength: number;
    arrowSpacing: number;
    importedField: VectorFieldData | null;
    probePoint: { x: number; y: number } | null;
    probeMode: boolean;
    compareMode: boolean;
    compareSplit: number;
  }) {
    const { gl } = this;
    this.time += 0.016;
    this.frameCount++;
    this.drawCallCount = 0;

    this.setParticleCount(params.globalParams.particleCount);
    this.updateCustomFieldTexture(params.customFields);
    this.computeField(params);

    const w = gl.canvas.width;
    const h = gl.canvas.height;

    if (params.compareMode && this.snapshotFieldTexture) {
      this.renderCompareMode(params, w, h);
    } else {
      this.renderNormalMode(params, w, h);
    }

    if (params.probeMode && params.probePoint) {
      this.renderProbe(params.probePoint, params.globalParams.integrationStep, w, h);
    }
  }

  private renderNormalMode(params: any, w: number, h: number) {
    const { gl } = this;

    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (params.showHeatmap) {
      this.renderHeatmap(params.colorRange, params.heatmapOpacity, params.globalParams.colormap);
    }

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
      this.ctx.drawFullscreenQuad();
      this.drawCallCount++;
      gl.disable(gl.BLEND);
    }

    if (params.showArrows) {
      this.renderArrows(params.colorRange, params.arrowSpacing, params.globalParams.colormap);
    }

    if (params.showParticles) {
      this.renderParticles(params.globalParams, params.colorRange, params.elements, this.fieldTexture!, this.posTextures, this.posFBOs, this.velTextures, this.velFBOs, this.trailTexture!, this.trailFBO!, this.trailTempTexture!, this.trailTempFBO!, () => this.currentPosIdx, (idx: number) => { this.currentPosIdx = idx; }, () => this.needsParticleReset, () => { this.needsParticleReset = false; });
    }

    if (params.showStreamlines) {
      this.renderStreamlines(params.colorRange, params.globalParams.colormap, params.globalParams.integrationStep);
    }

    if (params.operationMode !== 'none') {
      this.renderOperationOverlay(params.operationMode, params.operationRange);
    }

    if (params.showVorticity) {
      this.renderVorticity(params.operationRange);
    }
  }

  private renderCompareMode(params: any, w: number, h: number) {
    const { gl } = this;
    const splitX = Math.floor(params.compareSplit * w);

    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, splitX, h);
    gl.viewport(0, 0, w, h);

    if (params.showHeatmap) {
      this.renderHeatmap(params.colorRange, params.heatmapOpacity, params.globalParams.colormap);
    }
    if (params.showLIC && params.licDirty) {
      this.computeLIC(params.licStepSize, params.licKernelLength);
    }
    if (params.showLIC) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.displayProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.licTexture);
      gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_texture'), 0);
      gl.bindVertexArray(this.quadVAO);
      this.ctx.drawFullscreenQuad();
      this.drawCallCount++;
      gl.disable(gl.BLEND);
    }
    if (params.showArrows) {
      this.renderArrows(params.colorRange, params.arrowSpacing, params.globalParams.colormap);
    }
    if (params.showParticles) {
      this.renderParticles(params.globalParams, params.colorRange, params.elements, this.fieldTexture!, this.posTextures, this.posFBOs, this.velTextures, this.velFBOs, this.trailTexture!, this.trailFBO!, this.trailTempTexture!, this.trailTempFBO!, () => this.currentPosIdx, (idx: number) => { this.currentPosIdx = idx; }, () => this.needsParticleReset, () => { this.needsParticleReset = false; });
    }
    if (params.showStreamlines) {
      this.renderStreamlines(params.colorRange, params.globalParams.colormap, params.globalParams.integrationStep);
    }

    gl.scissor(splitX, 0, w - splitX, h);

    if (params.showHeatmap && this.snapshotFieldTexture) {
      this.renderHeatmapWithTexture(this.snapshotFieldTexture, params.colorRange, params.heatmapOpacity, params.globalParams.colormap);
    }
    if (params.showArrows && this.snapshotFieldTexture) {
      this.renderArrowsWithTexture(this.snapshotFieldTexture, params.colorRange, params.arrowSpacing, params.globalParams.colormap);
    }
    if (params.showParticles && this.snapshotFieldTexture) {
      this.renderParticles(params.globalParams, params.colorRange, [], this.snapshotFieldTexture, this.snapshotPosTextures, this.snapshotPosFBOs, this.snapshotVelTextures, this.snapshotVelFBOs, this.snapshotTrailTexture!, this.snapshotTrailFBO!, this.snapshotTrailTempTexture!, this.snapshotTrailTempFBO!, () => this.snapshotCurrentPosIdx, (idx: number) => { this.snapshotCurrentPosIdx = idx; }, () => this.snapshotNeedsReset, () => { this.snapshotNeedsReset = false; });
    }

    gl.disable(gl.SCISSOR_TEST);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.probeLineProgram);
    const splitLineData = new Float32Array([
      params.compareSplit * 2 - 1, -1,
      params.compareSplit * 2 - 1, 1,
    ]);
    gl.bindVertexArray(this.particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.probeVBO);
    gl.bufferData(gl.ARRAY_BUFFER, splitLineData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, 2);
    this.drawCallCount++;
    gl.disable(gl.BLEND);
  }

  private computeField(params: {
    elements: FieldElement[];
    presetFields: PresetField[];
    customFields: CustomField[];
    importedField: VectorFieldData | null;
  }) {
    const { gl } = this;
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

    const hasCustom = params.customFields.some(f => f.active) && this.customFieldTexture;
    gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_customCount'), hasCustom ? 1 : 0);
    if (hasCustom && this.customFieldTexture) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.customFieldTexture);
      gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_customFieldTexture'), 2);
    }
    const customActiveData = new Float32Array(4);
    if (hasCustom) customActiveData[0] = 1.0;
    gl.uniform1fv(gl.getUniformLocation(this.fieldProgram, 'u_customActive'), customActiveData);

    const elemCount = Math.min(params.elements.length, 16);
    gl.uniform1i(gl.getUniformLocation(this.fieldProgram, 'u_elementCount'), elemCount);
    const elemData = new Float32Array(16 * 4);
    const angleData = new Float32Array(16);
    for (let i = 0; i < elemCount; i++) {
      const e = params.elements[i];
      const typeMap: Record<string, number> = { source: 0, sink: 1, vortex: 2, uniform: 3, emitter: 4 };
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
      const pr = params.presetFields[i];
      presetData[i * 4 + 0] = pr.active ? 1.0 : 0.0;
      presetData[i * 4 + 1] = Object.values(pr.params)[0] ?? 1.0;
      presetData[i * 4 + 2] = 0;
      presetData[i * 4 + 3] = 0;
      formulaTypes[i] = formulaTypeMap[pr.id] ?? 0;
    }
    gl.uniform4fv(gl.getUniformLocation(this.fieldProgram, 'u_presets'), presetData);
    gl.uniform1iv(gl.getUniformLocation(this.fieldProgram, 'u_presetFormulaType'), formulaTypes);

    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
  }

  private renderHeatmap(colorRange: { min: number; max: number }, opacity: number, colormap: string) {
    this.renderHeatmapWithTexture(this.fieldTexture, colorRange, opacity, colormap);
  }

  private renderHeatmapWithTexture(fieldTexture: WebGLTexture | null, colorRange: { min: number; max: number }, opacity: number, colormap: string) {
    if (!fieldTexture) return;
    const { gl } = this;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.heatmapProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.heatmapProgram, 'u_fieldTexture'), 0);

    const cmapTex = this.colormaps.getTexture(colormap as any);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.heatmapProgram, 'u_colormapTexture'), 1);

    gl.uniform2f(gl.getUniformLocation(this.heatmapProgram, 'u_colormapRange'), colorRange.min, colorRange.max);
    gl.uniform1f(gl.getUniformLocation(this.heatmapProgram, 'u_opacity'), opacity);

    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
    gl.disable(gl.BLEND);
  }

  private renderArrows(colorRange: { min: number; max: number }, arrowSpacing: number, colormap: string) {
    this.renderArrowsWithTexture(this.fieldTexture, colorRange, arrowSpacing, colormap);
  }

  private renderArrowsWithTexture(fieldTexture: WebGLTexture | null, colorRange: { min: number; max: number }, arrowSpacing: number, colormap: string) {
    if (!fieldTexture) return;
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.arrowProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
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
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
    gl.disable(gl.BLEND);
  }

  private renderParticles(
    globalParams: GlobalParams,
    colorRange: { min: number; max: number },
    elements: FieldElement[],
    fieldTexture: WebGLTexture,
    posTextures: [WebGLTexture | null, WebGLTexture | null],
    posFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null],
    velTextures: [WebGLTexture | null, WebGLTexture | null],
    velFBOs: [WebGLFramebuffer | null, WebGLFramebuffer | null],
    trailTexture: WebGLTexture,
    trailFBO: WebGLFramebuffer,
    trailTempTexture: WebGLTexture,
    trailTempFBO: WebGLFramebuffer,
    getCurrentIdx: () => number,
    setCurrentIdx: (idx: number) => void,
    getNeedsReset: () => boolean,
    clearNeedsReset: () => void,
  ) {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    const [tw, th] = this.particleTexSize;

    const readIdx = getCurrentIdx();
    const writeIdx = 1 - readIdx;

    const emitterInfo = this.computeEmitterUniforms(elements);

    gl.bindFramebuffer(gl.FRAMEBUFFER, posFBOs[writeIdx]);
    gl.viewport(0, 0, tw, th);
    gl.useProgram(this.particleUpdateProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, posTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.particleUpdateProgram, 'u_positionTexture'), 0);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, velTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.particleUpdateProgram, 'u_velocityTexture'), 3);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.particleUpdateProgram, 'u_fieldTexture'), 1);

    gl.uniform2f(gl.getUniformLocation(this.particleUpdateProgram, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_dt'), globalParams.integrationStep);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_speedScale'), globalParams.speedScale);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_time'), this.time);
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProgram, 'u_resetPass'), getNeedsReset() ? 1.0 : 0.0);

    this.setEmitterUniforms(this.particleUpdateProgram, emitterInfo);

    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;

    gl.bindFramebuffer(gl.FRAMEBUFFER, velFBOs[writeIdx]);
    gl.viewport(0, 0, tw, th);
    gl.useProgram(this.velocityUpdateProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, posTextures[writeIdx]);
    gl.uniform1i(gl.getUniformLocation(this.velocityUpdateProgram, 'u_positionTexture'), 0);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, velTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.velocityUpdateProgram, 'u_velocityTexture'), 3);

    gl.uniform1f(gl.getUniformLocation(this.velocityUpdateProgram, 'u_time'), this.time);
    gl.uniform1f(gl.getUniformLocation(this.velocityUpdateProgram, 'u_resetPass'), getNeedsReset() ? 1.0 : 0.0);

    this.setEmitterUniforms(this.velocityUpdateProgram, emitterInfo);

    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;

    setCurrentIdx(writeIdx);
    clearNeedsReset();

    gl.bindFramebuffer(gl.FRAMEBUFFER, trailTempFBO);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.trailFadeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.uniform1i(gl.getUniformLocation(this.trailFadeProgram, 'u_trailTexture'), 0);
    const fadeAmount = 1.0 - 1.0 / globalParams.trailLength;
    gl.uniform1f(gl.getUniformLocation(this.trailFadeProgram, 'u_fadeAmount'), fadeAmount);
    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;

    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTempTexture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_texture'), 0);
    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;

    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.particlePointProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, posTextures[getCurrentIdx()]);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_positionTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_fieldTexture'), 1);

    const cmapTex = this.colormaps.getTexture(globalParams.colormap);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.particlePointProgram, 'u_colormapTexture'), 2);

    gl.uniform2f(gl.getUniformLocation(this.particlePointProgram, 'u_textureSize'), tw, th);
    gl.uniform1f(gl.getUniformLocation(this.particlePointProgram, 'u_pointSize'), 3.0);
    gl.uniform2f(gl.getUniformLocation(this.particlePointProgram, 'u_colormapRange'), colorRange.min, colorRange.max);

    gl.bindVertexArray(this.particleVAO);
    gl.drawArrays(gl.POINTS, 0, tw * th);
    this.drawCallCount++;
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_texture'), 0);
    gl.bindVertexArray(this.quadVAO);
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
    gl.disable(gl.BLEND);
  }

  private renderStreamlines(colorRange: { min: number; max: number }, colormap: string, stepSize: number) {
    const { gl } = this;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    this.computeStreamlineGeometry(w, h, stepSize);

    if (this.streamlineVertCount < 2) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.streamlineProgram);

    const cmapTex = this.colormaps.getTexture(colormap as any);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.uniform1i(gl.getUniformLocation(this.streamlineProgram, 'u_colormapTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(this.streamlineProgram, 'u_colormapRange'), colorRange.min, colorRange.max);

    gl.bindVertexArray(this.particleVAO);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.streamlineVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.streamlineSpeedVBO);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_STRIP, 0, this.streamlineVertCount);
    this.drawCallCount++;

    gl.disableVertexAttribArray(1);
    gl.disable(gl.BLEND);
  }

  private computeStreamlineGeometry(w: number, h: number, stepSize: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fieldFBO);
    const pixels = new Float32Array(w * h * 4);
    this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.FLOAT, pixels);

    const sampleField = (nx: number, ny: number): [number, number] => {
      const ux = (nx + 1) * 0.5;
      const uy = (ny + 1) * 0.5;
      const px = Math.floor(ux * w);
      const py = Math.floor(uy * h);
      if (px < 0 || px >= w || py < 0 || py >= h) return [0, 0];
      const idx = py * w + px;
      return [pixels[idx * 4], pixels[idx * 4 + 1]];
    };

    const rk4 = (px: number, py: number, dt: number): [number, number] => {
      const [k1x, k1y] = sampleField(px, py);
      const [k2x, k2y] = sampleField(px + k1x * dt * 0.5, py + k1y * dt * 0.5);
      const [k3x, k3y] = sampleField(px + k2x * dt * 0.5, py + k2y * dt * 0.5);
      const [k4x, k4y] = sampleField(px + k3x * dt, py + k3y * dt);
      return [
        px + (k1x + 2 * k2x + 2 * k3x + k4x) * dt / 6,
        py + (k1y + 2 * k2y + 2 * k3y + k4y) * dt / 6,
      ];
    };

    const spacing = 50;
    const aspect = w / h;
    const positions: number[] = [];
    const speeds: number[] = [];
    const maxSteps = 200;

    for (let sy = spacing / 2; sy < h; sy += spacing) {
      for (let sx = spacing / 2; sx < w; sx += spacing) {
        const nx0 = (sx / w) * 2 - 1;
        const ny0 = (sy / h) * 2 - 1;

        let px = nx0 * aspect;
        let py = ny0;

        for (let step = 0; step < maxSteps; step++) {
          const [vx, vy] = sampleField(px, py);
          const mag = Math.sqrt(vx * vx + vy * vy);
          if (mag < 0.0001) break;

          positions.push(px, py);
          speeds.push(mag);

          const dt = stepSize * 2.0;
          const [npx, npy] = rk4(px, py, dt);
          px = npx;
          py = npy;

          if (px < -aspect || px > aspect || py < -1 || py > 1) break;
        }

        positions.push(NaN, NaN);
        speeds.push(0);
      }
    }

    this.streamlineVertCount = positions.length / 2;

    const posData = new Float32Array(positions);
    const spdData = new Float32Array(speeds);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.streamlineVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, posData, this.gl.DYNAMIC_DRAW);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.streamlineSpeedVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, spdData, this.gl.DYNAMIC_DRAW);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  private renderProbe(probePoint: { x: number; y: number }, stepSize: number, w: number, h: number) {
    const { gl } = this;
    const trajectoryData = this.computeProbeTrajectory(probePoint, stepSize);
    const vertCount = trajectoryData.length / 2;

    if (vertCount < 2) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.probeLineProgram);
    gl.bindVertexArray(this.particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.probeVBO);
    gl.bufferData(gl.ARRAY_BUFFER, trajectoryData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(gl.getUniformLocation(this.probeLineProgram, 'u_pointSize'), 8.0);
    gl.drawArrays(gl.POINTS, 0, vertCount);
    this.drawCallCount++;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINE_STRIP, 0, vertCount);
    this.drawCallCount++;

    gl.useProgram(this.probePointProgram);
    gl.uniform2f(gl.getUniformLocation(this.probePointProgram, 'u_probePos'), probePoint.x, probePoint.y);
    gl.uniform1f(gl.getUniformLocation(this.probePointProgram, 'u_pointSize'), 16.0);
    gl.drawArrays(gl.POINTS, 0, 1);
    this.drawCallCount++;

    gl.disable(gl.BLEND);
  }

  private computeLIC(stepSize: number, kernelLength: number) {
    const { gl } = this;
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
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
  }

  private renderOperationOverlay(mode: string, range: { min: number; max: number }) {
    const { gl } = this;
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
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
    gl.disable(gl.BLEND);
  }

  private renderVorticity(range: { min: number; max: number }) {
    const { gl } = this;
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
    this.ctx.drawFullscreenQuad();
    this.drawCallCount++;
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

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  getParticleTexSize(): [number, number] {
    return [...this.particleTexSize];
  }

  getActiveParticleCount(): number {
    return this.particleTexSize[0] * this.particleTexSize[1];
  }

  getCanvas(): HTMLCanvasElement {
    return this.ctx.canvas;
  }

  destroy() {
    this.colormaps.cleanup();
    this.ctx.deleteProgram(this.fieldProgram);
    this.ctx.deleteProgram(this.particleUpdateProgram);
    this.ctx.deleteProgram(this.velocityUpdateProgram);
    this.ctx.deleteProgram(this.particlePointProgram);
    this.ctx.deleteProgram(this.arrowProgram);
    this.ctx.deleteProgram(this.vorticityProgram);
    this.ctx.deleteProgram(this.licProgram);
    this.ctx.deleteProgram(this.trailFadeProgram);
    this.ctx.deleteProgram(this.displayProgram);
    this.ctx.deleteProgram(this.colormapProgram);
    this.ctx.deleteProgram(this.heatmapProgram);
    this.ctx.deleteProgram(this.streamlineProgram);
    this.ctx.deleteProgram(this.probeLineProgram);
    this.ctx.deleteProgram(this.probePointProgram);
    if (this.streamlineVBO) this.gl.deleteBuffer(this.streamlineVBO);
    if (this.streamlineSpeedVBO) this.gl.deleteBuffer(this.streamlineSpeedVBO);
    if (this.probeVBO) this.gl.deleteBuffer(this.probeVBO);
  }
}
