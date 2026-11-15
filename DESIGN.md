# DESIGN.md — Little World

> Documento de diseño del juego. Es la fuente de verdad para cualquier sesión de desarrollo (incluida Claude Code).
> Antes de programar algo nuevo, leer la sección correspondiente. Si una decisión cambia, se actualiza este archivo en el mismo commit.

---

## 1. Visión

Un juego **tranquilo, cozy y realista** sobre tener acuarios en casa. No hay apuro, ni minijuegos, ni decisiones dramáticas: cuidás tus peces, mirás cómo viven y aprendés acuarismo de verdad.

La meta personal detrás del juego: **aprender a mantener un acuario real** antes de tener uno. Todo lo que el juego enseña tiene que servir en la vida real.

### Pilares

1. **Realista**: la química del agua, los peces y los cuidados funcionan como en la realidad (simplificado, nunca inventado).
2. **Vivo**: todo se mueve, todo reacciona. Peces, gato, plantas, clima, luz. Nada es una imagen estática.
3. **Tranquilo**: sin presión. Los problemas avisan con tiempo y siempre hay forma de arreglarlos.
4. **Tiempo real**: el juego sigue viviendo aunque no lo abras, y el clima de la ventana es el clima real de donde estás.
5. **Educativo sin sermones**: cuando algo pasa, el juego explica *por qué* pasó (diario del acuarista).
6. **Crecer de a poco**: empezás con una pecera chica y un pez, y vas armando tu casa de acuarios.

### Lo que NO es

- No es un juego de decisiones, combate ni minijuegos.
- No es un juego de clicks ni de "farmear" monedas.
- No castiga con muertes sorpresivas: todo problema se puede ver venir.

---

## 2. Dirección de arte

### Estilo: 2.5D pixel art

Se ve 3D, pero es 2D: **pixel art detallado dibujado en perspectiva**, con capas, luces y profundidad simulada. Hay dos imágenes de referencia en `docs/referencias/`:
- `dormitorio-noche-lluvia.jpg`
- `living-lluvia.jpg`

Qué muestran:
- Dormitorio de noche con lluvia, pecera rectangular sobre un escritorio, gato durmiendo y lámpara cálida.
- Living con lluvia, pecera plantada grande sobre un mueble, sillón y lámpara de pie.

Claves visuales:
- Ambientes cálidos y acogedores, con iluminación suave (lámparas ámbar, luz de ventana según el clima).
- Paleta: turquesa del agua, ámbar de las lámparas, verdes de las plantas y madera cálida.
- El acuario es el foco: rayos de luz en el agua, burbujas y reflejos (caustics) en el fondo.

### Resolución y capas

- **Resolución base: 640×360** (16:9), escalada en múltiplos enteros (×2, ×3) para mantener el pixel perfecto.
- Orientación: **horizontal**, pensado primero para celular.
- Cada escena se arma con capas (de atrás hacia adelante):
  1. Fondo de la habitación (paredes, ventana, cielo detrás de la ventana)
  2. Clima exterior (lluvia, nubes, sol, rayos, pájaros)
  3. Muebles y objetos traseros
  4. Interior de la pecera: fondo → plantas traseras → peces lejanos → decoración → peces cercanos → plantas delanteras
  5. Agua: tinte, rayos de luz, partículas, superficie
  6. Vidrio: capa de algas (máscara), marcas, reflejos
  7. Objetos delanteros, gato y personajes
  8. Iluminación global (oscuridad de noche y brillos de lámparas con blend aditivo)
  9. UI

### Profundidad dentro de la pecera

- 3 planos de profundidad: lejos, medio y cerca.
- Los peces del plano lejano se ven un poco más chicos, más azulados y con menos contraste.
- Los peces cambian de plano suavemente, así parece que nadan en 3D.

### Sprites

- Peces de perfil, de 4 a 8 frames para nadar, más frames de giro, de comer y de reposo.
- Variaciones de color por individuo (guppys, platys y gambas sobre todo).
- **De noche los colores cambian** (por ejemplo, los neones se apagan mientras duermen, como en la realidad).
- Pipeline de arte: imágenes generadas por IA → limpieza a pixel art → paleta fija → spritesheets.

---

## 3. Stack técnico

| Parte | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript | Tipado: la simulación tiene muchos números |
| Render | PixiJS v8 | 2D rápido, shaders, partículas, blend modes |
| Build | Vite | Rápido y simple |
| PWA | vite-plugin-pwa | Instalable en el celular y funciona offline |
| Guardado | IndexedDB (idb-keyval) | Persistente en el dispositivo |
| Tests | Vitest | Para testear la simulación sin gráficos |
| Deploy | GitHub Actions → GitHub Pages | Cada push publica la versión nueva |
| Clima | Open-Meteo API | Gratis, sin API key |

Posible migración futura a Godot 4 si se quiere publicar en Play Store con notificaciones nativas. La simulación tiene que ser **portable**: lógica pura y datos en JSON.

### Estructura de carpetas

```
/src
  main.ts           arranque: Pixi, carga de la partida, bucle principal
  game.ts           une la simulación con el reloj real (el único que lo conoce)
  /sim          ← simulación pura (SIN imports de Pixi ni del DOM)
    index.ts        API pública: step, applyAction, createNewTank, derive
    step.ts         step(state, deltaMinutes) -> { state, events }
    actions.ts      acciones del jugador: applyAction(state, action)
    state.ts        creación de una pecera nueva
    types.ts        forma del estado, eventos y acciones
    config.ts       carga tipada de los JSON de /data
    chemistry.ts    fórmulas puras (NH3 libre, saturación de O2, pH)
    derive.ts       valores derivados del estado (NH3 libre, oxígeno 0–1, caudal)
    clock.ts        tiempo: hora del día y pasos fijos (el catch-up offline llega en la Fase 3)
    water.ts        química del agua: residuos, gases, cloro, evaporación, pH/KH
    bacteria.ts     ciclo del nitrógeno
    thermal.ts      temperatura de la habitación y la pecera
    algae.ts
    events.ts       alertas (y, más adelante, entradas del diario)
    rng.ts          RNG con semilla (determinista)
    fish.ts         (futuro) necesidades, estrés, salud, edad
    behavior.ts     (futuro) decisiones de comportamiento
    compat.ts       (futuro) compatibilidad entre especies
    plants.ts       (futuro)
    cat.ts          (futuro) necesidades del gato
    economy.ts      (futuro)
  /render       ← todo lo visual
    viewport.ts     escalado entero pixel perfect
    scene/          habitaciones y capas
    tank/           agua, vidrio, algas, peces, plantas
    fx/             (futuro) partículas, shaders, iluminación
    ui/             HUD, fuente de píxeles, textos, panel de debug
  /world        ← (futuro) clima real y geolocalización
  /audio        ← (futuro)
  /data         ← JSON: sim-config, tanks, texts.es (y después species, plants, rooms, items, decor)
  /save         ← formato con versión + IndexedDB
/docs
  /referencias
/tests
```

