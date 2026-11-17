# Una sola dirección de arte para Little World

La referencia principal es la habitación existente: madera cálida, sombras azuladas y verdes apagados. La pecera tiene que pertenecer a esa habitación, aunque al acercarnos se vea más detalle.

## Aplicado en esta iteración

- Luz diurna crema `#f5efdf` y sombra nocturna `#424b68` compartidas por habitación, gato y decoración (`src/render/art-direction.ts`).
- Peces con pigmentos un poco menos saturados; profundidad con mezcla hacia el color del agua, sin convertir el plano lejano en azul brillante.
- Sombras de contacto bajo madera, piedras y vegetación. La sombra toca la base: ningún objeto debe parecer flotando.
- Peces repartidos entre planos de decoración. Los lejanos pasan detrás de madera y plantas; los cercanos también pueden quedar detrás de hojas delanteras.
- Fases de movimiento individuales y tallos con desplazamiento pequeño. Nunca usar un balanceo idéntico para toda la pecera.
- Comida en pocos granos y colores tierra, con caída y picoteo discreto, sin efectos grandes ni brillos de arcade.

## Próxima pasada sobre los archivos de arte

1. **Elegir una grilla por familia.** Habitación: mantener la grilla existente (aprox. 4 píxeles de escena por píxel dibujado). Peces, gato y plantas cercanas: detalle de 2 píxeles de escena, con excepciones de 1 para ojos y granos. Comprobarlo a zoom 1 y al acercar. No agrandar un PNG distinto hasta que “más o menos” coincida.
2. **Reducir cada familia a una paleta común.** Usar 16–24 colores principales por objeto y compartir sombras, verdes y tonos de luz. No forzar todos los materiales a la misma paleta: conservar sus diferencias de madera, roca y hojas.
3. **Repasar siluetas antes del detalle.** Las hojas, raíces y bordes de piedra necesitan una limpieza manual sobre fondo claro y oscuro. Quitar halos blancos y píxeles semitransparentes aislados. Evitar bordes de un solo píxel muy contrastado en un asset grande.
4. **Fijar la dirección de la luz.** Ventana arriba/atrás, LED encima del agua, lámpara cálida al costado. Pintar volúmenes de base con una luz neutra y aplicar el ambiente en el motor, para no duplicar luces incompatibles.
5. **Usar una ficha por asset.** Tamaño físico en cm, tamaño del PNG, `artPx`, punto de apoyo, capa de profundidad, colores principales y dirección de luz. Comparar cada nuevo asset al lado de una anubias y una roca ya aprobadas.
6. **Animar desde una silueta limpia.** Mantener tamaño, apoyo y volumen entre cuadros. El gato no debe cambiar de escala al respirar; las aletas pueden deformarse, el cuerpo no debe derretirse.

## Orden recomendado de retoque

Primero las plantas con raíces/halos y las rocas más contrastadas. Después el betta y sus aletas, comparándolos contra el agua y las plantas. Por último el gato y los pequeños objetos de la habitación. Es preferible terminar cinco assets coherentes y reutilizarlos antes de generar treinta nuevos.

## Criterio para aceptar un asset

Revisarlo en habitación completa, pecera de cerca, noche y celular horizontal. Su silueta debe ser legible, el tamaño coherente, la base apoyada y la iluminación compatible. El filtrado nearest conserva bordes, pero no corrige una grilla o un dibujo incoherentes.

Los ajustes del motor reducen las diferencias actuales; no sustituyen esa edición de los PNG. No se regeneraron ni repintaron imágenes en esta iteración.

## Corrección del betta

Se comprobó que el asset detallado `public/assets/animales/betta.png` ya existía. Ahora se usa directamente en una malla con filtrado nearest, movimiento restringido a las aletas y giro progresivo. La diferencia de calidad venía de la ruta procedural de muy pocos píxeles, no de ese PNG. Se conserva el tamaño físico del animal: acercar la cámara muestra su detalle sin convertirlo en un pez desproporcionado.

## Interfaz

La interfaz vive "dentro del mundo": papel, tinta, madera. Es mínima y nunca tapa la pecera ni bloquea la escena sin necesidad. Todo lo nuevo sigue estas reglas.

**Paleta.** Papel crema `#f3e3c2`, tinta marrón `#5b3a24` (secundaria `#8a6446`), texto sobre madera `#fbeed2` con sombra `#4a2a16`, acento turquesa `#3f9a94` (foco, herramienta elegida, botón principal). Estados del agua: bien `#4aa8c8`, revisar `#e0a64a`, peligro `#d0584a`. Variables en `src/ui.css`.

**Fuente.** Una sola: Pixelify Sans (SIL OFL 1.1, licencia en `public/fonts/PixelifySans-OFL.txt`). Dos tamaños: 20 px para texto y 30 px para títulos; son los que la dejan nítida (2 y 3 px de pantalla por píxel de la letra). No usar otros tamaños ni negritas sintéticas.

**Arte y escala.** Los marcos salen de `assets/raw/ui/marcos-ui.png` (`npm run assets`) a su grilla (1 px del PNG = 1 px del dibujo) y se muestran a escala entera: `--ui` = 2 px de CSS por píxel del dibujo (1 en pantallas bajas, como un celular horizontal). Nunca achicar una imagen al dibujarla.
- Papel (paneles, cuaderno): 9-slice que estira solo el centro (`border-image ... round`); la cinta washi es una imagen aparte centrada arriba, así no se deforma.
- Nota (papelitos, HUD): igual que el papel, con su cinta rosa aparte.
- Botón de madera: normal y presionado (`:active`), alto mínimo 44 px reales.
- Pestañas: amarilla, rosa y turquesa, en ese orden, a tamaño fijo.
- Bandeja de madera: la barra de herramientas de la vista pecera.

