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
