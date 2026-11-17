# Interfaz de papel y madera (etapa 1 hecha)

Hecho: sistema de UI con el arte de `marcos-ui.png` (papel, nota, madera,
pestañas, bandeja), HUD de papel con día, hora, clima y gotita del agua,
cursores de mano y herramientas con punto activo, herramienta pegada al dedo y
toque largo en táctil, bandeja de herramientas en la vista pecera (comida,
esponja, balde, kit, filtro, lupa y golpecito), papelitos y confirmaciones con
dos botones de madera, fuente Pixelify Sans y sonidos suaves. Reglas en
`docs/ART-DIRECTION.md` (sección Interfaz).

Revisado con capturas en escritorio (habitación, pecera con herramienta, panel
de agua). Falta probar en un celular real: tamaño de la bandeja, toque largo y
la herramienta pegada al dedo. Los cursores no salen en las capturas: revisarlos
a mano.

Pendiente de la etapa 1:
- Monedas: no existen todavía; el HUD las mostrará solo al ganarlas o en la tienda.
- Reloj de arena: hoy solo mientras se recupera el acuario al abrir; no hay
  aclimatación todavía.
- El panel de debug sigue con su estilo propio (es herramienta de desarrollo).
- Los textos viejos de `texts.hand` (en mayúsculas sin tildes) quedaron sin uso
  donde se reemplazaron por `texts.ui`.

Etapa 2 (no se hizo; queda para la próxima):
- Menús como objetos del cuarto: ubicar celular y cuaderno sobre el escritorio,
  calendario en la pared, kit de test junto a la pecera y libro en la biblioteca
  (arte ya procesado: `objeto-*.png` en `public/assets/ui/`), con sus zonas en
  `rooms.json`; al tocarlos, zoom suave y el menú en la mano:
  cuaderno = diario (páginas y pestañas), libro = enciclopedia, celular = tienda
  (dentro de `ui-celular.png`), calendario = próximos cuidados e historial de
  cambios de agua, kit = medir con tubitos y tabla de colores. Tocadiscos =
  música: el arte existe (`tocadiscos.png`) pero no está en la habitación.
- Ajustes: ícono arriba a la derecha (y toque largo en la lámpara) con
  volúmenes de música, ambiente y efectos, calidad visual, ubicación del clima,
  modo suave, notificaciones y exportar/importar partida.

---

# Mano, cuidado y betta detallado

Implementados: pizcas elegidas sobre la pecera con tapa abierta; cierre de tapa;
esponja por arrastre con limpieza espacial persistente; golpes con susto real;
curiosidad breve ante la mano lenta y retirada ante movimientos bruscos.
El betta usa la imagen detallada ya disponible, con ondulación y giro suaves.

Pendientes: sifón/vertido manual, distribución física de cada grano, saltos,
y más animaciones específicas de alimentación. No interpretar notas históricas
sobre alimentación automática o limpieza de todo el vidrio como comportamiento actual.

---

# Pulido de observación y dirección de arte

Aplicados: luz común, pigmentos menos saturados, sombras de contacto, oclusión por planos,
comida con caída/picoteo visual, rincón y confianza del pez, nombre al seleccionar,
cuaderno agrupado y modo Contemplar. La pasada manual sobre PNG sigue pendiente:
ver `docs/ART-DIRECTION.md` para grilla, paleta, halos, luz y criterios de aceptación.

Se revisaron ausencias de 1/3/7 días con el acuario inicial y exterior de 23 °C.
El séptimo día el pez sobrevive con hambre máxima y salud reducida. El resumen explica
el siguiente cuidado; todavía no hay alimentador automático.

---

# Actualización visual y clima de Buenos Aires

La habitación abre completa y sin modal automático. Hay zoom de pecera y ventana al tocar sus zonas; se vuelve con Habitación. La ventana muestra datos y controla su apertura. El gato sigue decorativo.

