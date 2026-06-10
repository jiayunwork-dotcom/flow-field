export const COMMON_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const QUAD_VS = COMMON_HEADER + `
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FIELD_COMPUTE_FS = COMMON_HEADER + `
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_hasImported;
uniform sampler2D u_importedTexture;

uniform int u_elementCount;
uniform vec4 u_elements[16];
uniform float u_uniformAngle[16];

uniform int u_presetCount;
uniform vec4 u_presets[5];
uniform int u_presetFormulaType[5];

uniform int u_customCount;
uniform sampler2D u_customFieldTexture;
uniform float u_customActive[4];

in vec2 v_uv;
out vec4 fragColor;

vec2 evalPreset(int idx, vec2 p) {
    int ftype = u_presetFormulaType[idx];
    float a = u_presets[idx].y;
    if (ftype == 0) return vec2(a, 0.0);
    else if (ftype == 1) return vec2(-p.y * a, p.x * a);
    else if (ftype == 2) return vec2(p.x * a, p.y * a);
    else if (ftype == 3) {
        float r2 = p.x*p.x + p.y*p.y + 0.01;
        return vec2(2.0*p.x*p.y*a/r2, (p.y*p.y - p.x*p.x)*a/r2);
    }
    else if (ftype == 4) return vec2(p.x * a, -p.y * a);
    return vec2(0.0);
}

vec2 evalElement(int idx, vec2 p) {
    vec2 center = u_elements[idx].xy;
    int etype = int(u_elements[idx].z + 0.5);
    float strength = u_elements[idx].w;
    if (etype == 4) return vec2(0.0);
    vec2 d = p - center;
    float r2 = dot(d, d) + 0.001;
    if (etype == 0) return d * strength / r2;
    else if (etype == 1) return -d * strength / r2;
    else if (etype == 2) return vec2(-d.y, d.x) * strength / r2;
    else if (etype == 3) {
        float angle = u_uniformAngle[idx];
        return vec2(cos(angle), sin(angle)) * strength;
    }
    return vec2(0.0);
}

vec2 evalField(vec2 p) {
    vec2 vel = vec2(0.0);
    for (int i = 0; i < 5; i++) {
        if (i >= u_presetCount) break;
        if (u_presets[i].x > 0.5) {
            vel += evalPreset(i, p);
        }
    }
    for (int i = 0; i < 4; i++) {
        if (i >= u_customCount) break;
        if (u_customActive[i] > 0.5) {
            vel += texture(u_customFieldTexture, v_uv).xy;
        }
    }
    for (int i = 0; i < 16; i++) {
        if (i >= u_elementCount) break;
        vel += evalElement(i, p);
    }
    if (u_hasImported > 0.5) {
        vec4 sampled = texture(u_importedTexture, v_uv);
        vel += sampled.xy;
    }
    return vel;
}

void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;
    vec2 vel = evalField(p);
    float mag = length(vel);
    fragColor = vec4(vel, mag, 0.0);
}
`;

export const PARTICLE_UPDATE_FS = COMMON_HEADER + `
uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_fieldTexture;
uniform vec2 u_resolution;
uniform float u_dt;
uniform float u_speedScale;
uniform float u_time;
uniform float u_resetPass;

uniform int u_emitterCount;
uniform vec4 u_emitters[8];
uniform float u_emitterDir[8];
uniform float u_emitterFraction;

in vec2 v_uv;
out vec4 fragColor;

vec2 sampleField(vec2 p) {
    vec2 uv = p * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
    return texture(u_fieldTexture, uv).xy;
}

