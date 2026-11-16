/**
 * Lo que se dibuja por código encima del fondo del dormitorio: el vapor de la
 * taza, el plato del gato y las luces en blend aditivo (lámpara, resplandor de
 * la pecera y sol en el piso).
 */

import type { Graphics } from 'pixi.js';
import type { TankRect } from '../tank/tank-layout';
import { DESK, LAMP, MUG, PX, SUNBEAM } from './scene-layout';

/** Vapor de la taza. `g` está escalado por PX: se dibuja en píxeles gordos. */
export function drawRoomAnim(g: Graphics, t: number): void {
  // El plato del gato no se dibuja hasta que haya arte del plato.

  // Vapor: tres hilitos que suben ondulando y se deshacen.
  const mx = Math.round(MUG.x / PX);
  const top = Math.round(MUG.y / PX);
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (let w = 0; w < 3; w++) {
      for (let j = pass === 0 ? 0 : 8; j < (pass === 0 ? 8 : 17); j++) {
        if (Math.sin((j - t * 5) * 0.7 + w * 2.1) < -0.25) continue;
        const sx = mx + (w - 1) * 2 + Math.round(Math.sin(t * 1.4 + j * 0.45 + w * 2) * (0.6 + j * 0.12));
        g.rect(sx, top - j, 1, 1);
        any = true;
      }
    }
    if (any) g.fill({ color: 0xf4f0e8, alpha: pass === 0 ? 0.5 : 0.22 });
  }
}

/** Disco de luz por filas de 4 px. */
function disc(g: Graphics, cx: number, cy: number, r: number): void {
  for (let y = -r; y < r; y += 4) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - (y + 2) * (y + 2))) / 2) * 2;
    if (half > 0) g.rect(cx - half, cy + y, half * 2, 4);
  }
}

/**
 * Luces en blend aditivo.
 * @param night 0 de día .. 1 noche cerrada.
 * @param sun   0 sin sol .. 1 sol pleno en el piso.
 */
export function drawLights(g: Graphics, tank: TankRect, lampOn: boolean, night: number, tankLit: boolean, sun: number): void {
  if (lampOn) {
    const k = 0.5 + 0.5 * night;
    // La pantalla encendida.
    g.rect(LAMP.x - 26, LAMP.y - 34, 52, 60).fill({ color: 0xffc070, alpha: 0.2 * k });
    g.rect(LAMP.x - 18, LAMP.y - 26, 36, 48).fill({ color: 0xffe0a0, alpha: 0.16 * k });
    // El halo cálido sobre la pared y el escritorio.
    const rings: readonly (readonly [number, number])[] = [
      [170, 0.03],
      [128, 0.04],
      [92, 0.05],
      [60, 0.065],
      [32, 0.09],
    ];
    for (const [r, a] of rings) {
      disc(g, LAMP.x, LAMP.y + 14, r);
      g.fill({ color: 0xffa850, alpha: a * k });
    }
    // Charco de luz sobre la madera.
    g.rect(DESK.left + 4, DESK.top, 200, DESK.front - DESK.top)
      .rect(DESK.left + 30, DESK.top, 130, DESK.front - DESK.top)
      .fill({ color: 0xffb060, alpha: 0.08 * k });
  }
  if (tankLit && night > 0.05) {
    for (const [grow, a] of [
      [44, 0.02],
      [26, 0.026],
      [10, 0.032],
    ] as const) {
      g.rect(tank.x - grow, tank.y - grow, tank.width + grow * 2, tank.height + grow).fill({ color: 0x4ad0c8, alpha: a * night });
    }
    g.rect(tank.x - 28, DESK.front - 14, tank.width + 56, 14).fill({ color: 0x4ad0c8, alpha: 0.1 * night });
  }
  if (sun > 0) {
    for (let r = 0; r < 40; r += 4) g.rect(Math.round(SUNBEAM.x - 90 + r * 0.8), SUNBEAM.y - 34 + r, 150, 4);
    g.fill({ color: 0xffe9a8, alpha: 0.2 * sun });
  }
}