### Regla de oro de la arquitectura

**La simulación no sabe que existe el render.** `src/sim` recibe un estado y un `deltaMinutes`, y devuelve un estado nuevo más una lista de eventos. El render solo lee el estado y lo dibuja; el comportamiento visual (movimiento fino de los peces, animaciones) vive en `render/`, pero las *decisiones* (tengo hambre, tengo miedo, quiero esconderme) vienen de `sim/`.

Esto permite:
- Simular días enteros offline sin dibujar nada.
- Testear la química del agua con tests unitarios.
- Portar la lógica a otro motor si hace falta.

---

## 4. Tiempo

### Tiempo real 1:1

- El juego usa la **hora real del dispositivo**. Un día en el juego es un día real.
- El reloj de la simulación (`timeMinutes`) arranca en la hora local del dispositivo al crear la pecera.
- El panel de debug permite acelerar el tiempo (1 min, 1 hora o 1 día por segundo) y saltar 1 hora, 1 día o 1 semana. Es solo para probar: la velocidad normal es 1:1.
- El ciclo día/noche usa la **salida y puesta del sol reales** de tu ubicación.

### Catch-up offline

1. Al cerrar o pasar a segundo plano, se guarda `lastTimestamp` y el estado completo.
2. Al abrir: `elapsed = now - lastTimestamp`.
3. Se simula en pasos fijos:
   - Hasta 7 días: pasos de 1 minuto.
   - De 7 a 30 días: pasos de 10 minutos.
   - Más de 30 días: tope en 30 días (se avisa en el diario).
4. Para la temperatura exterior durante la ausencia se usa el **histórico horario de Open-Meteo** (`past_days`), así el invierno o el calor que hubo realmente afecta la pecera.
5. El RNG tiene semilla: la misma ausencia da siempre el mismo resultado (no se puede "rerollear" cerrando y abriendo).
6. Al volver se muestra un **resumen de bienvenida** con lo que pasó: crías nacidas, parámetros que cambiaron, algas, el gato hizo algo, etc.

Estado: la regla de los pasos fijos ya está en `sim/clock.ts` (`planSteps`) y `step()` la usa. El catch-up en sí (simular lo que pasó con el juego cerrado) llega en la Fase 3: por ahora, al volver, la pecera sigue desde donde quedó.

### Realismo de la ausencia

- Un pez sano aguanta de 3 a 5 días sin comer sin problemas (tropicales adultos).
- Se desbloquea el **alimentador automático** (existe en la vida real) para ausencias largas.
- Se desbloquea el **temporizador de luz** (enchufe programable), así la luz no queda prendida 24 h.

### Notificaciones

- Versión web: recordatorios al volver y notificaciones del service worker cuando sea posible.
- Ejemplos: "Tus peces no comen desde ayer", "Toca cambio de agua", "¡Nacieron crías de guppy!".
- Nunca más de 2 por día. Se pueden desactivar.

---

## 5. Clima real

### Fuente

Open-Meteo, endpoint de pronóstico:
- `current`: `temperature_2m`, `weather_code`, `is_day`, `cloud_cover`, `precipitation`, `wind_speed_10m`
- `daily`: `sunrise`, `sunset`
- `hourly` con `past_days` para el catch-up offline

Ubicación: pedir permiso de geolocalización. Si se niega, elegir ciudad a mano. Se guarda localmente y se refresca cada 30 minutos. Sin internet: se usa el último clima conocido.

### Efectos visuales

| Clima | Ventana | Ambiente |
|---|---|---|
| Despejado de día | Cielo azul y pájaros ocasionales | Rayos de sol que entran según la hora |
| Nublado | Nubes que se mueven | Luz más gris y suave |
| Lluvia | Lluvia con intensidad real y gotas que corren por el vidrio | Sonido de lluvia |
| Tormenta | Rayos y truenos | Flash de luz en la habitación |
| Noche | Cielo oscuro, luces lejanas y estrellas si está despejado | Las lámparas cobran protagonismo |
| Viento | Árboles que se mueven | La cortina se mueve si la ventana está abierta |

Los colores del cielo cambian al amanecer y al atardecer reales.

### Efectos en la simulación

- **Temperatura de la habitación**: sigue a la exterior con inercia (la casa amortigua).
  - `T_hab` tiende a `T_confort (20–22 °C) + k * (T_ext - T_confort)`, con `k ≈ 0.3` y ventana cerrada.
  - Con la ventana abierta, `k ≈ 0.7`.
  - La inercia es de unas 4 horas con la ventana cerrada y 1 hora con la ventana abierta.
  - Hasta que llegue el clima real (Fase 3), la temperatura exterior es **sintética**: una media ajustable + ciclo diario + un desvío aleatorio lento que sale del RNG con semilla.
- **Temperatura del agua**: tiende a `T_hab`. El calefactor la empuja hacia su setpoint según potencia/litros.
  - Modelo: el agua pierde calor por los vidrios, la superficie y la evaporación (pérdidas proporcionales a la superficie) y tiene la inercia de su volumen. Por eso los mismos watts sostienen más grados en una pecera chica que en una grande.
- **Luz solar directa** sobre la pecera (según ubicación, hora, nubes y cortina) → más algas y más temperatura.

---

## 6. Simulación del agua (el corazón)

Todas las constantes van en `src/data/sim-config.json` para poder ajustarlas. Unidades: ppm (mg/L), °C y litros. Paso base: 1 minuto.

### Variables por pecera

```
volume_L, waterLevel (0–1)        tank.waterLiters / tank.fullLiters
temp_C                            water.temperatureC
ammonia_total (NH3 + NH4+)        water.ammonia   ppm, como NH3
nitrite (NO2)                     water.nitrite   ppm
nitrate (NO3)                     water.nitrate   ppm
pH, KH, GH                        water.ph, water.kh (dKH), water.gh (dGH)
co2                               water.co2       mg/L (junto con el KH determina el pH)
oxygen                            water.oxygen    mg/L; derive().oxygenRelative lo da de 0 a 1
chlorine (0 si se usó acondicionador)
organicWaste                      organics.foodG (comida sin comer) + organics.detritusG (restos)
phosphate (simplificado, para algas)
tannins (color ámbar, por madera u hojas)   0–1; por ahora solo se diluye, todavía no hay fuentes
bacteria_AOB, bacteria_NOB        bacteria.filter y bacteria.surfaces, en mg de N por día
algae_glass, algae_decor (0–1)    algae.glass, algae.decor
```

