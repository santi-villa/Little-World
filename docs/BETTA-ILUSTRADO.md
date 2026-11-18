# Betta ilustrado articulado: experimento

Rama: `experiment/betta-ilustrado-articulado`. El betta actual, la química y las demás especies se conservan. No es una migración del estilo del juego.

## Cómo comparar

1. Instalar dependencias si hace falta con `npm ci` y abrir `npm run dev -- --host 0.0.0.0`.
2. Visitar `/Little-World/?betta-lab`. Abre únicamente el laboratorio, sin leer ni escribir la partida de IndexedDB.
3. Elegir natación, aceleración, frenado, giro, descanso, alimentación o sobresalto. Ambos modelos reciben el mismo FishBody y BettaDynamics. Repetir reinicia la escena de prueba, no la partida.
4. Usar zoom 1×–8×, pasos a 15/30/60/120 FPS, pausa y articulaciones. La secuencia automática recorre siete escenas, siete segundos por escena.
5. Para verlo en el acuario real, abrir la URL normal de desarrollo y elegir Betta actual o Betta ilustrado en el control de laboratorio. El cambio no reinicia el cuerpo ni se guarda. El valor inicial es el actual.

El laboratorio usa Game, la química, FoodParticles y FishMotion existentes. Las escenas prescriben intenciones/estímulos de diagnóstico a un ejemplar adulto de 6 cm y semilla fija, sin crear una segunda inteligencia. Aceleración/giro/alimentación usan granos de comida reales; descanso ofrece refugio; frenado pide reposo en la posición actual para aislar el arrastre sin volver a acelerar al sobrepasar un objetivo fijo; sobresalto aplica la acción existente de golpear vidrio. El consumo depende del contacto y descuenta masa en la simulación. Los renderizadores solo leen los resultados.

Cerrar la entrada directa vuelve al juego normal; cerrar el laboratorio desde el acuario conserva la vista previa del juego.

El selector y la herramienta se importan exclusivamente bajo `import.meta.env.DEV`. El build de producción mantiene el render habitual y no incluye el atlas ni los módulos experimentales. No hay nuevos campos de guardado ni dependencias.

## Arte y articulaciones

El recurso nuevo `src/render/dev/art/betta-illustrated-atlas.png` es una ilustración generada para este prototipo, RGBA de 1536×1024. Contiene seis componentes separados: torso sin aletas, caudal, dorsal, anal, pectoral y opérculo. No se usa una secuencia de fotogramas, ni el PNG pixelado anterior, ni geometría provisional como ilustración principal. Se agrega `betta-front-head.png` (RGBA 1254×1254), una cabeza frontal generada con la misma referencia para dar grosor visual durante el giro. Ambos originales de generación se conservan en el entorno.

El torso se divide en tres recortes solapados (cabeza, cuerpo y sección posterior). Todos comparten coordenadas y skinning para que las uniones sigan la misma superficie. Se duplican pectorales/opérculos para ambos lados; dos radios pélvicos finos se dibujan como detalle complementario. Marcos y parámetros están en `src/data/illustrated-betta.json`.

La longitud de referencia es 120 unidades (caudal aproximadamente −66 a boca +54); torso 72 unidades, acorde al `bodyFraction` de 0,6 ya usado por la física. Se escala a la longitud que FishLayer entrega al modelo actual: mismo crecimiento y misma perspectiva de profundidad. No se agranda artificialmente el nuevo pez para favorecerlo.

Los pivotes de cabeza, tronco, zona posterior y caudal están en x=25, 8, −5 y −18. Las mallas se deforman con mezcla continua entre huesos. La amplitud corporal está limitada; los márgenes ocultos y el solapamiento evitan cortes al curvarse. Las aletas se anclan bajo el torso. La fuente de textura usa filtrado lineal propio; no cambia el nearest de plantas, habitación u otros peces.

## Representación del movimiento

`IllustratedBettaPose` lee velocidad, aceleración, cambio de rumbo, fuerza, corriente y modo/stroke de BettaDynamics. Su estado es exclusivamente de presentación. Integra a pasos de hasta 1/120 s para amortiguar aletas sin depender del FPS del render. Frecuencia, esfuerzo y orientación cambian gradualmente; las fases de pectorales y respiración se integran para evitar saltos al cambiar de frecuencia.

