# Pecera híbrida: prototipo reversible

Rama: `experiment/pecera-hibrida`, basada en el estado actual con el experimento opcional de betta. `main` no se reemplaza. El modo inicial sigue siendo A.

## Probar y ajustar

Abrir `npm run dev -- --host 0.0.0.0`, visitar `/Little-World/` y desplegar **Pecera híbrida · desarrollo**. Elegir A (actual) o B (volumen híbrido). Ambos usan el mismo tanque y la misma partida. El botón Acuario o un clic/toque en el volumen inicia el acercamiento; Habitación reproduce la vuelta. La rueda, pinza, ficha de peces y cuidados siguen usando sus rutas existentes.

Los sliders cambian posición horizontal/vertical, escala, profundidad aparente, ángulo lateral, reflejos, luz y duración. Son ajustes de presentación en memoria, no del guardado. Exportar parámetros JSON descarga `hybrid-tank.json`; el archivo versionado es `src/data/hybrid-tank.json`. Revisar los ajustes antes de reemplazarlo. Restablecer vuelve al archivo predeterminado.

La ubicación se expresa como desplazamiento respecto de `tank-layout.ts`, escalado por ancho de referencia. La perspectiva usa las dimensiones físicas de la pecera y multiplicadores visuales del mismo JSON. No se agregan coordenadas nuevas al fondo, rooms.json, peces ni plantas.

## Decisión de render

Se utiliza PixiJS, sin Three.js ni otro motor. Una cara de perspectiva leve se puede representar mediante una transformación afín reversible: compresión horizontal y desnivel frontal pequeño, más polígonos para el lateral y la superficie superior.

La técnica equivalente a una textura viva es proyectar **el propio grafo de TankView**. Solo hay un TankView, un FishLayer, un FishMotion y una simulación. Se sigue actualizando y dibujando una vez, tanto de lejos como de cerca. Se conserva el orden interno, los recortes, las transparencias y las mallas PNG. No se crea una captura estática ni una segunda copia del interior. No hay segundo renderer, render texture, captura offscreen ni intercambio de GPU al acercarse.

En este prototipo no conviene agregar una textura de baja resolución que obligue a dibujar primero el interior y luego componerlo en otro pase. Mantener la cara viva evita esa pasada extra y preserva el detalle al acercar. No se reduce la frecuencia de actualización visual: peces, resortes, comida y contactos conservan su ritmo. Si un perfil de hardware real demuestra que dibujar el tanque domina el costo, puede estudiarse un cache lejano con invalidación y actualización limitada sin tocar la simulación. No se afirma que esa optimización ya esté implementada.

## Volumen e integración

La carcasa suma lateral derecho con agua teñida con la misma función cromática de TankView, superficie superior del agua, tapa posterior, base, líneas de espesor de vidrio, reflejo lateral, sombra de apoyo y luz sobre el escritorio. No se dibujan peces ficticios en el lateral ni se pretende que sea una segunda cámara exacta del interior. La tapa posterior acompaña la apertura de la tapa existente.

La ventana, clima, iluminación del cuarto, plantas colgantes, gato, fondo e interacciones permanecen. Un oscurecimiento moderado detrás del tanque reduce la presencia del cuarto de cerca. Los sliders de reflejo e iluminación controlan los efectos adicionales de la carcasa; los brillos pintados del PNG y la luz real de la simulación se conservan. Los brillos son aproximaciones artísticas; no se calculan ray tracing, refracción ni iluminación física.

La posición inicial desplaza ligeramente el tanque para dejar lugar al lateral sobre el escritorio. Los rangos de sliders permiten posiciones que pueden quedar mal artísticamente; son una herramienta de desarrollo, no un editor con restricciones del mueble.

## Transición y entrada

La cámara recibe una duración opcional, con suavizado quíntico y zoom logarítmico; los consumidores anteriores conservan el easing exponencial existente. El volumen y la proyección convergen a identidad con la misma duración. La cara viva nunca se oculta, se reparenta ni se recrea durante el viaje. Un brillo muy discreto disimula el cambio de orientación.

No hay corte entre dos acuarios: el final es el TankView frontal original. Los controles de cuidados aparecen cuando la proyección llega al frente. Volver o interrumpir y retomar conserva la posición actual del easing; no reinicia animaciones ni estado. Un movimiento de rueda/pinza puede interrumpir el viaje de cámara; la proyección termina su transición y la entrada usa siempre la matriz inversa correspondiente.

Los clics de la habitación se prueban sobre frente, lateral y tapa proyectados. Al cuidar o tocar peces, los puntos se convierten al sistema frontal existente. Las zonas de ventana, gato y otros objetos siguen en coordenadas de habitación.

## Alcance y límites

- Modo B y panel exclusivos de desarrollo; producción conserva A. No hay cambios de formato de guardado ni de química/cuidados.
- Primera versión para tanques rectangulares. Vidrios redondos usan automáticamente el render actual; no se fuerza su forma a una caja.
- Perspectiva afín suave, no perspectiva proyectiva con puntos de fuga ni rotación libre. Se limita el ángulo para mantener creíble el contenido 2D.
- El vidrio frontal usa el arte existente, que ya contiene una perspectiva de tapa. La nueva carcasa lo acompaña; no se repintaron todos los marcos ni materiales.
- Lateral ambiental, sin una vista geométrica de cada pez/decoración; las colisiones y planos internos son los ya existentes.
- No hay reducción de resolución/FPS lejano ni comparación de rendimiento en teléfonos físicos. El ahorro estructural consiste en no duplicar contenido ni añadir pases offscreen.
- Los polígonos exteriores son recursos persistentes del prototipo; cambiar A/B no crea texturas ni una segunda simulación. El controlador libera geometrías/panel al destruirse, preservando el TankView que no le pertenece.

## Validación final

La implementación se completó antes de ejecutar pruebas. `npm run typecheck`, `npm test` y `npm run build` completaron correctamente. La suite pasó 277 pruebas en 24 archivos, incluidas ocho nuevas de identidad frontal, inversión de coordenadas, aristas/hit testing, polígonos degenerados, easing reversible, duración, cámara y anclaje al cursor. Se conserva la compilación de la simulación sin DOM.

El recorrido de Chromium verificó nueve peces y las mallas de plantas con las mismas instancias durante el viaje, posiciones de peces cambiando durante el acercamiento, frente siempre visible, matriz identidad al llegar, tres viajes completos y reversión a mitad de camino, exportación JSON, alimentación real guardada, tapa, noche, escritorio 1280×720, móvil horizontal 844×390 con pinza, fallback redondo y vuelta A/B. No se observaron errores JavaScript. Las capturas permitieron corregir la altura de la tapa añadida antes de la grabación final.

Se probó también el build servido en producción: controles originales, entrada/salida del acuario y ausencia del panel híbrido; los módulos del prototipo no se emiten en dist. La comparación de código confirma que src/sim, FishLayer, FishMotion, BettaDynamics, PlantMotion, assets, tank-decor y rooms conservan sus implementaciones de la rama base. TankView solo expone forma y color al envoltorio.

Evidencia: `/workspace/artifacts/pecera-hibrida/recorrido.mp4`, capturas A/B, transición, cuidados, noche, móvil y redonda, más `browser-check.json`. No son pruebas en un teléfono físico ni mediciones de tasa real de cuadros.
