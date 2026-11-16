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

## Pecera

`tank-view.ts` (vidrio, agua, luz, equipos) y `tank-decor.ts` (arena, piedras,
madera, vallisneria, anubias, musgo). Todo se ubica en proporción al tamaño de
la pecera.

**Sin revisar en pantalla**: se escribió sin capturas (solo compilación). Falta
mirarla en el juego con cada modelo de `tanks.json` y ajustar posiciones y colores.

- La redonda (`shape: "round"`) se dibuja como caja, igual que antes.
- Plantas, madera y piedras son fijas: todavía no salen del estado de la simulación.
- El termómetro se muestra siempre (no hay equipo "termómetro" en la simulación).

## Dormitorio y gato

`render/scene/`: `room-scene.ts` (capas), `room-decor.ts` (muebles, plantas,
vapor, luces aditivas), `window-view.ts` (cielo y climas) y `cat-view.ts` (gato).

**Sin revisar en pantalla**: se escribió sin capturas (solo compilación). Falta
mirarlo en el juego con cada clima y hora (selector en el panel de debug) y
ajustar posiciones y colores.

- El selector de hora del debug es solo visual (ventana, oscuridad, lámpara):
  no cambia la hora de la simulación ni la luz de la pecera.
- La lámpara se prende sola cuando hay poca luz; no es un objeto interactivo todavía.
- Con la pecera más grande (100 cm) tapa casi toda la ventana y el lugar del
  gato en el alféizar queda pegado a ella.
- Faltan de la sección 5 de DESIGN.md: pájaros, viento/cortina, colores del
  amanecer reales y sonido.
- Gato: faltan poses propias de lavarse y jugar (hoy usan sentado y caminando).
