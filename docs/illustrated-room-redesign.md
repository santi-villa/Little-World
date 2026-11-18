# Habitación ilustrada y pecera frontal

La escena principal abre con el dormitorio ilustrado, la pecera de frente y una sola simulación. Para probarla, ejecutá `npm run dev` y abrí `/Little-World/` en el puerto de Vite. Tocá el vidrio o el botón **Acuario** para acercarte. La bandeja mantiene la tapa, la comida, la esponja y los demás cuidados. **Contemplar** oculta los controles, incluido el cajón de herramientas.

`?classic-room` abre el arte anterior con la misma partida. `?room-preview` conserva el prototipo previo con su partida temporal. En **DEBUG** se puede seleccionar la hora de la escena y probar el amanecer o la noche con el acuario encendido. En uso normal la ventana sigue el horario y clima de Buenos Aires, incluida la alternativa local cuando el servicio no responde.

## Arte y composición

Se inventariaron los 161 PNG y JPG de `public/assets/`, incluidos los nuevos. Todos reportaron dimensiones válidas y no hubo duplicados binarios. El manifiesto ilustrado identifica las 20 texturas utilizadas por la escena y mantiene disponibles los originales, los ZIPs, los estudios y las variantes de decoración. Se reutilizaron `room/bedroom.png`, los sustratos, las plantas sumergidas, los troncos y las piedras de la entrega anterior. El agua se dibuja por código con gráficos de PixiJS.

El nuevo `aquarium/front-frame.png` sale del frente de la carcasa aprobada. Se nivelaron los bordes con un remuestreo leve, se reconstruyó el bisel derecho desde el izquierdo y se descartó el panel lateral para esta versión. El PNG mantiene transparente la abertura. Las dos plantas de habitación tienen PNG independientes de follaje y maceta en `room/decor/layers/`. Allí también están el velador y el gato ilustrado de ImageGen. El gato conserva la caricia y los corazones. La escala y el apoyo del dormitorio se definen en `rooms.json`, `illustrated-room-decor.ts` e `illustrated-layout.ts`.

`node scripts/prepare-illustrated-room.mjs` regenera el marco y el manifiesto a partir de los archivos almacenados. Con un atlas RGBA de cuatro cuadrantes como argumento, también extrae las dos copas y las dos macetas. Los nombres de producción se versionan por contenido igual que los del arte habitual.

## Render y simulación

`TankView` conserva la geometría física, la tapa, las herramientas, el nivel de agua y la simulación. El fondo y los sellos traseros quedan detrás del sustrato en dos contornos. Sobre ellos se componen troncos, piedras, mallas de plantas, peces y partículas. Después pasan las luces, la superficie ondulada, los reflejos y el marco. La abertura compartida recorta las capas interiores y los equipos. La cámara aproxima ese mismo contenedor con easing y mantiene el estado y las animaciones al regresar.

`IllustratedOptics` dibuja el degradado del agua teñido por los taninos, los rayos, los brillos diagonales, las ondas y la refracción aproximada de las caústicas. La corriente existente mueve burbujas, sedimento y mallas de plantas. Los tallos tienen anclajes fijos y reciben una respuesta localizada al paso de un pez. Las texturas de fondo y los gradientes se reutilizan mientras no cambie la geometría o el color del agua. El cielo cachea el degradado y limita la actualización de los elementos móviles, salvo los destellos de tormenta.

El betta articulado lee el mismo `FishMotion` y `BettaDynamics` que usa la partida. Se ajustó solo su escala de dibujo juvenil para que se distinga desde la habitación. Las demás especies conservan su arte y controladores. El modo redondo sigue usando su carcasa y geometría anteriores, colocado en el centro del nuevo mueble. El diseño de HUD y bandeja conserva su arte de papel.

## Verificación

Pasaron la compilación con typecheck y las 277 pruebas existentes. Se comprobaron las 20 texturas ilustradas en dimensiones y alfa. En Chromium se probó el build en escritorio y en tamaño móvil horizontal, incluida la entrada normal, zoom por clic, regreso, animación entre fotogramas, tapa cerrada y abierta, alimentación guardada, limpieza con esponja, modo Contemplar, día/noche, variante redonda, habitación clásica y preview previa. Las capturas se guardaron en `/workspace/artifacts/illustrated-room-redesign/`.

## Iteración de profundidad y ambiente

Los tres diseños de acuario reutilizan sus ilustraciones en planos de fondo, medio y primer plano. Dos grupos de peces se intercalan con esos planos. Los puntos de apoyo, las máscaras de raíces y el relieve de la arena usan el mismo perfil. El sustrato mantiene su textura y agrega variaciones de tono, granos y piedras pequeñas. Los puntos de interés del betta salen de la posición del tronco y de las plantas. El pez también puede pasear a distintas alturas, detenerse al llegar y seguir un grano hasta que desaparezca.

La tapa frontal gira alrededor de un eje trasero con soportes fijos. La apertura lógica se aplica al tocar el botón y borra el aviso anterior. La animación interpola hacia el mismo estado y se puede invertir mientras está en movimiento. Las burbujas salen de la boquilla cuando está por debajo del nivel del agua. La tapa articulada corresponde al tanque rectangular. La pecera redonda conserva su carcasa previa.

Los gradientes de ventana, lámpara, pared y mesa responden a la hora y al estado de las luces, con una transición gradual. La luz nocturna de la pecera depende de su programación habitual. La bandeja se adapta al ancho disponible y el acercamiento reserva lugar para ella, el encabezado y la tapa abierta. DEBUG aparece en desarrollo o en una apertura explícita con `?debug`.

Pasaron el build con typecheck y las 280 pruebas. En Chromium se verificaron la entrada de producción sin DEBUG, el encuadre en escritorio y móvil horizontal, el movimiento, la alimentación bloqueada con tapa cerrada, la desaparición del aviso al abrir, la alimentación guardada, el regreso a la habitación, el modo nocturno y las variantes redonda y clásica. Se guardaron capturas en `/workspace/artifacts/aquarium-depth/`.
