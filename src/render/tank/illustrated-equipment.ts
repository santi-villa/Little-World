import type { Graphics } from 'pixi.js';
import type { SimState } from '../../sim';
import type { OpticalArea } from './illustrated-optics';

export function filterMount(area: OpticalArea) {
  return { x: area.left + area.width - 15, outlet: area.top + area.height * 0.19 };
}

export function drawIllustratedEquipment(g: Graphics, area: OpticalArea, state: SimState, lit: boolean) {
  const { left, top, height } = area;

  const edge = lit ? 0xb7c5b8 : 0x748e94;
  const shade = lit ? 0x3c5451 : 0x294147;
  const wire = (x: number, end: number) => g.moveTo(x + 1.4, top)
    .quadraticCurveTo(x - 0.7, top + (end - top) * 0.7, x, end)
    .stroke({ color: shade, width: 1.8, alpha: 0.8 });

  const suction = (x: number, y: number) => {
    g.ellipse(x + 1.7, y, 4.8, 3.1).fill({ color: shade, alpha: 0.44 })
      .stroke({ color: edge, width: 0.46, alpha: 0.35 });
  };

  if (state.heater.watts > 0) {
    const x = left + 23, y = top + height * 0.24, h = height * 0.34;
    wire(x, y);
    suction(x, y + h * 0.21);
    suction(x, y + h * 0.79);
    g.roundRect(x - 3.5, y, 7, h, 3.4).fill({ color: shade, alpha: 0.77 })
      .stroke({ color: edge, width: 0.6, alpha: 0.6 });
    g.roundRect(x - 2.6, y + 6, 5.2, h - 10, 2.1).fill({ color: edge, alpha: 0.31 });
    g.moveTo(x - 1.8, y + 9).lineTo(x - 1.8, y + h - 7).stroke({ color: edge, width: 0.8, alpha: 0.46 });
    g.circle(x, y + 3.3, 0.82).fill(state.heater.enabled ? state.heater.on ? 0xef9062 : 0x89c4a1 : 0x455753);
    const coil = new Array<number>();
    for (let i = 0; i < 18; i++) coil.push(x + (i % 2 ? 1.45 : -1.45), y + 11 + i * (h - 18) / 18);
    g.poly(coil, false).stroke({ color: state.heater.on ? 0xffab75 : 0x656b5e, width: 0.48, alpha: 0.8 });
  }

  const x = left + 8, y = top + height * 0.34, h = height * 0.19;
  suction(x, y + 4);
  g.roundRect(x - 2.2, y, 4.4, h, 2.1).fill({ color: edge, alpha: 0.64 });
  const mercury = (h - 4) * Math.max(0.08, Math.min(1, (state.water.temperatureC - 14) / 20));
  g.moveTo(x, y + h - 2).lineTo(x, y + h - 2 - mercury).stroke({ color: 0xc65b48, width: 0.8, alpha: 0.9 });
  g.circle(x, y + h - 2, 1.12).fill(0xc65b48);

  if (state.filter.flowLph > 0) {
    const { x, outlet } = filterMount(area);
    const y = area.sandTop - height * 0.29;
    suction(x + 3.5, top + height * 0.36);
    suction(x + 3.5, y - 11);
    wire(x + 5.5, outlet - 8);
    g.roundRect(x - 1.8, top, 3.6, y - top, 1.7).fill({ color: shade, alpha: 0.76 });
    g.moveTo(x - 0.9, top).lineTo(x - 0.9, y).stroke({ color: edge, width: 0.64, alpha: 0.37 });
    g.roundRect(x - 4, y - 1, 8, 13, 2).fill(shade)
      .stroke({ color: edge, width: 0.47, alpha: 0.45 });
    g.roundRect(x - 1.8, outlet - 4.8, 10, 6.4, 2).fill(shade)
      .stroke({ color: edge, width: 0.62, alpha: 0.56 });
    g.ellipse(x, outlet - 0.3, 1.5, 2).fill({ color: 0x263c38, alpha: 0.81 });
    for (const dy of [3, 6, 9]) {
      g.moveTo(x - 2.6, y + dy).lineTo(x + 2.6, y + dy).stroke({ color: edge, width: 0.46, alpha: 0.48 });
    }
  }
}