Se conectó Open-Meteo (actual, horarios solares e histórico), con caché, referencia estacional explícita sin red y estaciones del hemisferio sur. Se reemplazó el cielo rígido por un paisaje con profundidad, nubes suaves y árboles estacionales.

La pecera ahora tiene plantas en varios planos, raíces enterradas y tres composiciones visuales guardables. La química de plantas, su crecimiento y la decoración libre siguen pendientes. Las notas históricas de abajo pueden describir versiones anteriores.

---

# Actualización: primera experiencia y gato

El gato ahora es decorativo: duerme en su cama y las caricias muestran corazones.
Se retiraron sus necesidades y acciones de cuidado. Las notas históricas sobre paseos,
plato, tolerancia y poses ya no describen el comportamiento actual.

Ya están implementados Agua con avisos explicados, fichas y nombres, Diario persistente,
Guía inicial y confirmaciones de cuidados. El filtro inicial viene colonizado.
La cámara inicial muestra la habitación completa; el debug arranca cerrado.

Las pruebas de esta iteración incluyen navegador de escritorio y viewport móvil horizontal;
queda probar la sensación y rendimiento en un celular físico.

---

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

## Arreglos: celular, nitidez, helecho, cortinas

- Pecera en celular: el PWA guardaba en caché los PNG pero no `manifest.json`;
  con un `vidrio.png` viejo (de otro tamaño) y medidas nuevas, el interior
  quedaba chico y arriba a la izquierda. Ahora el precache incluye los `json`
  (`vite.config.ts`) y la pecera arma vidrio e interior en un mismo contenedor,
  en coordenadas de la imagen del vidrio, midiendo la textura que realmente se
  cargó. Probado en Chromium con DPR 3 (844x390); falta confirmarlo en un iPhone
  real: si quedara una versión vieja instalada, cerrar y abrir la app una vez
  para que se actualice el service worker.
- Regla de nitidez: el juego nunca achica una imagen al dibujarla (achicar con
  vecino más cercano saltea filas: eso hacía las rayas de las plantas). Las
  imágenes salen del pipeline a su grilla o a su tamaño final (`kernel:
  "mitchell"` + `scale` en el config) y se dibujan a escala entera.
  Pendiente: el sustrato (se dibuja a 0,74) y la decoración de la pecera
  (maderas y rocas, a 0,5) todavía se achican al dibujar.
- Gato: los videos se reducen a su grilla nativa (~9,5 px del video por píxel
  del dibujo), tomando el centro de cada celda; sin promediar ni paleta común.
  Se dibuja a x2, en posiciones enteras de su grilla. Su píxel mide la mitad
  que el del fondo (~4): no se puede igualar sin que el gato quede del doble de
  tamaño que su almohadón.
- Helecho: a su tamaño real (la etapa grande mide un tercio del agua), a los
  costados.
- Cortinas: los paños miden ~150 px de alto (para no tapar los vidrios ni la
  biblioteca quedan cortos) y sobresalen un poco de las puntas de la barra.
- Plato del gato: sin dibujo hasta que haya arte del plato.
- Debug: "Nueva partida" borra el guardado y arranca con la pecera inicial y un
  solo betta.

## Estado de la prueba procedural 2.5D

- Implementado: giro con volumen y aletas articuladas en los peces del modo código; selector de comparación con betta plano y PNG. Animación continua, antialias de geometría y cámara sin saltos por redondeo.
- Implementado: anubias/vallisneria con corriente, reacción a cercanía y hábitat con núcleos sólidos, refugios y hojas de descanso. Los núcleos son aproximaciones 2D y no representan cada rama/hoja ni colisiones físicas 3D completas.
- Implementado: cielo más suave, follaje estacional, recorte del exterior, pájaro procedural y retiro de capas de cortinas. Los assets originales se conservan para comparación y recuperación.
- Implementado: estudio separado de escritorio/pecera/maceta 2.5D en el cuaderno. El fondo original se conserva por calidad artística.
- Pendiente: anatomías específicas más detalladas, materiales menos facetados, rest spots que sigan cada hoja deformada, obstáculos con profundidad/contorno más preciso y volumen de pez completo en vez de margen reducido. No hay crecimiento de plantas ni consumo de nutrientes agregado en esta prueba.
- La verificación de celular es por emulación de Chromium; faltan mediciones en teléfonos reales, especialmente cardúmenes grandes.

