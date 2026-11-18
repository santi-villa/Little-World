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

WaterFlow consulta un campo analítico en cm/s, ajustado por caudal efectivo, volumen, forma y obstáculos. Peces, plantas, comida, microburbujas y sedimento comparten ese campo. Sin filtro no hay recirculación generada. Las plantas mantienen raíz fija, perfiles propios y amortiguación, con impulsos locales al paso de peces.

Las motas ahora conservan posiciones/velocidades durante la sesión, se asientan y reciben impulsos locales de corydoras que comen cerca. No reaparecen arriba en un bucle. El presupuesto deriva de la suciedad; no constituye un segundo balance químico. Sus coordenadas no se guardan: son una representación ambiental, a diferencia del alimento. Burbujas con presupuesto fijo, emisión por caudal y eliminación en superficie.

Rayos y cáusticas del sustrato comparten pendientes de ondas superficiales y concentración de rayos aproximada. No son iluminación física, trazado de fotones ni CFD. Se conservan los colores del acuario y la luz apagada reduce efectos.

El modelo procedural añade pelvis y aletas pareadas, radios largos en peces altos, barbillones/boca en peces de fondo, ondulación corporal en kuhli y apertura de opérculos del betta al desplegar. Se mantienen los 23 perfiles, crecimiento, enfermedad, muerte y giros con volumen. No se reemplazan los peces activos por imágenes.

La ficha del betta permite acercar un espejo visible durante ocho segundos; se retira solo. El pez considera su posición, profundidad, cercanía y estado antes de investigar/desplegar aletas. Dormido, asustado o enfermo no se fuerza esa respuesta. No hay un reflejo permanente ni una segunda simulación de estrés añadida.

Rueda y pinza, encuadre completo inicial, seguimiento individual, ficha y selector de animal, modo Contemplar y herramientas manuales se conservan.

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
