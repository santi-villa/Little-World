# Corrientes, alimento y observación del acuario

## Estado actual

Se reutilizan FishMotion, BettaDynamics, la química y necesidades existentes, peces procedurales y plantas PNG con mallas y resortes. La corriente común se configura en `src/data/ecosystem.json`; los alimentos, en `src/data/food-types.json`.

### Comida y guardado v4

Cada paquete de alimento tiene ID, tipo, gramos, capa, posición normalizada x/y/z, velocidad en cm/s, orientación, edad y tiempos de hundimiento. IndexedDB conserva estos campos, incluido el objeto sobre el que descansa. El formato v4 acepta partidas v1–v3; al abrir, primero recupera el tiempo ausente y después convierte los pools antiguos en paquetes. Rechaza IDs repetidos, cantidades incompatibles y coordenadas inválidas. Clonar el estado también copia los paquetes.

La mano permite elegir pellets, escamas, pastillas de fondo o alimento vivo, con flotación, hundimiento, tamaño, arrastre y color propios. El alimento vivo recibe una pequeña propulsión visual: no es un animal criado ni un cultivo. Se conserva el balance nutricional del juego para todos los tipos.

La simulación es la autoridad sobre la masa. En vivo se acumulan IDs alcanzados por cada animal, con distancia que incluye profundidad. Las mordidas descuentan gramos del paquete concreto y reducen el hambre con el modelo existente. Varias bocas reparten la disponibilidad sin duplicar masa. El render no inventa consumo. Descomposición, sifonado/cambio de agua y fuentes orgánicas se reconcilian con el mismo registro. Fuera de línea o al acelerar se usa acceso por especie/capa, porque no hay trayectorias renderizadas; no se pretende una simulación espacial offline exacta.

El registro admite hasta 512 paquetes. Al saturarlo, combina dos del mismo tipo/capa para liberar un lugar y conserva la masa, aunque pierde la identidad de uno. Son paquetes medibles de comida, no cada fragmento microscópico. Se simulan todos; se dibuja una muestra determinista limitada a 96 (48 en pantallas pequeñas). La persistencia corresponde al último guardado confirmado, no a cada fotograma.

### Colisiones y profundidad

Rocas y maderas generan una máscara de alfa de hasta 64×64 a partir del arte existente, con agujeros transparentes y un espesor asignado. Un barrido entre posiciones evita saltarse ramas finas; el alimento puede apoyarse arriba y caer si se retira/cambia el objeto. Si la lectura del PNG no está disponible se usa una silueta elíptica. El contorno es aproximado y de resolución limitada.

Los peces buscan el alimento en profundidad y los obstáculos centrales solo los apartan dentro de su espesor. Se conservan aproximaciones elípticas para sus cuerpos y para paredes redondas; esto no es colisión de mallas 3D ni de cada aleta contra cada hoja. La profundidad es 2.5D.

### Agua, plantas y animales

WaterFlow consulta un campo analítico en cm/s, ajustado por caudal efectivo, volumen, forma y obstáculos. Peces, plantas, comida, microburbujas y sedimento comparten el mismo campo, que pulsa suavemente. Sin filtro cesa la circulación. Las mallas de los PNG reciben la corriente en dos alturas, conservan las raíces bajo las máscaras de arena y sienten una estela breve según la altura y profundidad del pez.

Las motas tienen vidas y tamaños variados y aparecen en dos planos. El conjunto acotado reutiliza las partículas con fundidos escalonados. El sedimento puede asentarse y levantarse cerca de una corydora que se alimenta. Las burbujas salen por tandas desde la boquilla sumergida del filtro, suben con velocidades variables y generan una ondulación breve al llegar a la superficie. Estos efectos son visuales y no se guardan.

El agua combina dos gradientes de PixiJS en función de la luz. La superficie y la proyección sobre el mueble usan la misma fase de onda. Las cáusticas usan trazos de luz animados, recortados por los perfiles de arena y por las siluetas alfa que usa el hábitat para rocas y maderas. Son aproximaciones visuales en 2.5D.

El modelo procedural añade pelvis y aletas pareadas, radios largos en peces altos, barbillones/boca en peces de fondo, ondulación corporal en kuhli y apertura de opérculos del betta al desplegar. Se mantienen los 23 perfiles, crecimiento, enfermedad, muerte y giros con volumen. No se reemplazan los peces activos por imágenes.

La ficha del betta permite acercar un espejo visible durante ocho segundos; se retira solo. El pez considera su posición, profundidad, cercanía y estado antes de investigar/desplegar aletas. Dormido, asustado o enfermo no se fuerza esa respuesta. No hay un reflejo permanente ni una segunda simulación de estrés añadida.