Notas sobre las unidades:

- Las concentraciones se guardan en **ppm como las lee un test**: amoníaco total como NH3, nitrito como NO2⁻, nitrato como NO3⁻. Para las cuentas del ciclo se pasan a nitrógeno (1 mg de N de amoníaco → 1 mg de N de nitrito → 1 mg de N de nitrato).
- El **oxígeno** se guarda en mg/L (es lo que se conserva al mezclar agua y lo que cambia con la temperatura). El valor de 0 a 1 de la tabla de umbrales es relativo a la saturación del agua a 20 °C (≈9,1 mg/L): así el agua caliente, aunque esté saturada, queda por debajo de 1.
- La **población de bacterias** se mide por su capacidad máxima de oxidación (mg de N por día). Vive en dos lugares: el material filtrante (la mayor parte) y las superficies (sustrato, vidrios, decoración).
- La **carga biológica** (peces, en fases futuras) entra como mg de N de amoníaco por día. Hasta que haya peces se ajusta a mano desde el panel de debug.

### Ciclo del nitrógeno

```
Fuentes de amoníaco:
  peces:   Σ (masa_pez * tasaMetabólica(temp))
  comida:  organicWaste se descompone → amoníaco (más rápido con más temperatura)
  plantas muertas, peces muertos (no retirados)

AOB (bacterias): amoníaco → nitrito
  conversión = min(amoníaco, AOB * eficiencia)
  AOB crece si hay amoníaco disponible, hasta capacidad = superficie del filtro y sustrato
  AOB muere lentamente si no hay amoníaco (pecera vacía mucho tiempo)

NOB (bacterias): nitrito → nitrato
  igual que AOB, pero crece más lento (por eso el pico de nitrito llega después)

Nitrato:
  se acumula; solo baja con cambios de agua y plantas
```

Cómo está modelado:

- La conversión sigue una curva de saturación (Monod): con poco sustrato es proporcional a lo que hay, con mucho se topa con la capacidad de la colonia. Depende también de la temperatura, del pH (en agua ácida se frena) y del oxígeno.
- Una colonia **crece solo si le sobra comida** (saturación por encima de un nivel de mantenimiento) y, en equilibrio, puede procesar alrededor de 1,7 veces la carga habitual. Por eso un aumento chico de carga no se nota y uno grande provoca un pico.
- Si pasa hambre muere despacio (≈5% por día como máximo), y siempre queda un rastro del que puede volver a crecer.
- El NH3 libre frena a las NOB: es otra razón por la que el nitrito llega después.
- Nitrificar consume oxígeno y **KH** (≈0,4 dKH por cada mg/L de N). Sin KH la nitrificación se frena.
- El cloro mata bacterias en proporción a su concentración; con el filtro apagado, las del filtro se mueren en pocos días.
- La pecera se considera **ciclada** cuando lleva 48 h con amoníaco y nitrito por debajo de 0,2 ppm y con colonias suficientes; se pierde si el amoníaco pasa de 0,5 ppm o el nitrito de 1 ppm.

**Ciclado de una pecera nueva**: con fuente de amoníaco tarda de 3 a 6 semanas reales en estabilizarse. Si usás **material de filtro colonizado** (regalo del tutorial o de otra pecera tuya) arranca con bacterias.

### Toxicidad del amoníaco

La parte tóxica es el NH3 (amoníaco libre), que aumenta con el pH y la temperatura:
```
fracción_NH3 = 1 / (1 + 10^(pKa - pH)),  con pKa ≈ 0.09018 + 2729.92 / (temp_C + 273.15)
```
Por eso el mismo amoníaco es más peligroso en agua alcalina y caliente. El diario lo explica.

### Umbrales de referencia

| Parámetro | Ideal | Estrés | Peligro |
|---|---|---|---|
| Amoníaco (NH3 libre) | 0 | > 0.02 ppm | > 0.05 ppm |
| Nitrito | 0 | > 0.25 ppm | > 1 ppm |
| Nitrato | < 20 ppm | > 40 ppm | > 80 ppm |
| Oxígeno | > 0.8 | < 0.6 | < 0.4 |
| Cloro | 0 | > 0 | — (mata bacterias y daña branquias) |

La temperatura y el pH dependen de cada especie (ver catálogo).

La simulación emite un evento cuando se cruza cada umbral (y otro cuando se normaliza), con un margen del 10% para que no parpadee. Además avisa de: crash de pH (pH < 6), KH bajo (< 1 dKH), falta de agua (nivel < 0,85), filtro tapado y muchas algas en el vidrio.

### Otros procesos

- **pH**: baja lentamente con la acumulación de residuos orgánicos y nitrato. El KH lo amortigua (con KH bajo el pH puede caer de golpe, el "crash de pH"). La madera y las hojas de almendro lo bajan. La roca caliza lo sube.
  - Modelo: el pH no es una variable independiente; sale del KH y del CO2 disuelto (`pH = 7 + log10(3 · KH / CO2)`). Lo que acumula nitrato (la nitrificación) consume KH, y los residuos al pudrirse sueltan CO2. De día las algas consumen CO2 y el pH sube un poco.
- **Oxígeno**: baja con la temperatura (el agua caliente tiene menos oxígeno), con más peces y de noche con muchas plantas. Sube con aireador, filtro de cascada y movimiento en la superficie.
- **Evaporación**: el nivel baja (más rápido con calor y sin tapa). Los minerales se concentran. Se rellena con agua acondicionada. Si falta mucha agua el filtro pierde caudal. Evaporar también enfría el agua.
- **Residuos orgánicos**: la comida sin comer se pudre en pocos días (más rápido con calor); una parte pasa a detrito, que se descompone despacio. Pudrirse libera amoníaco, fosfato y CO2 y consume oxígeno.
- **Agua de la canilla**: tiene cloro o cloramina. Configurable por región: pH ~7.4, KH y GH moderados por defecto.
  - Por defecto (`tapWater` en `sim-config.json`): 18 °C, KH 4, GH 6, 1 ppm de cloro libre, sin nitrato. Por ahora se modela cloro libre (se va solo en horas), no cloramina.

### Cambio de agua

- Elegís el % (lo recomendable es 20–30% semanal).
- Diluye amoníaco, nitrito, nitrato, residuos y taninos en ese %. Sifonear el fondo saca el doble de residuos.
- Si el agua nueva tiene **otra temperatura** (más de 2 °C de diferencia), los peces se estresan.
- **Sin acondicionador** entra cloro: daña bacterias y estresa peces.
- Cambios muy grandes (más del 50%) de golpe → shock por cambio brusco de parámetros.

### Filtro

