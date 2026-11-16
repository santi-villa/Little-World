/**
 * Vaivén por shader: corre las filas de píxeles hacia los costados, más cuanto
 * más lejos están del lado anclado. Sirve para las plantas colgantes (ancladas
 * arriba, las mueve el viento) y para las de la pecera (ancladas abajo, las
 * mueve la corriente).
 *
 * Para que no aparezcan rayas: la onda es muy larga a lo alto (toda la planta
 * se inclina junta, no fila por fila) y el corrimiento se redondea a píxeles
 * enteros DEL ARTE (no de la pantalla), así a cualquier zoom se mueve de a un
 * píxel del dibujo.
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
uniform float uScale;

void main(void)
{
    // Fila en píxeles del arte (no de la pantalla).
    float y = (vTextureCoord.y * uInputSize.y) / uScale;
    float k = clamp(y / uHeight, 0.0, 1.0);
    // 0 en el lado anclado, 1 en la punta suelta.
    float free = mix(k, 1.0 - k, uAnchor);
    // Onda lenta y larga: la planta entera se hamaca, con un leve retraso hacia la punta.
    float wave = sin(uTime * 0.55 + uPhase - k * 1.2) * 0.75 + sin(uTime * 0.31 + uPhase * 1.7) * 0.25;
    float dx = floor(wave * uStrength * free + 0.5);
    vec2 uv = vec2(vTextureCoord.x - dx * uScale * uInputSize.z, vTextureCoord.y);
    uv = clamp(uv, uInputClamp.xy, uInputClamp.zw);
    finalColor = texture(uTexture, uv);
}
`;

export class SwayFilter extends Filter {
  private readonly sway: UniformGroup;

  /**
   * @param anchor 'top' para lo que cuelga, 'bottom' para lo que crece desde el piso.
   * @param height Alto en píxeles del arte de lo que se mueve.
   */
  constructor(anchor: 'top' | 'bottom', height: number, phase = 0) {
    const sway = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uStrength: { value: 1, type: 'f32' },
      uAnchor: { value: anchor === 'bottom' ? 1 : 0, type: 'f32' },
      uHeight: { value: Math.max(1, height), type: 'f32' },
      uPhase: { value: phase, type: 'f32' },
      uScale: { value: 1, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'sway-filter' }),
      resources: { swayUniforms: sway },
      padding: 2,
      resolution: 'inherit',
      antialias: 'off',
    });
    this.sway = sway;
  }

  /**
   * @param strength Píxeles del arte que se corre la punta suelta (máximo 1 en las colgantes).
   * @param scale    Píxeles de pantalla por píxel del arte (zoom de la cámara × resolución).
   * @param height   Alto del arte, si cambió.
   */
  set(seconds: number, strength: number, scale: number, height?: number): void {
    const u = this.sway.uniforms as { uTime: number; uStrength: number; uHeight: number; uScale: number };
    u.uTime = seconds % 10000;
    u.uStrength = strength;
    u.uScale = Math.max(0.01, scale);
    if (height !== undefined) u.uHeight = Math.max(1, height);
  }
}
