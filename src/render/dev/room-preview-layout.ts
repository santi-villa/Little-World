/** World coordinates are in the existing 1280 × 720 viewport. The glass
 * opening is measured in pixels of the prepared 1040 × 556 shell. */
export const roomPreview = {
  assets: {
    room: 'room/bedroom.png',
    leftPothos: 'room/decor/ceramic-pothos.png',
    rightPothos: 'room/decor/trailing-pothos.png',
    shell: 'aquarium/shell.png',
    leftPlant: 'aquarium/plants/narrow-leaf.png',
    rightPlant: 'aquarium/plants/broad-leaf.png',
    driftwood: 'aquarium/driftwood/low-branch.png',
    rock: 'aquarium/rocks/mossy-river-stone.png',
    sand: 'aquarium/substrate/fine-ripples.jpg',
  },
  window: { x: 182, y: 0, width: 350, height: 240 },
  pots: [
    { asset: 'leftPothos', x: 77, y: 124, height: 86 },
    { asset: 'rightPothos', x: 1188, y: 136, height: 94 },
  ],
  tank: { x: 410, baseY: 443, width: 465, shellWidth: 1040 },
  front: { x: 23, y: 47, width: 925, height: 452 },
  side: [948, 47, 1023, 70, 1023, 450, 948, 499],
  plants: [
    { asset: 'leftPlant', x: 0.17, height: 0.47, tint: 0xc3dbc7 },
    { asset: 'rightPlant', x: 0.82, height: 0.34, tint: 0xbdd3ae },
  ],
  hardscape: [
    { asset: 'driftwood', x: 0.34, width: 0.34, tint: 0xccd7b7 },
    { asset: 'rock', x: 0.68, width: 0.17, tint: 0xc0cbc0 },
  ],
  transitionSeconds: 0.62,
} as const;

export type PreviewAsset = keyof typeof roomPreview.assets;