- Aloja la mayor parte de las bacterias.
- Se ensucia con el tiempo y el caudal baja.
- Limpieza correcta: **enjuagar en agua de la pecera** (la que sacaste en el cambio) → mantiene las bacterias.
- Limpieza incorrecta: **agua de la canilla** → mata del 70 al 90% de las bacterias → mini re-ciclado (pico de amoníaco).
- Cambiar todo el material de golpe: mismo efecto (se va la colonia entera del filtro).
- El porcentaje exacto que muere al lavarlo mal sale del RNG con semilla.

### Algas

- Crecen con: horas de luz (más de 8–10 h/día), luz solar directa, nitrato y fosfato altos, y pocas plantas.
- Bajan con: plantas que compiten por nutrientes, animales comealgas y limpieza manual.
- Modelo actual: crecen con las horas de luz, el nitrógeno (prefieren el amoníaco) y el fosfato; de día producen oxígeno y consumen CO2; las que mueren vuelven como detrito. El vidrio recibe más luz y se cubre antes que la decoración. Faltan el sol directo, las plantas que compiten y los comealgas.
- Tipos visuales (fase futura): película verde en el vidrio, puntos verdes, algas filamentosas y agua verde (si hay mucho sol).

---

## 7. Peces y animales

### Ficha de especie (data/species.json)

```json
{
  "id": "neon_tetra",
  "name": "Neón",
  "scientific": "Paracheirodon innesi",
  "temp": [20, 26],
  "ph": [6.0, 7.0],
  "adultSizeCm": 3.5,
  "bioload": 0.3,
  "minGroup": 6,
  "idealGroup": 10,
  "minTankL": 40,
  "zone": "middle",
  "temperament": "peaceful",
  "finNipper": false,
  "longFins": false,
  "predatorOf": [],
  "diet": ["flakes", "micro_pellets", "frozen"],
  "breeding": "egg_scatterer_hard",
  "lifespanYears": [5, 8],
  "activity": "diurnal",
  "traits": ["schooling", "color_fades_at_night", "sensitive_new_tank"],
  "difficulty": 2,
  "price": 15,
  "unlock": "tank_cube_40"
}
```

### Catálogo inicial

> Valores de referencia simplificados. **Verificarlos con fuentes de acuarismo antes de cerrar los datos.** El juego tiene que enseñar bien.

**Superficie**

| Especie | Temp °C | pH | Tamaño | Grupo | Pecera mín. | Notas de comportamiento |
|---|---|---|---|---|---|---|
| Betta (*Betta splendens*) | 24–28 | 6.0–7.5 | 6 cm | Solo (machos) | 20 L | Respira aire (órgano laberinto), hace nidos de burbujas, despliega aletas ante su reflejo u otros machos, descansa sobre hojas |
| Guppy (*Poecilia reticulata*) | 22–28 | 7.0–8.0 | 4–6 cm | 3+ (más hembras que machos) | 40 L | Vivíparo: se reproduce solo. Los machos persiguen y cortejan a las hembras |
| Endler (*Poecilia wingei*) | 24–28 | 7.0–8.0 | 3 cm | 6+ | 20 L | Como el guppy pero más chico y activo |
| Gourami miel (*Trichogaster chuna*) | 22–28 | 6.0–7.5 | 5 cm | 1 o pareja | 40 L | Tímido y curioso, respira aire, inspecciona todo con sus aletas pélvicas |
| Pez hacha (*Carnegiella strigata*) | 24–28 | 5.5–7.0 | 3.5 cm | 6+ | 60 L | Vive pegado a la superficie, **salta**: necesita tapa |

**Medio**

| Especie | Temp °C | pH | Tamaño | Grupo | Pecera mín. | Notas |
|---|---|---|---|---|---|---|
| Neón (*Paracheirodon innesi*) | 20–26 | 6.0–7.0 | 3.5 cm | 6+ | 40 L | Cardumen. Los colores se apagan de noche. Sensible a pecera nueva |
| Cardenal (*P. axelrodi*) | 24–29 | 5.0–7.0 | 4.5 cm | 8+ | 60 L | Como el neón pero de agua más cálida y blanda |
| Ember tetra (*Hyphessobrycon amandae*) | 23–29 | 5.5–7.0 | 2 cm | 8+ | 30 L | Cardumen naranja, ideal en pecera plantada |
| Rasbora arlequín (*Trigonostigma heteromorpha*) | 23–28 | 6.0–7.5 | 4.5 cm | 8+ | 60 L | Cardumen apretado, pone huevos debajo de hojas anchas |
| Danio cebra (*Danio rerio*) | 18–26 | 6.5–7.5 | 5 cm | 6+ | 60 L | Rapidísimo, siempre en movimiento, tolera agua más fría |
| Barbo cereza (*Puntius titteya*) | 23–27 | 6.0–7.5 | 5 cm | 6+ | 60 L | Pacífico. Los machos se ponen rojos intensos |
| Barbo tigre (*Puntigrus tetrazona*) | 20–26 | 6.0–7.5 | 7 cm | 6+ | 100 L | **Muerde aletas**, peor en grupos chicos. Incompatible con aletas largas |
| Platy (*Xiphophorus maculatus*) | 20–26 | 7.0–8.2 | 6 cm | 3+ | 60 L | Vivíparo, resistente, ideal para principiantes |
| Molly (*Poecilia sphenops*) | 24–28 | 7.5–8.5 | 8–10 cm | 3+ | 80 L | Vivíparo, pica algas, prefiere agua dura |
| Espada (*Xiphophorus hellerii*) | 22–28 | 7.0–8.3 | 12 cm | 3+ | 100 L | Vivíparo, los machos pueden pelear entre sí |
| Escalar (*Pterophyllum scalare*) | 24–30 | 6.0–7.5 | 15 cm (alto 20) | Pareja o 5+ | 180 L (alta) | Elegante y lento. **De adulto come peces chicos (neones)**. Forma parejas y defiende sus huevos |
| Tanictis (*Tanichthys albonubes*) | 16–24 | 6.5–7.5 | 4 cm | 6+ | 40 L | Agua fría, no necesita calefactor |

**Fondo**

| Especie | Temp °C | pH | Tamaño | Grupo | Pecera mín. | Notas |
|---|---|---|---|---|---|---|
| Corydoras paleatus | 18–24 | 6.0–8.0 | 7 cm | 6+ | 60 L | **Nativo del Río de la Plata**. Revuelve la arena buscando comida, sube rápido a tomar aire, necesita arena fina (la grava le daña los bigotes) |
| Corydoras pigmeo (*C. pygmaeus*) | 22–26 | 6.0–7.5 | 2.5 cm | 8+ | 40 L | Nada también a media agua, en grupo |
| Otocinclo (*Otocinclus* sp.) | 21–27 | 6.0–7.5 | 4 cm | 6+ | 60 L | Come algas de hojas y vidrio. Delicado al llegar: necesita pecera madura con algas |
| Ancistrus (*Ancistrus* sp.) | 22–27 | 6.0–7.5 | 12 cm | 1 (machos territoriales) | 100 L | Nocturno, raspa madera y algas, come verduras escaldadas |
| Kuhli (*Pangio kuhlii*) | 24–30 | 5.5–7.0 | 10 cm | 5+ | 80 L | Parece una anguila, nocturno, se entierra en la arena y se mete en todos lados |
| Ramirezi (*Mikrogeophagus ramirezi*) | 26–30 | 5.0–7.0 | 5–7 cm | Pareja | 60 L | Cíclido enano, delicado (nivel avanzado), territorial al criar |