vec2 rk4(vec2 p, float dt, vec2 emitterVel, float decay) {
    vec2 v1 = sampleField(p) + emitterVel * decay;
    vec2 v2 = sampleField(p + v1 * dt * 0.5) + emitterVel * decay;
    vec2 v3 = sampleField(p + v2 * dt * 0.5) + emitterVel * decay;
    vec2 v4 = sampleField(p + v3 * dt) + emitterVel * decay;
    return p + (v1 + 2.0*v2 + 2.0*v3 + v4) * dt / 6.0;
}

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec4 data = texture(u_positionTexture, v_uv);
    vec2 pos = data.xy;
    float life = data.z;
    float maxLife = data.w;

    vec4 velData = texture(u_velocityTexture, v_uv);
    vec2 emitterVel = velData.xy;
    float isEmitter = velData.a;

    if (u_resetPass > 0.5 || life >= maxLife || pos.x < -1.0 || pos.x > 1.0 || pos.y < -1.0 || pos.y > 1.0) {
        float r0 = hash(v_uv + u_time * 0.007);
        if (u_emitterCount > 0 && r0 < u_emitterFraction) {
            float r1 = hash(v_uv * 1.3 + u_time * 0.013);
            float r2 = hash(v_uv * 2.7 + u_time * 0.029);
            float r3 = hash(v_uv * 3.1 + u_time * 0.071);
            float r4 = hash(v_uv * 4.3 + u_time * 0.053);

            int eidx = int(r1 * float(u_emitterCount));
            if (eidx >= u_emitterCount) eidx = u_emitterCount - 1;

            vec2 epos = u_emitters[eidx].xy;
            float espread = u_emitters[eidx].z;
            float espeed = u_emitters[eidx].w;
            float edir = u_emitterDir[eidx];

            float halfSpread = espread * 0.5;
            float angle = edir + (r2 - 0.5) * espread;
            float offset = r3 * 0.01;
            vec2 spawnPos = epos + vec2(cos(angle), sin(angle)) * offset;

            float velAngle = edir + (r2 - 0.5) * espread;
            vec2 spawnVel = vec2(cos(velAngle), sin(velAngle)) * espeed;

            float newMaxLife = 100.0 + r4 * 200.0;
            fragColor = vec4(spawnPos, 0.0, newMaxLife);
        } else {
            float r1 = hash(v_uv + u_time * 0.013);
            float r2 = hash(v_uv * 1.7 + u_time * 0.037);
            float r3 = hash(v_uv * 3.1 + u_time * 0.071);
            float newMaxLife = 200.0 + r3 * 200.0;
            fragColor = vec4(r1 * 2.0 - 1.0, r2 * 2.0 - 1.0, 0.0, newMaxLife);
        }
    } else {
        float decay = isEmitter * exp(-life * 0.05);
        vec2 newPos = rk4(pos, u_dt * u_speedScale, emitterVel, decay);
        fragColor = vec4(newPos, life + 1.0, maxLife);
    }
}
`;

export const VELOCITY_UPDATE_FS = COMMON_HEADER + `
uniform sampler2D u_velocityTexture;
uniform sampler2D u_positionTexture;
uniform float u_time;
uniform float u_resetPass;
uniform int u_emitterCount;
uniform vec4 u_emitters[8];
uniform float u_emitterDir[8];
uniform float u_emitterFraction;

in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec4 data = texture(u_positionTexture, v_uv);
    vec2 pos = data.xy;
    float life = data.z;
    float maxLife = data.w;
    vec4 velData = texture(u_velocityTexture, v_uv);

    if (u_resetPass > 0.5 || life >= maxLife || pos.x < -1.0 || pos.x > 1.0 || pos.y < -1.0 || pos.y > 1.0) {
        float r0 = hash(v_uv + u_time * 0.007);
        if (u_emitterCount > 0 && r0 < u_emitterFraction) {
            float r1 = hash(v_uv * 1.3 + u_time * 0.013);
            float r2 = hash(v_uv * 2.7 + u_time * 0.029);

            int eidx = int(r1 * float(u_emitterCount));
            if (eidx >= u_emitterCount) eidx = u_emitterCount - 1;

            float espread = u_emitters[eidx].z;
            float espeed = u_emitters[eidx].w;
            float edir = u_emitterDir[eidx];

            float velAngle = edir + (r2 - 0.5) * espread;
            vec2 spawnVel = vec2(cos(velAngle), sin(velAngle)) * espeed;

            fragColor = vec4(spawnVel, 0.0, 1.0);
        } else {
            fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
    } else {
        fragColor = velData;
    }
}
`;

export const PARTICLE_POINT_VS = COMMON_HEADER + `
uniform sampler2D u_positionTexture;
uniform vec2 u_textureSize;
uniform float u_pointSize;
out vec2 v_pos;
out float v_alpha;

