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

- El vidrio ya no se estira: se escala parejo y su ancho sale del largo (60 cm =
  la parte libre del escritorio). Como hay una sola imagen de vidrio, todos los
  modelos tienen su proporción: el cubo se ve como una rectangular más chica.
  Falta arte de cubo y de redonda.
- La decoración todavía es fija (datos por defecto): no sale del estado de la simulación.
- Calefactor, termómetro, toma del filtro, gato, peces, plato del gato y cielo
  siguen dibujados por código (no hay imágenes de eso todavía).
- El viento sale del clima elegido (no hay viento en la simulación).
- "Arranca con un betta" vale para peceras nuevas: una partida guardada conserva sus peces.
- El selector de hora del debug es solo visual.
- Los PNG de `public/assets/` no están en el precache de la PWA (sin revisar).
- De la sección 5 de DESIGN.md: pájaros, cortina, sonido.
- Gato: poses propias de lavarse y jugar.

## Cámara y zonas tocables

- `render/camera.ts` (zoom y paneo con easing), zonas en `src/data/rooms.json`
  (`render/scene/room-zones.ts`), botones y paneles en `render/ui/scene-ui.ts`.
  Los gestos los resuelve `RoomScene` (`pointerDown/Move/Up`).
- **Sin revisar en pantalla** (solo compilación). Ajustar a ojo: rectángulos de
  las zonas en `rooms.json`, vista inicial y zoom del gato.
- Pixel perfect: el canvas se dibuja a la resolución de la pantalla (hasta 3x) y
  en reposo el zoom se ajusta a un número entero de píxeles físicos si queda a
  menos de 12% del pedido; si no, queda fraccionario (por ejemplo 1.5x en una
  pantalla de 1280x720 justa).
- Plantas colgantes: ahora la capa tiene solo las hojas (las hojas también quedan
  en el fondo, sin relleno inventado), se corren como máximo 1 píxel del arte y
  la onda es lenta y larga (toda la planta se hamaca junta). Si igual no queda
  prolijo, se desactiva sacando `sprite.filters = [filter]` en `room-scene.ts`.
- La lámpara la elige el jugador y no se guarda (al recargar vuelve a prenderse
  sola cuando oscurece).
- Ventana abierta: cambia la simulación y entra más viento a las plantas, pero no
  hay arte de la ventana abierta.
- Biblioteca y cuaderno abren paneles provisorios (enciclopedia y diario: falta).
- Acciones de cuidado de la vista de pecera: alimentar, limpiar vidrio, cambio de
  agua 25% (acondicionada, a la misma temperatura, sifoneando), rellenar, limpiar
  filtro y sacar muertos (si hay). Cantidades fijas: falta elegirlas.
- Los textos de la UI van sin tildes porque la fuente de píxeles no las tiene.
- La pecera inicial pasó a ser la rectangular mediana (`rect_65`); si algún test
  esperaba el cubo, hay que actualizarlo (no se corrieron los tests).