**Agua fría**

| Especie | Temp °C | pH | Tamaño | Grupo | Pecera mín. | Notas |
|---|---|---|---|---|---|---|
| Goldfish de velo (*Carassius auratus*) | 15–24 | 7.0–8.0 | 15–20 cm | 2+ | 150 L para 2 | **Ensucia muchísimo**, come plantas, vive más de 10 años. Es la gran lección contra la pecera redonda |

**Invertebrados**

| Especie | Temp °C | pH | Tamaño | Grupo | Pecera mín. | Notas |
|---|---|---|---|---|---|---|
| Gamba red cherry (*Neocaridina davidi*) | 18–27 | 6.5–8.0 | 2–3 cm | 10+ | 10 L | Se reproduce en la pecera, muda el caparazón (queda la "cáscara"), **el cobre la mata**, sensible a cambios bruscos |
| Gamba amano (*Caridina multidentata*) | 20–28 | 6.5–7.5 | 5 cm | 3+ | 40 L | Gran comealgas, no se reproduce en agua dulce |
| Caracol nerita (*Neritina* sp.) | 22–28 | 7.0–8.5 | 2.5 cm | 1+ | 10 L | Limpia vidrio y hojas, deja huevitos blancos que no eclosionan en agua dulce, a veces se escapa |
| Caracol misterio (*Pomacea diffusa*) | 18–28 | 7.0–8.0 | 5 cm | 1+ | 20 L | Pone huevos rosados **fuera del agua**, debajo de la tapa |

**Polizones (no se compran)**

- **Caracol trompeta y planorbis**: aparecen solos al comprar plantas sin cuarentena. Se multiplican si sobra comida, así que son un indicador de que estás alimentando de más (realista).

### Expansión futura

Llegar a más de 50 especies: más tetras, killis (incluido algún *Austrolebias* argentino), más corydoras, gambas de colores, apistogramas, chanchita (*Australoheros facetus*, nativo), disco (nivel experto).

### Necesidades y estado de cada individuo

```
hunger (0–1)        sube con el tiempo y el metabolismo (más rápido con más temperatura)
stress (0–100)      sube con: parámetros fuera de rango, grupo más chico que minGroup,
                    compañeros agresivos, falta de escondites, pecera chica, cambios bruscos,
                    golpes al vidrio, gato pegado al vidrio mucho rato
health (0–100)      baja con estrés alto prolongado, hambre y toxicidad; sube con buenas condiciones
age                 edad real en días
mood                derivado: feliz / normal / estresado / enfermo
```

### Salud y enfermedades (simple y realista)

- **Punto blanco (ich)**: aparece con estrés alto más cambios bruscos de temperatura. Se ven puntitos blancos en el sprite y el pez se roza contra objetos. Tratamiento: subir la temperatura de a poco y medicación.
- **Aletas deshilachadas**: por mala calidad de agua o mordidas de otros peces.
- **Boqueo en superficie**: falta de oxígeno o amoníaco/nitrito alto. Es una señal, no una enfermedad.
- **Pecera de cuarentena**: los peces nuevos pueden traer enfermedades. Si pasan 2 semanas en cuarentena, el riesgo baja a 0.

### Muerte (decisión de diseño)

- Los peces **pueden morir**, porque es realista y enseña. Pero:
  - Siempre hay señales de aviso previas (comportamiento, color, diario).
  - Ningún problema mata en menos de ~24 h, salvo errores muy grandes (cloro más un cambio del 90%).
  - Un pez muerto que no retirás pudre el agua (sube el amoníaco).
  - Muerte por vejez: al final de su vida, con una entrada tranquila en el diario.
- Opción **"modo suave"** en ajustes: los peces se enferman, pero no mueren.

### Reproducción

- **Vivíparos** (guppy, platy, molly, espada, endler): con machos y hembras, parto cada ~4 semanas. Las crías se esconden en plantas densas. Si no hay plantas, los adultos se las comen (realista). Las crías crecen y se pueden vender.
- **Gambas cherry**: hembra con huevos ("bayada") → crías en ~3 semanas.
- **Betta y gourami**: nido de burbujas (visual, sin cría completa al principio).
- **Escalares y ramirezi**: forman parejas y limpian una hoja o piedra para poner huevos (fase futura).

---

## 8. Comportamiento e interacciones (que se sienta vivo)

### Movimiento de peces

- **Steering behaviors**: cada pez tiene objetivo, velocidad, aceleración y giro máximos según su especie.
- **Zona preferida**: superficie, medio o fondo, con salidas ocasionales.
- **Cardumen**: algoritmo boids (cohesión, alineación y separación). Las especies `schooling` van en grupo apretado y las `shoaling` en grupo más suelto.
- **Personalidad individual**: cada pez tiene valores aleatorios de valentía, actividad y curiosidad. Hay neones más atrevidos que otros.
- **Ritmo día/noche**: los diurnos descansan de noche (cerca del fondo o entre plantas, más quietos y con colores apagados). Los nocturnos (ancistrus, kuhli) salen cuando se apaga la luz.

### Interacciones pez ↔ pez

| Interacción | Quiénes | Qué se ve |
|---|---|---|
| Cardumen | Neones, rasboras, embers, danios | Grupo que se mueve como uno solo y se aprieta ante un susto |
| Persecución territorial | Bettas machos, ancistrus, espadas machos, ramirezi | Corridas cortas, el otro se aleja |
| Mordida de aletas | Barbo tigre → betta, guppy y escalar | Persecución y aletas que se van deshilachando en el sprite |
| Depredación | Escalar adulto → neones y crías; casi todos → crías | Persecución y desaparición (fuera de cámara, sin gore) |
| Cortejo | Guppys y platys machos, betta (despliegue) | Machos que despliegan aletas alrededor de las hembras |
| Competencia por comida | Todos | Los rápidos llegan primero; los tímidos necesitan comida que se hunda |
| Limpieza del fondo | Corydoras, gambas | Comen los restos que caen al fondo |
| Curiosidad | Gourami, betta | Se acercan a peces nuevos o a objetos nuevos |
| Espacio personal | Todos | Se evitan, no se atraviesan |

