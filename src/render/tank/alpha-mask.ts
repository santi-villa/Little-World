import type { Texture } from "pixi.js";
const masks = new Map<
  number,
  { columns: number; rows: number; alpha: number[] }
>();
/** Read existing art once, at low resolution. Transparent holes remain traversable. */
export function textureSilhouette(texture: Texture, flip = false) {
  let mask = masks.get(texture.uid);
  if (!mask) {
    const columns = Math.min(64, Math.max(8, Math.round(texture.width / 4))),
      rows = Math.min(64, Math.max(8, Math.round(texture.height / 4))),
      alpha: number[] = [];
    try {
      const canvas = document.createElement("canvas");
      canvas.width = columns;
      canvas.height = rows;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("No canvas");
      const f = texture.frame;
      ctx.drawImage(
        texture.source.resource as CanvasImageSource,
        f.x,
        f.y,
        f.width,
        f.height,
        0,
        0,
        columns,
        rows,
      );
      const data = ctx.getImageData(0, 0, columns, rows).data;
      for (let i = 0; i < columns * rows; i++)
        alpha.push(data[i * 4 + 3]! > 128 ? 1 : 0);
    } catch {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < columns; x++)
          alpha.push(
            ((x / columns - 0.5) / 0.46) ** 2 + ((y / rows - 0.5) / 0.48) ** 2 <
              1
              ? 1
              : 0,
          );
    }
    mask = { columns, rows, alpha };
    masks.set(texture.uid, mask);
  }
  return {
    ...mask,
    alpha: flip
      ? mask.alpha.map(
          (_, i) =>
            mask!.alpha[
              Math.floor(i / mask!.columns) * mask!.columns +
                mask!.columns -
                1 -
                (i % mask!.columns)
            ]!,
        )
      : mask.alpha,
  };
}
