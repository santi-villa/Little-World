/** Habitaciones y sus zonas tocables, desde `src/data/rooms.json`. */

import roomsData from '../../data/rooms.json';
import type { CameraView } from '../camera';
import type { TankRect } from '../tank/tank-layout';

export type ZoneAction = 'tank-view' | 'pet-cat' | 'panel' | 'toggle-window' | 'toggle-lamp';
export type PanelId = 'library' | 'notebook';

export interface RoomZone {
  id: string;
  /** Rectángulo fijo, o "tank" / "cat" para seguir a la pecera o al gato. */
  rect: [number, number, number, number] | 'tank' | 'cat';
  action: ZoneAction;
  /** Acercamiento al tocarla. */
  zoom?: number;
  /** O qué parte de la pantalla tiene que ocupar la zona al acercarse (0 a 1). */
  fill?: number;
  panel?: PanelId;
}

export interface RoomData {
  background: string;
  /** Vista inicial. */
  camera: CameraView;
  zones: RoomZone[];
}

const rooms = roomsData.rooms as unknown as Record<string, RoomData>;

export function roomData(id: string): RoomData {
  const room = rooms[id];
  if (!room) throw new Error(`No hay habitación "${id}" en rooms.json`);
  return room;
}

/** Rectángulo actual de una zona (las que siguen a la pecera o al gato se mueven). */
export function zoneRect(zone: RoomZone, live: { tank: TankRect; cat: TankRect }): TankRect {
  if (zone.rect === 'tank') return live.tank;
  if (zone.rect === 'cat') return live.cat;
  const [x, y, width, height] = zone.rect;
  return { x, y, width, height };
}

export function inRect(r: TankRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}
