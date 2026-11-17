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