void main() {
    int idx = gl_VertexID;
    int tx = idx % int(u_textureSize.x);
    int ty = idx / int(u_textureSize.x);
    vec2 uv = (vec2(float(tx), float(ty)) + 0.5) / u_textureSize;

    vec4 data = texture(u_positionTexture, uv);
    vec2 pos = data.xy;
    float life = data.z;
    float maxLife = data.w;

    float alpha = 1.0;
    if (life < 5.0) alpha = life / 5.0;
    if (maxLife > 0.0 && life > maxLife - 10.0) alpha = (maxLife - life) / 10.0;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = u_pointSize;
    v_pos = pos;
    v_alpha = alpha;
}
`;

export const PARTICLE_POINT_FS = COMMON_HEADER + `
uniform sampler2D u_fieldTexture;
uniform sampler2D u_colormapTexture;
uniform vec2 u_colormapRange;
in vec2 v_pos;
in float v_alpha;
out vec4 fragColor;

void main() {
    vec2 fieldUv = v_pos * 0.5 + 0.5;
    if (fieldUv.x < 0.0 || fieldUv.x > 1.0 || fieldUv.y < 0.0 || fieldUv.y > 1.0) discard;
    vec4 fieldData = texture(u_fieldTexture, fieldUv);
    float speed = length(fieldData.xy);
    float t = clamp((speed - u_colormapRange.x) / (u_colormapRange.y - u_colormapRange.x + 0.0001), 0.0, 1.0);
    vec3 color = texture(u_colormapTexture, vec2(t, 0.5)).rgb;
    fragColor = vec4(color * v_alpha, v_alpha);
}
`;

export const ARROW_FS = COMMON_HEADER + `
uniform sampler2D u_fieldTexture;
uniform vec2 u_resolution;
uniform float u_spacing;
uniform vec2 u_colormapRange;
uniform sampler2D u_colormapTexture;

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec2 pixelCoord = v_uv * u_resolution;
    float halfSpacing = u_spacing * 0.5;
    vec2 gridCenter = floor(pixelCoord / u_spacing) * u_spacing + halfSpacing;
    vec2 diff = pixelCoord - gridCenter;

    vec2 centerUV = gridCenter / u_resolution;
    vec4 fieldData = texture(u_fieldTexture, centerUV);
    vec2 vel = fieldData.xy;
    float mag = length(vel);
    if (mag < 0.001) { fragColor = vec4(0.0); return; }

    vec2 dir = vel / mag;
    float arrowLen = min(mag * 8.0, u_spacing * 0.4);
    float shaftWidth = 1.5;
    float headLen = arrowLen * 0.3;
    float headWidth = shaftWidth * 2.5;

    float along = dot(diff, dir);
    vec2 perpDir = vec2(-dir.y, dir.x);
    float perp = abs(dot(diff, perpDir));

    float shaftAlpha = smoothstep(shaftWidth + 0.5, shaftWidth - 0.5, perp) * step(along, arrowLen - headLen) * step(0.0, along);
    float headAlpha = smoothstep(headWidth + 0.5, headWidth - 0.5, perp) * step(arrowLen - headLen, along) * step(along, arrowLen + 1.0);

    float alpha = max(shaftAlpha, headAlpha);
    if (alpha < 0.01) { fragColor = vec4(0.0); return; }

    float t = clamp((mag - u_colormapRange.x) / (u_colormapRange.y - u_colormapRange.x + 0.0001), 0.0, 1.0);
    vec3 color = texture(u_colormapTexture, vec2(t, 0.5)).rgb;
    fragColor = vec4(color, alpha * 0.9);
}
`;

export const TRAIL_FADE_FS = COMMON_HEADER + `
uniform sampler2D u_trailTexture;
uniform float u_fadeAmount;
in vec2 v_uv;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_trailTexture, v_uv);
    fragColor = vec4(c.rgb * u_fadeAmount, 1.0);
}
`;

export const DISPLAY_FS = COMMON_HEADER + `
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_texture, v_uv);
    fragColor = vec4(c.rgb, 1.0);
}
`;

export const COLORMAP_FS = COMMON_HEADER + `
uniform sampler2D u_dataTexture;
uniform sampler2D u_colormapTexture;
uniform vec2 u_range;
uniform int u_mode;
uniform vec2 u_resolution;

