# Corrientes y observación del acuario

La implementación amplía el juego existente. Reutiliza el catálogo de especies, FishMotion/boids, BettaDynamics, hábitat elíptico, plantas PNG con malla y resortes, peces procedurales, cámara, necesidades y alimentación química. `src/data/ecosystem.json` centraliza perfiles vegetales, grupos de movimiento, corriente, cámara y presupuestos de partículas.

## Sistemas conectados

- WaterFlow consulta velocidad en cm/s mediante un campo analítico de recirculación, ajustado por caudal efectivo, volumen, tamaño, forma y atenuación cerca de obstáculos. Sin filtro efectivo no hay circulación generada. Peces, plantas, comida, burbujas y motas consultan el mismo campo. No es CFD ni modela presión o turbulencia 3D.
- PlantMotion conserva raíces fijas y usa perfiles para anubias, vallisneria, helecho, musgo, ludwigia y cryptocoryne. La corriente inclina de manera sostenida y el ruido ambiental es mínimo. Las perturbaciones locales y los impulsos limitados retornan mediante amortiguación.
- FoodParticles mantiene identificador, posición, velocidad, tamaño, masa relativa, flotabilidad, arrastre, fase, edad y orientación. Conserva las trayectorias durante cada sesión, asienta al llegar al fondo y no utiliza una animación cíclica de caída. Su presupuesto es 96 representantes (48 en pantalla pequeña). Cada representante lleva gramos y los totales se reconcilian con superficie, columna y fondo de la química. No agrega ni consume alimento por sí mismo.
- La fase física y la capa química son distintas: un representante puede asentarse antes de que la química transfiera sus gramos al fondo. No vuelve arriba; su capa de acceso conserva el modelo químico hasta la transferencia real. Las reducciones de cantidad se reflejan en pesos o retiro de representantes. Se etiqueta consumo cuando coincide con disminución real de hambre y contacto; sin esa evidencia, el retiro no presume una causa.
- El motor de movimiento busca los representantes accesibles. En vivo, Game acumula contactos por animal/capa entre pasos y los entrega como entrada opcional a la simulación. Solo esas capas permiten comer. La simulación determina cantidades y hambre. En saltos manuales y catch-up se conserva el acceso por especie, sin depender de posiciones del render. No se agregan campos al guardado ni RNG del navegador a src/sim.
- BubbleParticles emite únicamente con caudal efectivo, limita presupuesto y elimina burbujas en la superficie. Variaciones deterministas de tamaño y ascenso, corriente lateral y radio pequeño. Las luces, motas y estela de corydoras se reducen y condicionan a residuos/comportamiento.
- La rueda hace zoom continuo anclado al cursor. Dos dedos hacen zoom con pinza; los controles se mantienen dentro de la habitación. El scroll de paneles no llega al canvas. Acuario o tecla 0 recuperan el encuadre.
- Un clic con mano/lupa sigue al pez y abre su ficha. Las herramientas conservan sus acciones. El selector dentro de la ficha cambia de individuo sin cerrar el cuaderno.
- Los perfiles de grupos diferencian crucero, aceleración, tiempo de objetivos y respuesta a corriente. Se mantienen cardumen, compatibilidad, estrés, enfermedad, muerte, profundidad y crecimiento. El betta conserva su perfil propio y atiende persecución/cortejo, curiosidad, refugio y respiración. Los opérculos y el picoteo tienen movimientos pequeños en el modelo procedural.

## Límites y tareas posteriores

Las partículas son representantes de pools químicos, no granos químicos individuales: no hay correspondencia uno a uno entre una boca y un grano, ni trazabilidad exacta entre consumo y descomposición. No se persisten sus coordenadas; al abrir se reconstruyen desde cantidades guardadas, con posiciones de fondo estables dentro de esa nueva sesión. Persistir trayectorias requeriría versionar estado visual y reconciliarlo con el catch-up.

No se implementa colisión de cada grano con cada rama/roca: el contacto físico principal es el sustrato. El campo atenúa obstáculos, pero no resuelve remolinos detrás de geometría detallada. Las paredes redondas usan una elipse aproximada. La profundidad sigue siendo 2.5D; no hay colisiones tridimensionales completas.

Los perfiles de alimentos distintos (escamas, pellets, alimento vivo) requieren distinguir el tipo de alimento en la simulación: hoy existe un perfil genérico con variaciones de masa.

Las motas suspendidas siguen siendo una representación analítica económica influida por el campo, no sedimento granular persistente. Los reflejos y rayos son aproximaciones gráficas, sin iluminación física ni cáusticas calculadas. Las anatomías específicas más detalladas y aletas adicionales siguen pendientes. El espejo real/flare necesita un objeto válido de la escena; no se inventa un estímulo permanente.

Se prioriza integración coherente y presupuestos acotados. No se mide rendimiento en teléfonos físicos con esta entrega; deben evaluarse cardúmenes grandes y cambios prolongados de calidad de agua. Los resultados de validación final se registran después de completar la implementación.

## Archivos principales de esta entrega

Nuevos:
- `src/data/ecosystem.json`: parámetros compartidos y perfiles.
- `src/render/motion/water-flow.ts`: campo de circulación y límite redondo.
- `src/render/motion/food-particles.ts`: representantes físicos de comida.
- `src/render/motion/bubble-particles.ts`: microburbujas por emisor.
- `tests/ecosystem.test.ts`: invariantes físicas, conservación, alimentación y cámara.

Modificados:
- `src/render/motion/plant-motion.ts`, `fish-motion.ts`, `betta-dynamics.ts`: perfiles, corrientes, objetivos alimenticios e interacciones.
- `src/render/tank/fish-layer.ts`, `tank-view.ts`, `code-betta.ts`: integración y dibujo, partículas, reducción de movimiento/velo y animación fina.
- `src/render/camera.ts`, `src/render/scene/room-scene.ts`, `src/main.ts`: rueda, pinza, selección directa y contactos en vivo.
- `src/render/ui/aquarium-panel.ts`, `src/data/texts.es.json`: selector de individuo dentro de la ficha.
- `src/game.ts`, `src/sim/environment.ts`, `feeding.ts`, `step.ts`: entrada opcional de contacto sin duplicar química.
- `DESIGN.md`, `PENDIENTE.md`: decisiones actuales y pendientes.

## Validación final

La implementación prevista se completó antes del primer test. La suite completa pasó 248 pruebas en 21 archivos; al agregar las comprobaciones específicas de contacto químico y relleno, el archivo de ecosistema pasó sus 9 pruebas finales. `npm run typecheck` y `npm run build` completaron correctamente, incluida la PWA.

Chromium: rueda y recuperación de encuadre; un clic abre ficha; cambio de individuo dentro de la ficha; scroll del cuaderno sin mover cámara; comida con tapa abierta sin abrir fichas; presentación de escritorio y celular horizontal; pinza mediante eventos táctiles; sin errores JavaScript observados. Se revisaron capturas de día y noche y se guardó un video en `/workspace/artifacts/ecosistema/recorrido.mp4`. Estas comprobaciones no equivalen a pruebas en hardware móvil físico ni a validar todos los comportamientos del catálogo durante varias horas.

También se comprobó la apertura directa de la ficha al tocar un pez desde el encuadre de habitación. Se retiraron parámetros antiguos de tamaño de comida/burbujas que habían quedado sin uso en aquarium-visual.json, para evitar dos configuraciones contradictorias.