## Plantas y seguimiento individual

- Segmentos flexibles con raíz fija, corriente, amortiguación y estela de peces para plantas procedurales y mallas PNG. Es física visual simplificada; la química vegetal sigue pendiente.
- Decoración despejada, menor tinte de peces y betta cobrizo para mejorar contraste. Revisar también con especies pequeñas en cardúmenes y en teléfonos reales.
- Un clic sigue al pez; iconos con anillos de salud/estrés/hambre/confianza/aletas. Doble clic o Más información abre ficha. Ver acuario sale del seguimiento.
- Contemplar conserva la cámara, oculta los controles y permite restaurarlos con toque/Escape. Audio ambiental pendiente de la pista del usuario.
- No se pudo verificar la comparación solicitada con fotos externas: las tres fuentes consultadas devolvieron bloqueo HTTP 403.

## Betta con peso: arte articulado

PNG dividido por recortes rígidos en cuerpo, parte trasera y cola. Falta arte en capas independientes de dorsal, anal, pectorales y opérculos para tela/flare anatómicamente fiel. El prototipo usa resorte en la cola y pectoral esquemática. La variante nativa de 52 px se hornea con nearest desde el PNG existente; se escala a enteros y no conserva todo el detalle del original de 519 px. Los giros usan compresión horizontal transitoria antes del espejado; esa transición es la excepción al escalado entero. Revisar visualmente las uniones y la pérdida de detalle: no se hicieron capturas por pedido del usuario.

Conductas visuales del betta: vagar, investigar, respirar con anillo, comida, sobresalto, sueño y flare. `FishMotion.flareBetta(id)` es el hook explícito para conectar un espejo/reflejo cuando exista ese objeto. No hay espejo automático ni se altera la simulación de hambre/oxígeno. El límite físico de pitch es 25°; los 45° al comer son una pose del sprite. Los anillos de respiración no representan consumo químico de oxígeno.

## Prototipo betta con peso: revisión pendiente

Partes 1–5 implementadas. Panel D/toque de 2 s solo en desarrollo; sliders en vivo y exportación JSON. Falta revisión visual del sprite articulado, retorno de plantas y velocidades en teléfonos reales. El escalado entero estable implica tamaño visual cuantizado; la rotación y compresión de giro pueden producir escalones. El PNG recortado no reemplaza arte por capas de aletas ni un flare detallado. La simulación química queda intacta. Por instrucción del usuario: sin tests ni capturas, una compilación al final. Parámetros y extensión a otras especies en docs/MOVIMIENTO.md.

Validación final del prototipo: se ejecutó una sola vez `npm run build`, completada correctamente con typecheck y generación PWA. No se escribieron ni ejecutaron tests y no se tomaron capturas. Falta validación visual y de interacción del prototipo; no asumir que compilar valida la calidad del nado o de los cortes.

## Compatibilidad de publicación del prototipo

El workflow ejecuta pruebas con el contrato anterior de FishMotion (por ejemplo, descanso del betta arriba); el prototipo cambia ese comportamiento. Se separan con la opción explícita `bettaPrototype`, activada desde FishLayer en el juego. Se conserva el paso de pruebas de CI y no se modifican las pruebas. Pendiente confirmar el resultado del workflow: el acceso a los registros de GitHub Actions desde este entorno devolvió Forbidden. No se ejecutaron tests locales por la instrucción del usuario.

## Betta procedural restaurado

El betta activo vuelve al modelo 2.5D hecho con código, conectado a la física con peso, respiración, comida y flare. El sprite PNG articulado queda archivado y fuera del render activo. Pendiente revisión visual del acople entre el modelo procedural y las nuevas fases; sin tests ni capturas por la instrucción vigente del usuario.