in vec2 v_uv;
out vec4 fragColor;

vec2 sampleField(vec2 uv) {
    return texture(u_dataTexture, uv).xy;
}

void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec2 vel = sampleField(v_uv);
    float val = 0.0;

    if (u_mode == 0) {
        val = length(vel);
    } else if (u_mode == 1) {
        float dvx_dy = (sampleField(v_uv + vec2(0.0, texelSize.y)).x - sampleField(v_uv - vec2(0.0, texelSize.y)).x) * 0.5 / texelSize.y;
        float dvy_dx = (sampleField(v_uv + vec2(texelSize.x, 0.0)).y - sampleField(v_uv - vec2(texelSize.x, 0.0)).y) * 0.5 / texelSize.x;
        val = dvy_dx + dvx_dy;
    } else if (u_mode == 2) {
        float dvx_dy = (sampleField(v_uv + vec2(0.0, texelSize.y)).x - sampleField(v_uv - vec2(0.0, texelSize.y)).x) * 0.5 / texelSize.y;
        float dvy_dx = (sampleField(v_uv + vec2(texelSize.x, 0.0)).y - sampleField(v_uv - vec2(texelSize.x, 0.0)).y) * 0.5 / texelSize.x;
        val = dvy_dx - dvx_dy;
    } else if (u_mode == 3) {
        float dm_dx = (length(sampleField(v_uv + vec2(texelSize.x, 0.0))) - length(sampleField(v_uv - vec2(texelSize.x, 0.0)))) * 0.5 / texelSize.x;
        float dm_dy = (length(sampleField(v_uv + vec2(0.0, texelSize.y))) - length(sampleField(v_uv - vec2(0.0, texelSize.y)))) * 0.5 / texelSize.y;
        val = length(vec2(dm_dx, dm_dy));
    }

    float t = clamp((val - u_range.x) / (u_range.y - u_range.x + 0.0001), 0.0, 1.0);
    vec3 color = texture(u_colormapTexture, vec2(t, 0.5)).rgb;
    fragColor = vec4(color, 0.7);
}
`;

export const VORTICITY_FS = COMMON_HEADER + `
uniform sampler2D u_dataTexture;
uniform vec2 u_resolution;
uniform vec2 u_range;

in vec2 v_uv;
out vec4 fragColor;

vec2 sampleField(vec2 uv) {
    return texture(u_dataTexture, uv).xy;
}

