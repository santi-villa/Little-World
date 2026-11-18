# Prueba de coherencia visual: habitación + pecera

## Alcance y punto de partida

Estudio estático y reversible: dos imágenes independientes y una página que las superpone. No cambia el juego, sus assets actuales, su simulación ni sus guardados. No continúa todavía el sistema híbrido ni agrega otra cámara o motor.

Al iniciar el trabajo, el árbol estaba limpio y la rama `experiment/pecera-hibrida` apuntaba a `05abab2`. Se consultaron las ramas remotas el 18 de noviembre de 2026:

- `origin/main`: `c0d8af2`.
- `experiment/betta-ilustrado-articulado`: `cd2f4c6`, ya subido, sin fusionar en main.
- `experiment/pecera-hibrida`: `05abab2`, ya subido, sin fusionar en main.

La rama de este estudio, `experiment/coherencia-visual`, parte de `05abab2` y hereda esos dos commits. No había cambios locales ni commits pendientes de subir en la rama de partida. Main se conserva intacta.

## Referencia y dirección

Se revisaron `public/assets/animales/betta.png`, `betta-articulated.png`, los directorios de habitación y pecera, `room-scene.ts`, `tank-view.ts`, `docs/ART-DIRECTION.md` y `docs/BETTA-ILUSTRADO.md`.

La referencia estética principal es el atlas nuevo `src/render/dev/art/betta-illustrated-atlas.png`: dibujo naturalista estilizado, pigmentos suaves, detalle fino y volumen por iluminación. Los dos PNG antiguos del betta siguen teniendo un acabado pixelado; no son la referencia de acabado para esta prueba.

Se conserva el carácter acogedor de Little World: crema, madera cálida, verdes apagados y azules verdosos. La ventana ilumina desde arriba a la izquierda y el acuario aporta una luz interior discreta. La perspectiva permanece casi frontal, con profundidad leve, para permitir una futura vista cercana lateral de los peces sin exigir modelos 3D.

## Archivos

- `public/assets/concept/aquarium-test.png`: pecera aislada, sin peces incorporados.
- `public/assets/concept/room-test.png`: fondo de habitación sin pecera.
- `public/assets/concept/preview.html`: composición ajustable, sin dependencias del juego.
- `public/assets/concept/placement.json`: ajuste inicial compartido por escritorio y móvil.
- `docs/prompts/aquarium-test.md` y `room-test.md`: prompts, referencias y procedencia de las imágenes.

Los assets se generaron con ImageGen, usando el atlas como referencia. La habitación utiliza también la pecera como referencia visual. No se añadieron al manifiesto de assets: el juego no los carga ni sustituye sus imágenes actuales. Vite copia estos archivos públicos al compilar.

## Abrir y ajustar

Ejecutar `npm run dev -- --host 0.0.0.0` y abrir la dirección que informe Vite, añadiendo `/Little-World/assets/concept/preview.html`. Con `npm run preview` se utiliza la misma ruta. La página debe servirse por HTTP porque carga su configuración mediante `fetch`.

La habitación define el tamaño y la proporción de la escena; la pecera se dibuja encima conservando la proporción original del PNG. Los controles permiten ajustar posición horizontal, apoyo vertical y ancho sin deformar ni recortar los archivos. El ajuste responde al ancho del fondo y se conserva proporcionalmente en pantallas pequeñas.

En `placement.json`, los tres valores son porcentajes:

- `x`: centro horizontal del lienzo de la pecera, relativo al ancho de la habitación.
- `y`: borde inferior del lienzo de la pecera, relativo al alto de la habitación. Incluye el margen transparente del PNG; la base pintada queda un poco más arriba.
- `width`: ancho completo del lienzo de la pecera, relativo al ancho de la habitación.

**Guardar ajuste** descarga un JSON. Para conservarlo en el repositorio, reemplazar `placement.json` con ese archivo. **Restablecer** vuelve al ajuste inicial cargado. **Ver pecera** permite comprobar que el mueble del fondo está vacío. La página no usa el almacenamiento de partidas.

## Qué permite decidir y qué queda pendiente

Esta prueba permite valorar juntos la paleta, la mano visual, la escala, el apoyo sobre el mueble y la perspectiva. Las imágenes aisladas permiten reutilizar cada pieza sin regenerar toda la escena.

La pecera incluye su interior dibujado y no es todavía un conjunto de capas de producción: arena, plantas, agua y vidrio no son elementos interactivos separados. La habitación tampoco está segmentada para ventana/clima, ciclo de luz, gato u objetos interactivos. No hay peces, animación ni transición en esta prueba. No se presenta como integración terminada en PixiJS.

Después de revisar la composición, el siguiente paso recomendado es fijar perspectiva, escala, paleta y nivel de detalle. Solo entonces conviene separar el asset aprobado en vidrio/bordes, agua/interior y fondo, y preparar la ventana y las luces de la habitación como capas. Eso permitirá reutilizar peces y simulación existentes sin un interior estático ni transparencias duplicadas.

## Composición entregada y revisión

El ajuste inicial es `x: 50.2`, `y: 69`, `width: 43`. Debido al margen transparente, el tanque pintado ocupa aproximadamente un 35% del ancho de la habitación y apoya alrededor del 61% de su altura, dentro del tablero. La habitación mide 1672 × 941 píxeles; la pecera, 1536 × 1024 RGBA, con 659145 píxeles completamente transparentes. Los PNG pesan aproximadamente 2.66 MB y 2.12 MB respectivamente, sin optimización adicional en esta fase.

La revisión de la composición muestra una dirección coherente: materiales de madera, paleta cálida, vegetación y pincelada compatibles; el lateral derecho de la pecera da profundidad sin introducir una perspectiva extrema. La pecera tiene un acabado algo más fino y limpio que las paredes texturadas del fondo. Al verla de cerca, convendrá unificar ese grado de textura y construir una sombra de contacto que responda a cambios de iluminación. Este estudio solo valida el apoyo y la luz dibujados en la composición inicial.

Validación al terminar:

- `npm run build` correcto; incluye `npm run typecheck`.
- Navegador Chromium: 1440 × 1100 y 390 × 844, sin errores de página ni de carga.
- Imágenes decodificadas, controles de posición/escala, ocultar/mostrar repetidamente, restablecer y descarga del JSON comprobados.
- Sin desbordamiento horizontal en móvil; proporción y escala relativa conservadas.
- PNGs y configuración copiados sin alteraciones a `dist/assets/concept/`.
- Se revisaron capturas de la composición y de la preview móvil. Se conservaron en `/workspace/artifacts/coherencia-visual/` durante esta sesión.

No se ejecutó la suite de simulación: solo se añadieron assets, documentación y una página estática aislada. No hubo cambios en archivos existentes del juego. La preview no está preparada como una aplicación offline; las imágenes conceptuales no se incluyen en la caché previa de PNGs del juego.
