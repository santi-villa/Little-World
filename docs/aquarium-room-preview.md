# Habitación y pecera ilustradas

La rama `experiment/room-aquarium-preview` reúne el prototipo visual anterior, el betta articulado y los dos ZIPs subidos a `main`. La escena abre desde el propio juego con el parámetro `?room-preview`.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Abrí `http://localhost:5173/Little-World/?room-preview` o usá el puerto que indique Vite. La misma ruta funciona al compilar con `npm run build` y servirla con `npm run preview`.

Tocá la pecera o usá **Acercar a la pecera** para verla de cerca. **Ver habitación** y Escape devuelven la cámara a la vista inicial. **Dar comida** suelta pellets en la simulación de prueba. Un toque en el vidrio desde cerca sobresalta al pez. El selector **Ventana** permite comparar día, lluvia y noche. **Volver al juego** abre la partida habitual. La preview usa una partida temporal y no abre IndexedDB.

## Arte preparado

Los ZIPs originales siguen en `public/assets/`. Se revisaron las 22 ilustraciones incluidas. No había duplicados idénticos. Los grupos de troncos y piedras contienen variantes cercanas. Se conservaron como alternativas modulares y la vista solo carga una de cada grupo.

| Archivo fuente | Recursos preparados |
| --- | --- |
| `Pecera y habitacion.zip` | `room/bedroom.png` con los vidrios de la ventana transparentes y `aquarium/shell.png` con el contorno y el hueco del tanque transparentes |
| `Little World images.zip` | Cuatro macetas en `room/decor/`, cuatro variantes en cada carpeta `aquarium/plants/`, `driftwood/`, `rocks/` y `substrate/` |

Las rutas son relativas a `public/assets/`. El script elimina los fondos blancos y crema de los objetos con un borde de alfa parcial, recorta el margen y limpia la contaminación de color del chroma lila. La arena se conserva como JPG opaco. Las ilustraciones originales se pueden recuperar de los ZIPs.

Para regenerar los archivos:

```sh
mkdir -p /tmp/little-world-art
unzip -o 'public/assets/Pecera y habitacion.zip' -d /tmp/little-world-art
unzip -o 'public/assets/Little World images.zip' -d /tmp/little-world-art
node scripts/prepare-room-preview.mjs /tmp/little-world-art
```

El script documenta el identificador de origen de cada variante. Las dimensiones, la posición del tanque, la región de la ventana y el conjunto de decoraciones visibles están en `src/render/dev/room-preview-layout.ts`.

## Composición y alcance

PixiJS dibuja el exterior con el sistema de cielo existente detrás de las transparencias de la ventana. En el tanque, la estructura original se superpone a planos de agua, arena, plantas, tronco, piedra y un betta articulado. Las plantas reutilizan `PlantMotion` con una malla deformable y reaccionan a la corriente y al pez. El pez y el alimento pasan por `FishLayer` y una sola instancia temporal de `Game`. Ambas vistas muestran ese mismo estado. El lateral lleva su propio tinte y una continuación de la línea del agua, con un recorte independiente del frente.

Esta versión ofrece una comparación visual y un conjunto básico de interacciones. Los modos de clima son manuales. La conexión al clima real se puede hacer pasando `OutsideView` al mismo dibujador de cielo. La vista detallada sigue siendo una ampliación del acuario ilustrado. Para reemplazar el modo habitual todavía faltaría adaptar los controles completos de cuidado y añadir profundidad visual al lateral, que hoy representa solo agua y sustrato. Los paquetes traen macetas como decoración modular. La lámpara y el cuadro ilustrados quedan para una tanda posterior.

## Validación

Pasó `npm run build`, que incluye la comprobación de tipos. Se ejecutaron las 77 pruebas relevantes de movimiento, betta, plantas, comida, interacción, viewport y clima. Se verificaron las transparencias y la presencia de los 22 archivos preparados en el build.

En Chromium se abrió la versión compilada, se probó el zoom con clic y toque, la vuelta a la habitación, el alimento, los modos de ventana y el encuadre móvil. La partida habitual también abrió y respondió a sus controles en el build. La preview dejó el almacenamiento de partidas sin abrir.