### Interacciones peces ↔ jugador

- **Hora de comer**: con el tiempo, los peces aprenden a acercarse al frente cuando te ven (pasa en la vida real). Los nuevos son más tímidos.
- **Tocar un pez**: abre su ficha (nombre, especie, edad, ánimo, necesidades).
- **Golpear el vidrio**: los peces se asustan y sube el estrés. El diario explica que no hay que hacerlo.
- **Prender la luz de golpe** de noche: susto breve. Con el temporizador más adelante, hay amanecer gradual.
- **Ponerles nombre** a todos.

### El gato

El gato es un ser vivo con **necesidades** (sueño, hambre, curiosidad, cariño, energía) y elige qué hacer según ellas, la hora real y el clima.

| Comportamiento | Cuándo |
|---|---|
| Dormir | Mucho, sobre todo de día. Busca el **rayo de sol real** si está despejado, o la cama y el almohadón si llueve |
| Mirar los peces | Cuando tiene curiosidad: se sienta frente a la pecera, mueve la cabeza siguiendo un pez y la cola nerviosa |
| Tocar el vidrio con la pata | A veces: los peces se asustan y se dispersan |
| Dormir sobre la tapa | Si la luz de la pecera calienta la tapa (lo hacen los gatos reales) |
| Mirar por la ventana | Lluvia, pájaros. Con la ventana abierta se sienta en el borde |
| Pedir comida | Maúlla y te sigue. Tenés que llenar su plato |
| Acariciarlo | Deslizás el dedo y ronronea. **Si lo acariciás demasiado se molesta y se va** (realista) |
| Jugar | Con un juguete que le das (bolita, ratón de tela) |
| Tirar cosas | Rara vez empuja algo de la mesa, como un lápiz |
| Intentar pescar | Solo si dejás la **tapa abierta**: mete la pata y los peces se estresan. Nunca mata peces (para mantenerlo cozy) |

Más adelante: elegir el gato (color o raza), o tener un perro u otra mascota.

### Reacciones de los peces al gato

- Gato pegado al vidrio un rato largo → los peces tímidos se esconden y los curiosos se acercan.
- Pata en el vidrio → susto general.
- Con el tiempo se acostumbran (el estrés que causa el gato baja con los días).

### Otros seres vivos

- **Plantas de interior**: hay que regarlas cada tanto. Si no, se marchitan de a poco y se recuperan al regarlas.
- **Pájaros** en la ventana los días despejados. El gato reacciona.
- **Plantas del acuario**: crecen, se pueden podar y los esquejes se replantan o se venden.

---

## 9. Habitación interactiva

Todo lo que ves se puede tocar. Cada objeto tiene un estado y una animación.

| Objeto | Interacción | Efecto |
|---|---|---|
| Tocadiscos o radio | Elegir disco, play/pausa, volumen | Música lofi real del juego, el disco gira. Al gato le gusta dormir cerca. Volumen muy alto → leve estrés en los peces (las vibraciones les afectan) |
| Lámpara | Prender/apagar | Cambia la iluminación de la habitación |
| Luz de la pecera | Prender/apagar o temporizador | Afecta plantas, algas y el ritmo de los peces |
| Ventana | Abrir/cerrar | Sonido exterior más fuerte, la cortina se mueve, la temperatura de la habitación sigue más al exterior y el gato puede sentarse en el borde |
| Cortina | Abrir/cerrar | Controla la luz solar directa (y las algas) |
| Taza | Tomar o rellenar | Vapor cuando está caliente; se enfría con el tiempo real |
| Cuaderno | Abrir | **Diario del acuarista** |
| Libros o estante | Abrir | **Enciclopedia**: especies que descubriste, plantas y conceptos |
| Calendario | Ver | Fecha real, próximos cuidados e historial de cambios de agua |
| Celular o tablet en la mesa | Abrir | **Tienda online** (peces, plantas, equipos, decoración) |
| Mueble debajo de la pecera | Abrir puertas | Herramientas: balde, sifón, kit de test, acondicionador, comida, red |
| Termómetro | Tocar | Lectura de la temperatura (sin termómetro, no sabés la temperatura) |
| Frasco de comida | Arrastrar sobre el agua | La cantidad depende de cuánto deslizás |
| Plato del gato | Llenar | El gato viene a comer |
| Plantas de interior | Regar | Se recuperan y crecen |
| Juguete del gato | Arrastrar | El gato juega |

**Regla**: ningún objeto es solo decorativo. Si está en pantalla, reacciona al tocarlo, aunque sea con una animación chiquita.

---

## 10. Peceras, lugares y equipamiento

### Peceras

| Pecera | Medidas aprox. | Volumen | Uso en el juego |
|---|---|---|---|
| Redonda chica | Ø 25 cm | 8 L | Sin filtro ni calefactor de base. Sirve para plantas, gambas (pocas) o un caracol. **Lección**: el juego avisa si intentás meter un goldfish o un betta |
| Cubo chico | 30×30×30 | 20–25 L | Un betta, gambas, endlers. Es la pecera del tutorial |
| Cubo mediano | 35×35×35 | ~40 L | Cardumen chico (embers, corys pigmeo), gourami |
| Rectangular mediana | 60×30×36 | ~65 L | Comunidad: guppys, platys, cardumen, corys |
| Rectangular grande | 100×40×45 | ~180 L | Escalares, cardúmenes grandes, goldfish (pecera de agua fría), ancistrus |

Los modelos están en `src/data/tanks.json` con sus medidas, el nivel de llenado y el equipo de base (watts del calefactor, caudal y capacidad del filtro). La redonda está aproximada como una caja de volumen equivalente.

Cada pecera tiene: volumen, superficie de intercambio de gases, altura (importa para los escalares), equipo instalado, sustrato, decoración y plantas.

### Lugares (habitaciones)

| Lugar | Luz | Temperatura | Desbloqueo |
|---|---|---|---|
| Dormitorio | Ventana lateral, poca luz directa | Estable | Inicio |
| Cocina (repisa de la ventana) | Mucha luz de mañana | Varía al cocinar | Temprano (ideal para la redonda) |
| Living | Ventanal grande | Media | Medio |
| Estudio u oficina | Luz artificial | Estable | Avanzado (varias peceras) |

Cada lugar tiene sus objetos interactivos propios y **slots** donde se pueden poner peceras. Mover una pecera con agua no se puede (realista): hay que vaciarla, y los peces van a otra pecera.

### Equipamiento