Las aletas caudal/dorsal/anal tienen nueve nodos de resorte amortiguado, acoplamiento, arrastre, inercia por aceleración y límites de velocidad/deformación. La raíz permanece fija. El reposo reduce la excitación; no todas las membranas llevan la misma fase ni amplitud. Pectorales y opérculos tienen movimiento independiente. El picoteo aparece solamente cerca de una partícula real; no consume alimento por su cuenta.

El giro proyecta grosor y yaw continuo, con superficies de ambos lados, una superficie frontal de cabeza pintada y retraso entre cabeza, tronco y cola. La vista frontal se mezcla por orientación y se deforma con el mismo rig; no es una secuencia de fotogramas. No cambia bruscamente el signo de la escala del sprite. Es una transición lateral 2.5D, no una reconstrucción tridimensional anatómica.

## Diferencias que permite evaluar

- Actual: volumen geométrico facetado y color plano por caras; la anatomía y patrón son procedurales.
- Ilustrado: escamas, gradientes, ojo, bordes y radios pintados; cola/aletas con textura y transparencia, sobre mallas deformables.
- Ambos: misma trayectoria, velocidad, inercia de desplazamiento, comportamiento, tamaño y condiciones de agua. La mejora propuesta corresponde al aspecto y a la respuesta visual de las articulaciones.

La revisión visual final muestra más detalle en escamas/ojos y bordes de aletas, sin cortes abiertos en las tres uniones del torso en las escenas revisadas. Se ajustó el solapamiento de la caudal con el pedúnculo al observarla a 8×. De frente el dibujo todavía es una aproximación; el apoyo frontal reduce el efecto de lámina, sin convertir las membranas en volúmenes cerrados.

## Límites

Un solo macho y una sola coloración; no hay atlas diferente de la cara opuesta. Durante el giro se aproxima el volumen con superficies bilaterales y el apoyo frontal de cabeza: el resto del cuerpo/aletas no constituye una malla 3D cerrada. Las membranas se ven delgadas de canto y la transición frontal aún admite pulido artístico. La luz de la ilustración está horneada; de noche recibe el tinte del acuario, sin reluminación por normales.

La física de aletas no resuelve presión, colisión entre cada membrana y objetos ni flujo 3D. Tampoco se modifica la colisión corporal existente. La relación esfuerzo/propulsión es una representación del motor actual, no una validación biomecánica de un betta real.

El atlas aporta detalle al acercar, pero a tamaño juvenil pequeño parte de ese detalle se pierde por resolución de pantalla. Se utilizan 14 mallas (hasta 1.552 vértices por ejemplar, más los detalles de radios/guías), sin filtros pesados ni bibliotecas nuevas. La emulación móvil y las pruebas a diferentes pasos no sustituyen mediciones en teléfonos físicos.

## Validación final

Se ejecutó la validación después de completar la implementación. `npm test`: 269 pruebas pasadas en 23 archivos, incluidas nueve nuevas para la pose y la sesión compartida. `npm run typecheck` y `npm run build` correctos; la simulación sigue compilando sin DOM. Se comprobaron estabilidad a pasos de 15/30/60/120 FPS, límites/raíces de resortes, suavidad de giro y uniones, reposo, picoteo por proximidad, lectura sin mutaciones y reproducibilidad de física/química.

Chromium: siete escenas de movimiento, zoom 1×–8×, pausa, guías, pasos de animación configurables, presentación móvil horizontal 844×390, selector reversible dentro del acuario y conservación de la misma instancia del guppy al cambiar el betta. La entrada aislada no crea bases de datos. Cierre/reapertura repetidos sin errores JavaScript. Se corrigió la limpieza del segundo renderer para liberar sus recursos propios sin vaciar los pools globales de Pixi que sigue usando el acuario.

Producción: el juego abre normalmente incluso con `?betta-lab`; no aparecen controles de laboratorio. El atlas y los módulos experimentales no se emiten en dist. Verificación de diff: CodeBetta, BettaDynamics, FishMotion y src/sim no tienen cambios.

Capturas, registro de navegador y video en `/workspace/artifacts/betta-ilustrado/`. No se midió rendimiento en teléfonos físicos. Los pasos configurables no afirman la tasa real de refresco del dispositivo.
