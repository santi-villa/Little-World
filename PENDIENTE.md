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
- El canvas queda en 1280x720 y el navegador lo agranda (cambiar la resolución
  del canvas según la pantalla corría y achicaba la escena en celulares). En
  reposo el zoom se ajusta a un número entero si queda a menos de 12% del pedido.
- Plantas colgantes: ahora son piezas aparte (`colgantes.jpg`, `enredadera-barra.jpg`)
  que se hamacan rotando apenas el sprite entero con el pivote arriba (máx. 2°).
  Ubicación y escala en `scene-layout.ts` (`HANGING`, `CURTAINS`).
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

## Pecera, píxel y gato con sprites

- El hueco del vidrio sale del manifest (`inner` de `vidrio`, medido en la
  imagen: de vidrio a vidrio, debajo de la tapa y arriba de la base). Agua,
  arena, decoración y peces van recortados a ese hueco; el agua lo llena con la
  superficie 3 px bajo la tapa. Las aristas del vidrio de atrás son otra capa
  (`vidrio-fondo.png`) que va detrás del agua; en el frente quedan el marco y
  los reflejos (separados por brillo: puede quedar algún resto fino).
- Tamaño de píxel: el manifest trae `artPx` (píxeles del PNG por píxel del
  dibujo, según `sourceArtPx` del config, medido a ojo). En la pecera todo va a
  1 píxel del dibujo = 1 píxel de la escena, también lo dibujado por código
  (peces, burbujas, equipos). El fondo de la habitación tiene píxeles de ~2,7 y
  el gato está escalado a eso. La UI usa píxeles de 2 o 4 de la pantalla.
- La decoración ya no se escala por cm sino a su tamaño natural (`scale`
  opcional en `tank-decor.json`). En peceras más chicas o más grandes que la
  rectangular mediana, revisar que entre (el helecho grande llega a la superficie).
- Las plantas de la pecera ondulan con una malla (`MeshPlane`), de a píxeles
  enteros del dibujo: no usan shader.
- Gato: ahora sale de los videos (ver la sección de abajo); las hojas `gato.jpg` y
  `gato-alternativa.jpg` se saltean en el pipeline.
- Revisado con capturas de pantalla (escritorio, 1280x720): vista habitación y
  vista pecera. No se probó en un celular real.

## Dormitorio nuevo, cielo, pájaro y gato con videos

- Fondo: `dormitorio-sin-plantas.jpg` (sale como `dormitorio.png`; el viejo
  `dormitorio.jpg` se saltea). Lugares en `scene-layout.ts`, zonas y vista
  inicial en `rooms.json`, pecera en la mitad libre del escritorio
  (`tank-layout.ts`). Revisado con una captura de día y una de noche, y con una
  composición estática de la habitación entera.
- Cortinas: solo los paños (la barra del dibujo no coincide con la del fondo),
  colgados de la barra del fondo, a una escala que deja libre la lámpara.
- Cielo de noche: `cielo-noche.png` entre el degradé y el clima; aparece de a
  poco según la hora y se tapa con nubes y lluvia. Estrellas que titilan suave
  por código (la luna viene en la imagen).
- Pájaro: en días despejados, cada 40 a 100 s se posa afuera (vidrio de abajo a
  la izquierda), se queda 6 a 11 s, se da vuelta y se va. Si el gato está
  sentado, lo mira. Se achicó mucho la imagen (de 645 a 65 px): queda con
  píxeles más finos que el fondo.
- Gato con videos (`scripts/video-frames.mjs`, necesita ffmpeg): 21 clips con
  cortes definidos en `assets.config.json` (`files["gato/videos/..."].clips`).
  Del video de comer se usa solo de 2,4 a 6,8 s. Transiciones: despertar,
  acostarse, pararse (o estirarse + bostezar, a veces), sentarse, echarse,
  levantarse, rodar, incorporarse, agacharse y erguirse.
  - Estados: dormir, comer, lavarse, mirar peces/ventana/pájaro (cola), enojado
    (echado en loaf), caminar/jugar. Acariciar: mimos; ronroneo: panza arriba.
  - Falta: animación propia de tocar el vidrio y de jugar; los bucles de video no
    siempre cierran perfecto (puede verse un saltito al reiniciar caminar o
    lavarse); el gato "camina por el aire" para subir al escritorio o a la tapa.
- El pipeline procesa solo todas las imágenes nuevas (peceras, plantas de pecera,
  equipos, íconos, animales...): salen con nombres numerados y todavía no se usan.
