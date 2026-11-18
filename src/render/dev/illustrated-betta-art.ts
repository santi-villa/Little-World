import { Assets, Rectangle, Texture } from "pixi.js";
import atlasUrl from "./art/betta-illustrated-atlas.png?url";
import frontUrl from "./art/betta-front-head.png?url";
import config from "../../data/illustrated-betta.json";
export type IllustratedArtPart = keyof typeof config.frames | "front";
let pending: Promise<Readonly<Record<IllustratedArtPart, Texture>>> | undefined;
/** A dedicated smooth texture source: existing pixel-art textures stay untouched. */
export function loadIllustratedBettaArt() {
  return (pending ??= Promise.all([
    Assets.load<Texture>(atlasUrl),
    Assets.load<Texture>(frontUrl),
  ])
    .then(([atlas, front]) => {
      if (
        atlas.width !== config.atlas.width ||
        atlas.height !== config.atlas.height
      )
        throw new Error("Dimensiones inesperadas del atlas de betta");
      atlas.source.scaleMode = "linear";
      front.source.scaleMode = "linear";
      return {
        ...Object.fromEntries(
          Object.entries(config.frames).map(([name, r]) => [
            name,
            new Texture({
              source: atlas.source,
              frame: new Rectangle(r.x, r.y, r.width, r.height),
            }),
          ]),
        ),
        front: new Texture({
          source: front.source,
          frame: new Rectangle(300, 150, 658, 890),
        }),
      } as Record<IllustratedArtPart, Texture>;
    })
    .catch((error) => {
      pending = undefined;
      throw error;
    }));
}
