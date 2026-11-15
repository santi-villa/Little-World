# Little World

Un acuario de pixel art con química del agua de verdad. PWA instalable, pensada para jugar en el celular en horizontal.

**Jugar:** https://santi-villa.github.io/Little-World/

El diseño completo del juego está en [DESIGN.md](DESIGN.md): es la fuente de verdad y hay que leerlo antes de programar algo nuevo.

## Estado

- **Fase 0 — base:** Vite + TypeScript + PixiJS v8, PWA instalable en horizontal, escena de 640×360 pixel perfect, guardado en IndexedDB con versión de formato y publicación automática en GitHub Pages.
- **Fase 1 — química del agua:** ciclo del nitrógeno (AOB/NOB), toxicidad del NH3, pH/KH, oxígeno, evaporación, cloro, residuos orgánicos, algas, filtro, cambios de agua y temperatura de la habitación y el agua. Todavía no hay peces: la carga biológica se ajusta a mano desde el panel de debug.

## Comandos

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests de la simulación, el escalado y el guardado
npm run typecheck  # incluye chequear que src/sim no use el DOM
npm run build      # build de producción en dist/
npm run preview    # servir el build
npm run icons      # regenerar los íconos de la PWA
```

Cada push a `main` corre los tests y publica en GitHub Pages (`.github/workflows/deploy.yml`). En el repo tiene que estar elegido **Settings → Pages → Source: GitHub Actions**.

## Simulación

```ts
import { createNewTank, step, applyAction } from './src/sim';

let state = createNewTank({ seed: 42, ammoniaMgNPerDay: 5 }); // el cubo de 20 L
({ state } = applyAction(state, { type: 'feed', grams: 0.1 }));
const { state: next, events } = step(state, 60); // una hora
```

- `step` y `applyAction` son puras: no modifican el estado que reciben, y con el mismo estado (que incluye el estado del RNG) y el mismo delta devuelven siempre lo mismo.
- El estado es JSON puro; guardarlo y cargarlo no cambia el resultado.
- Todas las constantes están en `src/data/sim-config.json` y las peceras en `src/data/tanks.json`.
