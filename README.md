# Little World

Un acuario de pixel art con química del agua de verdad. PWA instalable, pensada para jugar en el celular en horizontal.

**Jugar:** https://santi-villa.github.io/Little-World/

## Estado

- **Fase 0 — base técnica:** Vite + TypeScript + PixiJS v8, PWA instalable, escena de 640×360 pixel perfect, guardado en IndexedDB con versión de formato y publicación automática en GitHub Pages.
- **Fase 1 — simulación del agua:** ciclo del nitrógeno (AOB/NOB), toxicidad del NH3, pH/KH, oxígeno, evaporación, cloro, residuos orgánicos, algas, filtro, cambios de agua y modelo térmico. Todavía no hay peces: la carga biológica se maneja a mano desde el panel de debug.

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

## Estructura

```
src/
  sim/      simulación pura (sin Pixi ni DOM): step(state, deltaMinutes) -> { state, events }
  data/     sim-config.json, con todas las constantes de la simulación
  game/     une la simulación con el reloj real
  render/   escena de Pixi y escalado pixel perfect
  save/     guardado en IndexedDB y migraciones de formato
  ui/       panel de debug (HTML encima del canvas)
tests/      Vitest
scripts/    generación de íconos
```

## Simulación

```ts
import { createNewTank, step, applyAction } from './src/sim';

let state = createNewTank({ seed: 42, ammoniaMgNPerDay: 15 });
({ state } = applyAction(state, { type: 'feed', grams: 0.5 }));
const { state: next, events } = step(state, 60); // una hora
```

- `step` y `applyAction` son puras: no modifican el estado que reciben, y con el mismo estado (que incluye el estado del RNG) y el mismo delta devuelven siempre lo mismo.
- El estado es JSON puro; guardarlo y cargarlo no cambia el resultado.
- Los compuestos de nitrógeno se guardan en mg/L "como N"; `derive(state)` los pasa a las ppm que marcaría un test de acuarismo y calcula el NH3 libre.
- Las colonias de bacterias se miden por su capacidad de oxidación (mg N/día) y viven en dos lugares: el material filtrante y las superficies.

## Notas de implementación (Fases 0 y 1)

El repo no tenía `DESIGN.md` cuando se hicieron estas fases, así que estas decisiones salen del pedido de la tarea y quedan anotadas acá para pasarlas al documento de diseño:

- **Estructura de carpetas:** la de arriba.
- **Escalado:** el múltiplo entero se calcula en píxeles físicos (CSS × devicePixelRatio), no en píxeles CSS. Si la pantalla es más chica que 640×360 físicos, se achica sin múltiplo entero para que se vea entera.
- **Tiempo:** la simulación trabaja en minutos simulados. La velocidad por defecto es 1 minuto simulado por segundo real y se cambia desde el panel de debug. Todavía no se simula el tiempo transcurrido con el juego cerrado.
- **pH:** no es una variable independiente; sale del KH y del CO2 disuelto. La nitrificación consume KH, y sin KH el pH se desploma y la nitrificación se frena.
- **Bacterias:** crecen solo cuando les sobra sustrato y aguantan el hambre muriendo despacio; en equilibrio la colonia puede procesar alrededor del doble de la carga habitual.
- **Cloro:** se modela cloro libre (no cloramina). El agua de canilla tiene 0 de nitrato.
- **Carga biológica:** hasta que haya peces es un número (mg N/día) que se ajusta a mano.
- **RNG:** mulberry32; por ahora solo lo usa el clima de la habitación.
- **Guardado:** una sola partida en IndexedDB, con `formatVersion` y una tabla de migraciones. Un guardado ilegible o de una versión más nueva se copia a un respaldo antes de arrancar una pecera nueva.
