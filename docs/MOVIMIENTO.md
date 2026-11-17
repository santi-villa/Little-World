# Prototipo de betta con peso

El juego activa `MotionInput.bettaPrototype: true` en FishLayer. Sin esa opción, FishMotion conserva el contrato anterior para consumidores existentes y comparaciones del motor. Solo el betta del juego utiliza `BettaDynamics`; las demás especies mantienen sus rutas anteriores. Las unidades son cm y segundos, convertidas a coordenadas de arte por FishLayer como antes. `src/sim` no cambia. Flotación, aire, flare y picoteo son visuales y no sustituyen cuidados ni consumo real de alimento.

`src/data/motion-betta.json` centraliza masa, arrastre cuadrático, amortiguación exponencial del planeo, velocidad angular, fuerza, duraciones y proporciones. La velocidad de crucero se expresa en largos del cuerpo por segundo (longitud física × bodyFraction). La ráfaga de sobresalto dura burstSeconds y admite burstLengthsS; luego pierde velocidad gradualmente. Flotar no agrega gravedad ni fuerza ascendente. El balanceo es una pose pequeña alrededor del centro físico, no velocidad acumulada.

El rumbo gira hasta maxTurnDegS. pitchMaxDeg limita la inclinación física a 25°; foodPitchDeg permite una pose de 45° al comer. Las paredes generan repulsión a wallLengths y los núcleos elípticos del hábitat repelen/limitan penetraciones. El recorte final es una salvaguarda, no colisión física exacta por rama.

Los estados son wander, investigate, breathe, food, startle, sleep y flare. Respiración se agenda cada 120–240 segundos de tiempo visual activo, sin catch-up nocturno ni consumo de oxígeno químico. `FishMotion.flareBetta(id)` expone el hook para un futuro espejo; no hay detección ficticia de espejo en la escena actual. Dormir sigue la intención nocturna ya emitida por la simulación.

El sprite nativo de 52 px se obtiene mediante nearest desde el PNG existente y el pipeline reproduce esa variante con articulatedWidth. Tres recortes de la misma textura se encadenan por articulaciones rígidas; la cabeza lidera y la cola tiene retardo y resorte amortiguado. La posición se redondea y la escala estable es entera. Durante el giro hay compresión horizontal antes del espejado; no hay mesh ni shader. Esa compresión transitoria y la rotación no garantizan una grilla de pantalla perfecta en cada cuadro. A tamaño pequeño, redondear puede ocultar parte del balanceo subpíxel.

El PNG no separa las aletas del cuerpo. Se necesita arte en capas, con pivotes y zonas ocultas dibujadas, para pectorales, dorsales, anal y opérculos independientes. El resorte actual de la cola es el sustituto provisional. Las plantas reciben un impulso al entrar en cercanía; el sistema de resortes existente produce el retorno amortiguado.

En desarrollo: D o mantener dos segundos la esquina superior izquierda. El panel muestra estado, velocidad, rumbo y objetivo; los vectores muestran fuerza y destino con longitud acotada. Sliders modifican los parámetros en memoria; Copiar JSON exporta el objeto para pegarlo en el archivo. Producción elimina el import dinámico y no crea listeners ni panel. No se guardan esos ajustes automáticamente.

Para extenderlo: separar parámetros y estrategia por especie conservando la misma interfaz de cuerpo/entrada; cardumen aporta objetivos de cohesión/alineación, especies de fondo aportan contacto con sustrato y velocidades bajas. No aplicar el perfil del betta globalmente. Primero revisar visualmente dimensiones, cortes, tiempos y retorno de plantas; esta entrega no ejecutó tests ni tomó capturas por instrucción del usuario.

La opción explícita conserva las comprobaciones del motor anterior sin cambiar sus expectativas ni desactivar el paso Tests de CI. Esas comprobaciones no validan la nueva física optativa: sigue pendiente revisarla por separado, respetando la instrucción de no escribir ni ejecutar tests en esta entrega.

## Render activo: regreso al pez procedural

Por preferencia del usuario, el betta activo vuelve a CodeBetta: geometría con volumen y aletas articuladas, sin texturas PNG. La pose recibe fase de coletazo, pitch, balanceo, esfuerzo y flare de BettaDynamics. La cola conserva resorte de retardo; el planeo reduce la flexión y las pectorales siguen aleteando al flotar. Las otras especies mantienen el render previo. ArticulatedBetta y su variante PNG quedan como experimento fuera de la ruta activa del juego. Esta decisión sustituye la sección anterior sobre recortes del sprite como render principal.