**Componentes** (`src/render/ui/paper-ui.ts`): `showNote` (papelito que aparece y se va solo, nunca bloquea), `confirmPaper` (solo para acciones importantes: dos botones de madera, el principal con acento turquesa), `woodButton`. El HUD (`hud-paper.ts`) es un papelito con día, hora e ícono de clima y una gotita con el estado del agua; se oculta en Contemplar.

**Cursores** (`assets/raw/ui/cursores-*.jpg`): todos al mismo tamaño (32x32, y 64x64 para pantallas densas) con el punto activo en la punta del dedo o de la herramienta (`hotspot` en el manifest). Estados: mano abierta (normal), señalar (sobre algo tocable), agarrar (arrastrando la cámara), acariciar (sobre el gato), la herramienta activa (pizca, esponja, lupa, balde, golpecito) y reloj de arena (esperando). Con el dedo no hay cursor: la herramienta activa va pegada al dedo mientras se arrastra, y un toque largo muestra el nombre de lo que se toca (lo mismo que el hover).

**Herramientas.** Se eligen en la bandeja; la elegida se levanta con un borde turquesa y aparece "Soltar". Si no se puede usar, se sacude suave y un papelito explica por qué.

**Animación.** Corta y suave: deslizar y fundido de 200 a 320 ms con `cubic-bezier(0.2, 0.7, 0.2, 1)`; sin rebotes ni escalados grandes. Con `prefers-reduced-motion`, sin animación.

**Sonido.** Opcional y bajo: roce de papel al abrir papeles y papelitos, click de madera en los botones (`ui-sound.ts`, se apaga con `localStorage lw-sound = off`).

## Prueba de arte procedural con volumen

El modo Código con volumen usa una cámara ortográfica fija y caras ordenadas por profundidad. El giro muestra frente y costado con espesor; la paleta azul verdosa del betta y sus membranas evita saturaciones excesivas. Los otros peces heredan pigmentos y rasgos del catálogo, con aletas largas, cuerpos altos o alargados y franjas diferenciadas. La geometría todavía es estilizada y facetada: aporta articulación, no el detalle pictórico del PNG. La comparación anterior sigue disponible en Cuaderno → Peces.

La anubias tiene hojas anchas y tallos separados; la vallisneria, cintas largas. Su flexión por proximidad es una respuesta visual amortiguada, mientras los núcleos sólidos/refugios se describen aparte en el hábitat. Los movimientos usan coordenadas continuas y antialias; los PNG conservan nearest. No es necesario que el movimiento siga la grilla del fondo.

La habitación geométrica del cuaderno es un estudio de volumen, sombras de contacto y colocación con medidas. Mantener el dormitorio pintado: el estudio aún pierde riqueza, materiales y personalidad. Para unificar el arte conviene conservar una sola dirección de luz, la paleta crema/azul verdosa y la misma perspectiva; después trabajar materiales y siluetas de un conjunto pequeño (pez + dos plantas + roca), comparándolos en el agua real antes de convertir más elementos. La interactividad también puede usar volúmenes invisibles bajo imágenes: no exige reconstruir toda la habitación.

## Legibilidad de la pecera y observación

El cuerpo cobrizo del betta contrasta con el agua azul verdosa; se reduce el tinte por profundidad y las motas frontales. Las masas de plantas quedan principalmente atrás y a los lados, con un corredor central y objetos bajos más pequeños. Mantener tamaño simulado separado del mínimo visual necesario para leer un animal pequeño.

La observación individual usa iconos con anillos y cámara continua; el cuaderno se reserva al detalle. Contemplar limpia la pantalla conservando el pez seguido. Referencias externas solicitadas: se intentaron consultar Wikipedia/Aquascaping, Tropica/Inspiration y 2Hr Aquarist; el acceso HTTP fue bloqueado (403), por lo que esta iteración no se presenta como una comparación fotográfica verificada.

## Plantas de imagen, profundidad y especies

Las plantas vuelven a los PNG del catálogo, con malla de 4×16 vértices, raíz anclada e interpolación de los resortes entre segmentos; no hay sustitución por plantas dibujadas con código. Se conserva el impulso del betta. El agua muestra pared trasera, laterales y plano inferior; los peces recorren continuamente el eje visual de profundidad, con perspectiva de tamaño, altura, orientación y oclusión entre plantas.

Todos los peces usan el modelo procedural con perfiles por especie en `fish-appearance.json`: alturas, colas y patrones (neón/cardenal, rayas del danio, bandas de barbos/escalar/kuhli, cuña de rasbora, manchas, espada y doble cola de goldfish). Se reduce el velo y tinte del agua para conservar pigmentos. Son modelos estilizados, no reproducciones anatómicas completas.

Crecimiento visual: `aquarium-visual.json` permite 14 días simulados desde la edad de llegada para pasar de 35% a 100% del largo adulto. Se deriva de la edad guardada, no de abrir/cerrar el navegador. El tamaño químico/biológico original de la simulación no cambia. Enfermedad y salud reducen aceleración, avance y coletazo. Los peces muertos permanecen panza arriba, flotando, hasta Retirar animales muertos; no se agregan eliminaciones automáticas.

La redonda usa `redonda-1` y un recorte elíptico del contenido. El modelo bowl_8 la activa automáticamente. Cuaderno → Decorar permite elegir también vidrio redondo como apariencia guardada localmente, conservando capacidad, cuidados y habitantes; no convierte la partida en otro modelo ni agrega peces a una pecera pequeña.
