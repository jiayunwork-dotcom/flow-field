import { COMMON_HEADER } from '../gl/shaders';

export function generateCustomFieldFS(formulaX: string, formulaY: string): string | null {
  try {
    const glslX = expressionToGLSL(formulaX);
    const glslY = expressionToGLSL(formulaY);
    return COMMON_HEADER + `
in vec2 v_uv;
out vec4 fragColor;

${glslX}
${glslY}

void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    float vx = evalX(p.x, p.y);
    float vy = evalY(p.x, p.y);
    fragColor = vec4(vx, vy, length(vec2(vx, vy)), 0.0);
}
`;
  } catch {
    return null;
  }
}

function expressionToGLSL(expr: string): string {
  let glsl = expr;
  glsl = glsl.replace(/\bsin\b/g, 'sin');
  glsl = glsl.replace(/\bcos\b/g, 'cos');
  glsl = glsl.replace(/\btan\b/g, 'tan');
  glsl = glsl.replace(/\bexp\b/g, 'exp');
  glsl = glsl.replace(/\bsqrt\b/g, 'sqrt');
  glsl = glsl.replace(/\babs\b/g, 'abs');
  glsl = glsl.replace(/\blog\b/g, 'log');
  glsl = glsl.replace(/\bpow\b/g, 'pow');
  glsl = glsl.replace(/\^/g, '');
  return `float evalFunc(float x, float y) { return ${glsl}; }`;
}

export const CUSTOM_FIELD_FS = COMMON_HEADER + `
uniform sampler2D u_customFieldTexture;
in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec4 val = texture(u_customFieldTexture, v_uv);
    fragColor = val;
}
`;