| Equipo | Variantes | Función |
|---|---|---|
| Filtro | Interno, mochila (cascada), canister | Bacterias, caudal y oxigenación |
| Calefactor | 25 / 50 / 100 / 200 W con termostato | Mantener la temperatura |
| Termómetro | Adhesivo, digital | Ver la temperatura |
| Aireador | Con piedra difusora | Oxígeno y burbujas |
| Luz LED | Básica, plantada | Plantas y algas |
| Temporizador | Enchufe programable | Horas de luz automáticas |
| Tapa | — | Menos evaporación, evita saltos y al gato |
| Alimentador automático | — | Para ausencias |
| Limpiador magnético | — | Limpieza del vidrio más rápida |
| Sifón y balde | — | Cambios de agua y limpieza del fondo |
| Kit de test | **Tiras** (baratas, menos precisas) o **gotas** (precisas) | Medir parámetros: tiras con rangos aproximados, gotas con valores exactos |
| CO₂ | Fase futura | Plantas exigentes |
| Pecera de cuarentena | — | Peces nuevos o enfermos |
| Paridera | — | Proteger crías |

### Plantas

| Planta | Dificultad | Notas |
|---|---|---|
| Anubias | Fácil | Se ata a madera o roca, crece lento, no se entierra |
| Helecho de Java | Fácil | Igual que la anubias, muy resistente |
| Musgo de Java | Fácil | Refugio para crías y gambas |
| Bola de musgo (marimo) | Fácil | Rueda si la girás, ideal para la redonda |
| Criptocoryne | Media | Se "derrite" al cambiar de pecera y después rebrota (realista) |
| Vallisneria | Fácil | Hojas largas que se mueven con la corriente |
| Elodea | Fácil | Crece rápido, buena para agua fría y absorbe nitratos |
| Lenteja de agua | Fácil | Flotante, absorbe mucho nitrato y **se vuelve plaga**, tapa la luz |
| Ludwigia roja | Media/difícil | Necesita mucha luz para ponerse roja |
| Hygrophila | Fácil | Crece rápido, absorbe nutrientes |

### Decoración

- **Madera**: baja el pH, suelta taninos (agua ámbar) y los ancistrus la raspan.
- **Hojas de almendro**: taninos, a los bettas les gustan.
- **Roca dragón o seiryu**: estética. **Roca caliza**: sube pH y KH.
- **Cuevas, tubos y cocos**: escondites (bajan el estrés).
- **Sustratos**: arena fina (la que necesitan los corydoras), grava, sustrato nutritivo (para plantas).
- **Fondos**: vinilo negro, azul, paisaje.
- **Decoración de la habitación**: muebles, cuadros, alfombras, plantas, lámparas, discos.

---

## 11. Cuidados (las acciones del jugador)

| Acción | Frecuencia real recomendada | Cómo se juega |
|---|---|---|
| Alimentar | 1–2 veces por día, lo que coman en ~2 min | Arrastrar el frasco; la comida flota y se hunde. Lo que sobra cae y se pudre |
| Medir el agua | Semanal (más seguido al ciclar) | Kit de test con animación de tubos y colores, y lectura |
| Cambio de agua | 20–30% semanal | Sifonear (sacás agua y suciedad del fondo) → acondicionar el balde → igualar la temperatura → rellenar |
| Limpiar el vidrio | Según las algas | **Pasar el dedo**: la esponja o el imán borra la capa de algas con un efecto satisfactorio |
| Limpiar el filtro | Cada 2–4 semanas | Abrir, enjuagar en el balde con agua de la pecera |
| Rellenar por evaporación | Según haga falta | Agua acondicionada |
| Podar plantas | Según crecimiento | Cortar tallos y replantar o vender |
| Retirar restos | Cuando aparezcan | Hojas muertas, mudas de gambas (estas se pueden dejar: las gambas se las comen) |
| Aclimatar peces nuevos | Al comprar | Bolsa flotando ~15–20 min y mezclar agua de a poco. Saltear este paso → estrés |

### Limpieza del vidrio (detalle)

- La capa de algas es una **textura máscara** sobre el vidrio con valores de 0 a 1 por zona.
- Crece desde los bordes y las zonas con más luz.
- El dedo borra en un radio, con un efecto de brillo donde quedó limpio.
- Por fuera aparecen marcas de agua y huellas, que se limpian con un trapo.
- Los caracoles nerita y los otocinclos limpian de a poco por su cuenta (se los ve trabajando).

---

## 12. Economía

Moneda: **monedas** (nombre a definir: ¿escamas?, ¿perlas?).

### Cómo se ganan

| Fuente | Ejemplo |
|---|---|
| Cuidados del día | Alimentar bien (sin sobrante): +5 · Cambio de agua semanal: +30 · Medir el agua: +5 |
| Rachas | 7 días con parámetros ideales: +50 · 30 días: +250 |
| Peces felices | Ingreso pasivo chico por cada pez con buen ánimo, también offline (con tope diario) |
| Vender crías | Guppys, platys, gambas, esquejes de plantas a la tienda del barrio |
| Logros educativos | "Primera pecera ciclada", "Primer cambio de agua", "Primeras crías"... |
| Enciclopedia | Descubrir la ficha completa de una especie (observarla durante X días) |

### En qué se gastan

Peces, plantas, equipamiento, peceras, decoración del acuario y de la habitación, nuevas habitaciones y cosas para el gato.

### Reglas de balance

- Nunca se gana por "clickear": todo viene de cuidar bien.
- El ingreso pasivo tiene **tope diario** (no se gana más por dejarlo abierto).
- Los precios son relativos a la vida real (un escalar cuesta más que un neón, el canister más que el filtro interno).
- No hay compras con dinero real.

---

## 13. Inicio y tutorial

El tutorial **enseña el ciclado sin que tengas que esperar 4 semanas**, usando una técnica real.

1. **Llegás a tu habitación.** Un amigo acuarista te dejó un cubo de 20 L, arena, una anubias, un filtro chico y una nota.
2. **La nota** explica que el material del filtro viene de su acuario y ya tiene bacterias buenas, y te pide no lavarlo con agua de la canilla. Es el **material de filtro colonizado**.
3. **Armado guiado**: sustrato → decoración → planta → llenar → **acondicionador** (se explica el cloro) → encender el filtro y el calefactor.
4. **Esperar unas horas reales** y medir con el kit de test (se explican el amoníaco, el nitrito y el nitrato).
5. **Elegir tu primer animal (gratis)**: un **betta**, o **gambas red cherry y un caracol nerita**.
6. **Aclimatación guiada** (bolsa flotando, mezclar agua).
7. **Primera alimentación**: aprender a no dar de más.
8. **Día 3 a 7**: se desbloquea la tienda y llega un **segundo regalo** (otro animal compatible o una planta).
9. **Primera semana**: cambio de agua guiado y limpieza del vidrio guiada.
10. **Fin del tutorial**: primer logro, monedas iniciales y se desbloquea la cocina con la pecera redonda.