Rueda y pinza, encuadre completo inicial, seguimiento individual, ficha y selector de animal, modo Contemplar y herramientas manuales se conservan.

### Ambiente continuo

El ambiente reutiliza el reloj configurable de la simulación (incluida la fracción entre pasos). Amanecer y atardecer usan las horas solares de Buenos Aires y el clima exterior disponible. [ambient-aquarium.json](../src/data/ambient-aquarium.json) reúne la opción de usar horarios solares o fijos, la duración de las transiciones, los colores, la intensidad del agua y el ritmo nocturno de cada grupo. La opción Hora del panel DEBUG permite comparar la iluminación sin alterar el fotoperíodo ni la hora del guardado.

La ventana, el agua y las luces localizadas sobre la pared y el mueble se actualizan desde la misma muestra ambiental. El efecto de la lámpara del acuario sigue su programación de cuidado. El ritmo nocturno modula la exploración y las pausas conservando la prioridad de alimentación, respiración y sobresalto. Las animaciones se pausan al ocultar la pestaña y se retoman desde el último fotograma, con la recuperación de la simulación existente.

Se reutilizaron las ilustraciones, mallas de plantas, equipos, máscaras de arena y luces de la habitación. Los nuevos efectos se dibujan con PixiJS y no requieren imágenes ni dependencias adicionales.

La validación del ambiente y agua se ejecutó con las tres fases integradas. Pasaron 68 pruebas dirigidas de corrientes, partículas, plantas, reloj, meteorología, nado y alimentación. La compilación de producción incluyó el chequeo de tipos. En Chromium se verificaron los cambios de iluminación, el zoom, la pausa y reanudación al ocultar la pestaña, la apertura y cierre de tapa y la alimentación. Se reprodujo el recorrido con un viewport móvil emulado. Las capturas se tomaron con clima de Buenos Aires controlado para que las comparaciones sean reproducibles.

## Límites pendientes

- CFD/turbulencia volumétrica, iluminación física y colisiones completas de mallas 3D.
- Anatomía y materiales con fidelidad biológica/artística completa; revisión manual del arte PNG para unificar paleta, luz y grilla (ver ART-DIRECTION.md).
- Crecimiento y química vegetal, colocación libre de decoración y cultivo de alimento vivo: no forman parte de la física visual incorporada.
- Sonido ambiental definitivo: falta la pista del usuario.
- Mediciones en teléfonos físicos y observación durante horas de todas las especies. La emulación permite revisar controles y límites, no afirmar rendimiento real en esos equipos.

## Validación de esta ampliación

La implementación se completó antes de ejecutar pruebas. La ronda final pasó 260 pruebas en 22 archivos, incluidas nueve comprobaciones nuevas de consumo por ID y reparto entre peces, conservación de masa, compatibilidad v3/v4, posiciones y copia profunda, validación de datos corruptos, límite de paquetes, alimentos distintos, aspirado/descomposición, avance sin render, contornos/huecos/profundidad, apoyo y retiro de roca, sedimento y respuesta condicional al espejo. Compilación con typecheck y generación PWA correctas.

El recorrido en Chromium comprobó inicio en habitación completa, peces procedurales, espejo temporal, selector de alimento de la mano, comida, guardado v4 y recarga conservando el registro completo, rueda y regreso al encuadre, selector visible en 667×375 y pinza táctil por CDP. No se observaron errores JavaScript. El primer intento del selector móvil necesitaba esperar el siguiente fotograma de UI; se corrigió esa espera en el recorrido y pasó sin cambiar la interfaz. Capturas y video en `/workspace/artifacts/ecosistema-completo`.

La revisión final también ajustó la invalidación del hábitat al cambiar el nivel del agua para mantener los contornos relativos a la superficie. No se midió hardware móvil físico ni se observó todo el catálogo durante horas.

## Comparación de betta ilustrado

La rama experimental agrega un render optativo de desarrollo para el betta y un laboratorio aislado. No modifica la química, FoodGrain, BettaDynamics, FishMotion ni el render de otras especies. La animación lee corriente y partículas reales; no introduce otro consumo ni otro comportamiento. Recursos y limitaciones en [BETTA-ILUSTRADO.md](BETTA-ILUSTRADO.md).

## Prototipo de carcasa híbrida

`experiment/pecera-hibrida` agrega una presentación exterior en desarrollo, sin modificar corrientes, mallas de plantas, peces, alimentación ni química. El único TankView se proyecta sobre el frente y vuelve a identidad al acercarse; no hay un segundo acuario ni un render texture actualizado a otro ritmo. Detalles en [PECERA-HIBRIDA.md](PECERA-HIBRIDA.md).