void main() {
    vec2 texelSize = 1.0 / u_resolution;
    float dvx_dy = (sampleField(v_uv + vec2(0.0, texelSize.y)).x - sampleField(v_uv - vec2(0.0, texelSize.y)).x) * 0.5 / texelSize.y;
    float dvy_dx = (sampleField(v_uv + vec2(texelSize.x, 0.0)).y - sampleField(v_uv - vec2(texelSize.x, 0.0)).y) * 0.5 / texelSize.x;
    float vorticity = dvy_dx - dvx_dy;

    float t = clamp((vorticity - u_range.x) / (u_range.y - u_range.x + 0.0001), 0.0, 1.0);
    vec3 color;
    if (t < 0.5) {
        color = mix(vec3(0.0, 0.0, 0.8), vec3(1.0), t * 2.0);
    } else {
        color = mix(vec3(1.0), vec3(0.8, 0.0, 0.0), (t - 0.5) * 2.0);
    }
    float alpha = smoothstep(0.0, 0.05, abs(vorticity)) * 0.6;
    fragColor = vec4(color, alpha);
}
`;

export const HEATMAP_FS = COMMON_HEADER + `
uniform sampler2D u_fieldTexture;
uniform sampler2D u_colormapTexture;
uniform vec2 u_colormapRange;
uniform float u_opacity;
in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec2 vel = texture(u_fieldTexture, v_uv).xy;
    float mag = length(vel);
    float t = clamp((mag - u_colormapRange.x) / (u_colormapRange.y - u_colormapRange.x + 0.0001), 0.0, 1.0);
    vec3 color = texture(u_colormapTexture, vec2(t, 0.5)).rgb;
    fragColor = vec4(color, u_opacity);
}
`;

export const LIC_FS = COMMON_HEADER + `
uniform sampler2D u_fieldTexture;
uniform sampler2D u_noiseTexture;
uniform vec2 u_resolution;
uniform float u_stepSize;
uniform int u_kernelLength;

in vec2 v_uv;
out vec4 fragColor;

vec2 sampleField(vec2 p) {
    vec2 uv = p * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
    return texture(u_fieldTexture, uv).xy;
}

void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float sum = 0.0;
    float weightSum = 0.0;

    for (int dir = -1; dir <= 1; dir += 2) {
        vec2 pp = p;
        for (int i = 0; i <= 64; i++) {
            if (i > u_kernelLength) break;
            float w = 1.0 - float(i) / float(u_kernelLength + 1);
            vec2 uv = pp * 0.5 + 0.5;
            if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
                sum += texture(u_noiseTexture, uv).r * w;
            }
            weightSum += w;
            vec2 vel = sampleField(pp);
            float mag = length(vel);
            if (mag < 0.0001) break;
            pp += (vel / mag) * u_stepSize * float(dir);
        }
    }

    float val = (weightSum > 0.0) ? sum / weightSum : 0.5;
    fragColor = vec4(vec3(val), 1.0);
}
`;

export const STREAMLINE_VS = COMMON_HEADER + `
in vec2 a_position;
in float a_speed;
uniform vec2 u_colormapRange;
out float v_speed;
out float v_alpha;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_speed = a_speed;
    v_alpha = 1.0;
}
`;

export const STREAMLINE_FS = COMMON_HEADER + `
uniform sampler2D u_colormapTexture;
uniform vec2 u_colormapRange;
in float v_speed;
in float v_alpha;
out vec4 fragColor;
void main() {
    float t = clamp((v_speed - u_colormapRange.x) / (u_colormapRange.y - u_colormapRange.x + 0.0001), 0.0, 1.0);
    vec3 color = texture(u_colormapTexture, vec2(t, 0.5)).rgb;
    fragColor = vec4(color, v_alpha * 0.9);
}
`;

export const PROBE_LINE_VS = COMMON_HEADER + `
in vec2 a_position;
out float v_alpha;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_alpha = 1.0;
}
`;

export const PROBE_LINE_FS = COMMON_HEADER + `
in float v_alpha;
out vec4 fragColor;
void main() {
    fragColor = vec4(1.0, 1.0, 1.0, v_alpha);
}
`;

export const PROBE_POINT_VS = COMMON_HEADER + `
uniform vec2 u_probePos;
uniform float u_pointSize;
void main() {
    gl_Position = vec4(u_probePos, 0.0, 1.0);
    gl_PointSize = u_pointSize;
}
`;

export const PROBE_POINT_FS = COMMON_HEADER + `
out vec4 fragColor;
void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.3, dist);
    fragColor = vec4(1.0, 1.0, 1.0, alpha);
}
`;