Después del tutorial, la siguiente pecera **sí hay que ciclarla** (o pasarle material de filtro de una pecera tuya ya madura, que se desbloquea como acción).

---

## 14. UI

- **Mínima y discreta**, en las esquinas, como en las imágenes de referencia.
- Arriba a la izquierda: temperatura, estado del agua (Perfecta / Buena / Revisar / Peligro), día y clima.
- Arriba a la derecha: monedas, pausa del audio y ajustes.
- Abajo: accesos a herramientas, diario y tienda.
- **El estado detallado del agua solo se conoce midiendo** (el estado general es una "impresión" basada en el último test y en lo que ves).
- Tocar un pez → ficha. Tocar la pecera → panel de la pecera (equipo, últimos tests, próximos cuidados).
- Gestos: deslizar para cambiar de habitación, pellizcar para hacer zoom en la pecera.
- **Modo contemplación**: se oculta toda la UI, para dejarlo de fondo.

### Diario del acuarista

Un cuaderno donde el juego anota lo que pasa y **explica por qué**:
> "Martes 14: el nitrito subió a 0.5 ppm. Probablemente porque lavaste el filtro con agua de la canilla y murieron las bacterias. Hacé cambios de agua chicos estos días y no alimentes de más."

También guarda nacimientos, peces nuevos, despedidas y momentos lindos ("Luna, la gata, se quedó una hora mirando a los neones").

---

## 15. Audio

| Sonido | Cuándo |
|---|---|
| Zumbido del filtro y burbujas | Siempre (volumen según el filtro) |
| Agua cayendo | Filtro de cascada |
| Lluvia, viento y truenos | Según el clima real |
| Pájaros | Días despejados |
| Grillos | Noches de calor |
| Ronroneo y maullidos | Gato |
| Música lofi | Desde el tocadiscos o la radio (pistas propias o con licencia libre) |
| Efectos suaves | Tocar objetos, limpiar el vidrio, comida cayendo al agua |

Volúmenes separados: música, ambiente y efectos.

---

## 16. Guardado

- Se guarda en IndexedDB: estado de la simulación, `lastTimestamp`, ubicación, ajustes y semilla del RNG.
- Autoguardado cada 1 minuto, al pasar a segundo plano y enseguida después de cada acción del jugador.
- Exportar e importar la partida como archivo JSON (backup). *(Pendiente.)*
- Versión del formato del save con migraciones (`formatVersion` en `src/save/save-format.ts`). Un guardado ilegible o de una versión más nueva no se pisa: queda una copia de respaldo.
- La "semilla del RNG" que se guarda es el estado actual del generador, que vive dentro del estado de la simulación.

---

## 17. Roadmap (de a poco)

Cada fase termina con algo jugable y publicado en GitHub Pages.

### Fase 0: Base
- [x] Proyecto Vite + TypeScript + PixiJS + PWA + deploy automático
- [x] Escena vacía 640×360 escalada, orientación horizontal
- [x] Guardado básico

### Fase 1: Química del agua (sin gráficos)
- [x] `sim/` con agua, bacterias y temperatura
- [x] Tests: una pecera nueva cicla en 3 a 6 semanas simuladas
- [x] Tests: lavar el filtro con agua de la canilla provoca un pico de amoníaco
- [x] Tests: sobrealimentar sube el amoníaco
- [x] Panel de debug para ver los parámetros

### Fase 2: Una pecera viva
- [ ] Cubo de 20 L dibujado con agua, burbujas, rayos de luz y planta ondulando
- [ ] Un betta animado con steering y comportamiento día/noche
- [ ] Alimentar y que coma
- [ ] Ficha del pez

### Fase 3: Tiempo real y clima
- [ ] Catch-up offline más resumen de bienvenida
- [ ] Open-Meteo, día/noche real y clima en la ventana
- [ ] Temperatura habitación → agua

### Fase 4: Cuidados
- [ ] Kit de test, cambio de agua, sifón, acondicionador
- [ ] Algas y limpieza del vidrio con el dedo
- [ ] Limpieza del filtro (bien y mal)
- [ ] Diario del acuarista

### Fase 5: El dormitorio vivo
- [ ] Habitación completa con capas e iluminación
- [ ] Objetos interactivos: lámpara, ventana, cortina, taza, tocadiscos
- [ ] El gato con necesidades, dormir, mirar peces, acariciar

### Fase 6: Tutorial y economía
- [ ] Tutorial completo
- [ ] Monedas, tienda y logros

### Fase 7: Más vida
- [ ] Catálogo inicial de especies con boids y cardúmenes
- [ ] Compatibilidad e interacciones entre peces
- [ ] Reproducción de vivíparos y gambas
- [ ] Plantas que crecen y se podan

### Fase 8: Más casa
- [ ] Todas las peceras
- [ ] Cocina, living y estudio
- [ ] Equipamiento completo, decoración y personalización de habitaciones

### Fase 9: Pulido
- [ ] Enfermedades y cuarentena
- [ ] Más especies
- [ ] Notificaciones
- [ ] Modo contemplación, ajustes y accesibilidad

---

## 18. Convenciones para el desarrollo (Claude Code)

- **Leer este archivo** antes de cada tarea y actualizarlo si cambia una decisión.
- `src/sim/` **no importa nada** de Pixi, del DOM ni de APIs del navegador. Solo lógica pura y testeable.
- Todos los números de balance van en `src/data/*.json`, no hardcodeados.
- La simulación es **determinista**: mismo estado + misma semilla + mismo delta = mismo resultado.
- Toda mecánica nueva de la simulación va con al menos un test en Vitest.
- Mobile first: probar en el celular, apuntar a 60 fps y no pasarse con las partículas.
- Pixel perfect: posiciones enteras, escalado entero, sin suavizado de texturas. El múltiplo entero se calcula en píxeles físicos de la pantalla (píxeles CSS × devicePixelRatio).
- Commits chicos y descriptivos, una funcionalidad por vez.
- Textos del juego en español (rioplatense neutro), centralizados en un archivo de textos para traducir después (`src/data/texts.es.json`).
- `npm run typecheck` compila `src/sim` aparte sin las librerías del DOM: si la simulación toca el navegador, falla.

---

## 19. Preguntas abiertas

- [x] Nombre del juego: **Little World**
- [ ] Nombre de la moneda
- [ ] Nombre y aspecto del gato (¿se elige al empezar?)
- [ ] ¿Modo suave activado por defecto o desactivado?
- [ ] ¿Personaje del jugador visible (manos) o solo herramientas?
- [ ] Música: ¿componer, usar pistas libres o encargarla?
- [ ] ¿Migrar a Godot en algún momento para publicar en tiendas?
