export class GLContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
  }

  static create(canvas: HTMLCanvasElement): GLContext | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      console.error('WebGL2 not supported');
      return null;
    }
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    return new GLContext(canvas, gl);
  }

  createShader(type: number, source: string): WebGLShader | null {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const { gl } = this;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  createTexture(
    width: number,
    height: number,
    data?: Float32Array | Uint8Array | null,
    internalFormat: number = WebGL2RenderingContext.RGBA32F,
    format: number = WebGL2RenderingContext.RGBA,
    type: number = WebGL2RenderingContext.FLOAT,
    filter: number = WebGL2RenderingContext.LINEAR
  ): WebGLTexture | null {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data ?? null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  createFBO(texture: WebGLTexture): WebGLFramebuffer | null {
    const { gl } = this;
    const fbo = gl.createFramebuffer();
    if (!fbo) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('FBO not complete:', status);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  deleteTexture(tex: WebGLTexture | null) {
    if (tex) this.gl.deleteTexture(tex);
  }

  deleteFBO(fbo: WebGLFramebuffer | null) {
    if (fbo) this.gl.deleteFramebuffer(fbo);
  }

  deleteProgram(prog: WebGLProgram | null) {
    if (prog) this.gl.deleteProgram(prog);
  }

  setupFullscreenQuad(): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } {
    const { gl } = this;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  drawFullscreenQuad() {
    const { gl } = this;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(width: number, height: number) {
    const { gl, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width * dpr);
    const h = Math.floor(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
}
