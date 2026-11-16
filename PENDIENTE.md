# Pendiente

## Sprites de peces

Sistema en `src/render/tank/sprites/`. Para sumar una especie: crear su archivo
con un `FishSprite` (ver `neon.ts` como ejemplo corto) y registrarla en
`sprites/index.ts` con su id de `species.json`. Nada más.

Con sprite: betta, neón, guppy (macho y hembra), corydoras paleatus, gamba red cherry.

**Sin revisar en pantalla**: los sprites se escribieron sin capturas ni pruebas
(solo compilación). Falta mirarlos en el juego y ajustar proporciones y colores.

Siguen con placeholder (formas simples en `fish-layer.ts`):

- Superficie: endler, gourami miel, pez hacha
- Medio: cardenal, ember tetra, rasbora arlequín, danio cebra, barbo cereza,
  barbo tigre, platy, molly, espada, escalar, tanictis
- Fondo: corydoras pigmeo, otocinclo, ancistrus, kuhli, ramirezi
- Agua fría: goldfish de velo
- Invertebrados: gamba amano, caracol nerita, caracol misterio
- Polizones: caracol trompeta, caracol planorbis

Ideas para después:

- Frames de comer (picoteo) y despliegue de aletas del betta (`flares`).
- Puntos blancos (ich) sobre el sprite.
- Gamba con huevos ("bayada") y muda.
- Variación de color en platys.

## Arte con imágenes (pipeline, habitación y pecera)

- Pipeline: `npm run assets` (`scripts/build-assets.mjs`) lee `assets/raw/` y
  genera `public/assets/` + `manifest.json`. Opciones por archivo en
  `assets/raw/assets.config.json`. Una imagen nueva se procesa sola (piezas
  numeradas); para darle nombres propios se agrega al config.
- Habitación: `render/scene/` (`room-scene.ts`, `room-fx.ts`, `window-view.ts`,
  `cat-view.ts`). Pecera: `render/tank/tank-view.ts` + `src/data/tank-decor.json`.

**Sin revisar en pantalla**: el juego no se abrió después de este cambio (solo
compilación de tipos). Lo primero es mirarlo y ajustar. Lo más probable de tener
que tocar:

- Posiciones a ojo en `scene-layout.ts` (lámpara, taza, alféizar, cama del gato,
  piso) y `tank-layout.ts` (dónde apoya la pecera en el escritorio).
- El shader de vaivén (`sway-filter.ts`): si las plantas se ven mal o no se ven,
  el problema está ahí (se usa en las colgantes y en las de la pecera).
- Zonas de plantas con viento (`plantZones` en el config): se separan por color
  verde/oliva; puede colarse algún libro verde o quedar alguna hoja sin mover.
- Composición de `tank-decor.json` (tamaños en cm y posiciones).

Falta:

- El vidrio se estira a lo ancho para peceras que no tienen la proporción del
  dibujo (en el cubo queda angosto; la tapa se deforma). La redonda no tiene arte.
- La decoración todavía es fija (datos por defecto): no sale del estado de la simulación.
- Calefactor, termómetro, toma del filtro, gato, peces, plato del gato y cielo
  siguen dibujados por código (no hay imágenes de eso todavía).
- La lámpara se prende sola cuando hay poca luz; no es interactiva.
- El viento sale del clima elegido (no hay viento en la simulación).
- "Arranca con un betta" vale para peceras nuevas: una partida guardada conserva sus peces.
- El selector de hora del debug es solo visual.
- Los PNG de `public/assets/` no están en el precache de la PWA (sin revisar).
- De la sección 5 de DESIGN.md: pájaros, cortina, sonido.
- Gato: poses propias de lavarse y jugar.
