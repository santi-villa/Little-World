/**
 * Vaivén por shader: corre cada fila de píxeles unos pocos píxeles hacia los
 * costados, más cuanto más lejos está del lado anclado. Sirve para las plantas
 * colgantes (ancladas arriba, las mueve el viento) y para las de la pecera
 * (ancladas abajo, las mueve la corriente). El corrimiento se redondea a
 * píxeles enteros para que siga siendo pixel perfect.
 */

import { Filter, GlProgram, UniformGroup } from 'pixi.js';

const vertex = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uStrength;
uniform float uAnchor;
uniform float uHeight;
uniform float uPhase;

void main(void)
{
    // Posición en píxeles dentro del área filtrada.
    vec2 px = vTextureCoord * uInputSize.xy;
    float k = clamp(px.y / uHeight, 0.0, 1.0);
    // 0 en el lado anclado, 1 en la punta suelta.
    float free = mix(k, 1.0 - k, uAnchor);
    float wave = sin(uTime * 1.7 + uPhase - px.y * 0.045) + 0.5 * sin(uTime * 2.9 + uPhase * 2.0 + px.y * 0.11);
    float dx = floor(wave * uStrength * free * free / 1.5 + 0.5);
    vec2 uv = vec2(vTextureCoord.x - dx * uInputSize.z, vTextureCoord.y);
    uv = clamp(uv, uInputClamp.xy, uInputClamp.zw);
    finalColor = texture(uTexture, uv);
}
`;

export class SwayFilter extends Filter {
  private readonly sway: UniformGroup;

  /**
   * @param anchor 'top' para lo que cuelga, 'bottom' para lo que crece desde el piso.
   * @param height Alto en píxeles de lo que se mueve.
   */
  constructor(anchor: 'top' | 'bottom', height: number, phase = 0) {
    const sway = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uStrength: { value: 1, type: 'f32' },
      uAnchor: { value: anchor === 'bottom' ? 1 : 0, type: 'f32' },
      uHeight: { value: Math.max(1, height), type: 'f32' },
      uPhase: { value: phase, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'sway-filter' }),
      resources: { swayUniforms: sway },
      padding: 4,
      resolution: 1,
      antialias: 'off',
    });
    this.sway = sway;
  }

  /** @param strength Píxeles que se corre la punta suelta (1 a 2 queda bien). */
  set(seconds: number, strength: number, height?: number): void {
    const u = this.sway.uniforms as { uTime: number; uStrength: number; uHeight: number };
    u.uTime = seconds % 1000;
    u.uStrength = strength;
    if (height !== undefined) u.uHeight = Math.max(1, height);
  }
}
