import { Container, FillGradient, Graphics, MeshPlane, Sprite, type Texture } from 'pixi.js';
import { Game } from '../../game';
import { applyAction, createNewTank } from '../../sim';
import { FishLayer } from '../tank/fish-layer';
import { PlantMotion } from '../motion/plant-motion';
import { BubbleParticles } from '../motion/bubble-particles';
import { IllustratedBetta } from './illustrated-betta';
import type { loadIllustratedBettaArt } from './illustrated-betta-art';
import { roomPreview as layout, type PreviewAsset } from './room-preview-layout';

export type PreviewTextures = Record<PreviewAsset, Texture>;

function gradient(top: number, bottom: number): FillGradient {
  return new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }],
  });
}

/** The approved shell sits over the same live interior in both camera views. */
export function buildPreviewTank(textures: PreviewTextures, bettaArt: Awaited<ReturnType<typeof loadIllustratedBettaArt>>) {
  const container = new Container({ label: 'room-preview-tank' });
  const { x, y, width, height } = layout.front;
  const bottom = y + height;
  const surface = y + 25;
  const sandTop = bottom - 38;
  const swimming = { x: x + 9, y: surface + 1, width: width - 18, height: sandTop - surface };
  const pxPerCm = swimming.width / 60;
  const shell = new Sprite(textures.shell);

  const state = applyAction(createNewTank({
    seed: 3821, startMinuteOfDay: 12 * 60, seededMedia: true,
  }), { type: 'addAnimals', speciesId: 'betta', count: 1 }).state;
  state.animals[0]!.ageDays = 240;
  const game = new Game(state);
  game.enableGrains();

  const fish = new FishLayer((id, facing, species) => species === 'betta' ? new IllustratedBetta(id, facing, bettaArt) : undefined);
  const bubbles = new BubbleParticles(22);
  const interior = new Container({ label: 'room-preview-interior' });
  const frontMask = new Graphics().rect(x, y, width, height).fill(0xffffff);
  interior.mask = frontMask;

  const side = new Container();
  const sideMask = new Graphics().poly([...layout.side]).fill(0xffffff);
  side.mask = sideMask;
  const [sideX, sideY, farX, farY, , farBottom] = layout.side;
  const farSurface = surface + farY - sideY;
  const farSand = sandTop + farBottom - bottom;
  const sideGlass = new Graphics()
    .rect(sideX, y, farX - sideX, height).fill(gradient(0xb7cbc0, 0x597e79))
    .poly([sideX, surface, farX, farSurface, farX, bottom, sideX, bottom])
    .fill(gradient(0x7caaa0, 0x24534e))
    .poly([sideX, sandTop, farX, farSand, farX, bottom, sideX, bottom]).fill(0xb4a17b)
    .moveTo(sideX, surface).lineTo(farX, farSurface).stroke({ color: 0xe1f3db, alpha: 0.42, width: 2 });
  side.addChild(sideGlass);

  const water = new Graphics()
    .rect(x, y, width, height).fill(gradient(0xb8cbb9, 0x72998c))
    .rect(x, surface, width, bottom - surface).fill(gradient(0x8cbbb0, 0x326861))
    .rect(x, y, width, 5).fill({ color: 0xffefcb, alpha: 0.8 });

  const sand = new Sprite(textures.sand);
  sand.position.set(x, sandTop - 21);
  sand.width = width;
  sand.height = 172;
  sand.tint = 0xd6dbc0;
  const sandMask = new Graphics().moveTo(x, sandTop - 10)
    .bezierCurveTo(x + width * 0.34, sandTop - 27, x + width * 0.62, sandTop + 18, x + width, sandTop - 7)
    .lineTo(x + width, bottom).lineTo(x, bottom).closePath().fill(0xffffff);
  sand.mask = sandMask;

  const contact = new FillGradient({
    type: 'radial',
    colorStops: [{ offset: 0, color: '#323f31aa' }, { offset: 1, color: '#323f3100' }],
  });
  const shadows = new Graphics();
  const roots = new Graphics();
  const plants = layout.plants.map((item, index) => {
    const texture = textures[item.asset];
    const height = swimming.height * item.height;
    const mesh = new MeshPlane({ texture, verticesX: 4, verticesY: 9 });
    const scale = height / texture.height;
    const cx = x + width * item.x;
    mesh.scale.set(scale);
    mesh.position.set(cx - texture.width * scale / 2, sandTop + 15 - height);
    mesh.tint = item.tint;
    const buffer = mesh.geometry.getAttribute('aPosition').buffer;
    const positions = buffer.data as Float32Array;
    shadows.ellipse(cx, sandTop + 13, texture.width * scale * 0.4, 10).fill(contact);
    // The gradient covers the exposed ends so the mesh stays anchored in the sand.
    roots.ellipse(cx, sandTop + 15, texture.width * scale * 0.28, 11).fill(new FillGradient({
      type: 'radial',
      colorStops: [{ offset: 0, color: '#cebf90' }, { offset: 1, color: '#cebf9000' }],
    }));
    fish.habitat.refuges.push({ x: item.x, y: 0.83 });
    fish.habitat.leaves.push({ x: item.x, y: 1 - item.height * 0.54 });
    return { mesh, buffer, positions, rest: positions.slice(), motion: new PlantMotion(9, index * 1.8, 'anubias'), cx, height };
  });

  const hardscape = layout.hardscape.map(item => {
    const sprite = new Sprite(textures[item.asset]);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set((width * item.width) / sprite.texture.width);
    sprite.position.set(x + width * item.x, sandTop + 13);
    sprite.tint = item.tint;
    shadows.ellipse(sprite.x, sprite.y - 3, sprite.width * 0.49, 14).fill(contact);
    fish.habitat.obstacles.push({ x: item.x, y: 0.94, z: 0.5, depth: 0.55, rx: item.width * 0.36, ry: 0.09 });
    return sprite;
  });
  const waterWidth = swimming.width / pxPerCm;
  const waterHeight = swimming.height / pxPerCm;
  fish.water.configure(waterWidth, waterHeight, 180, state.tank.waterLiters, fish.habitat);

  const shaft = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: '#fff3cc33' }, { offset: 1, color: '#fff3cc00' }],
  });
  const light = new Graphics()
    .ellipse(x + width * 0.43, surface, width * 0.51, height * 0.57).fill(new FillGradient({
      type: 'radial',
      colorStops: [{ offset: 0, color: '#fff1cb55' }, { offset: 1, color: '#fff1cb00' }],
    }))
    .poly([x + 60, surface, x + 107, surface, x + 342, bottom, x + 206, bottom]).fill(shaft)
    .poly([x + 132, surface, x + 147, surface, x + 393, bottom, x + 352, bottom]).fill(shaft)
    .poly([x + 13, y, x + 24, y, x + 101, bottom, x + 93, bottom]).fill({ color: 0xf0ffff, alpha: 0.085 });
  const shimmer = new Graphics();

  interior.addChild(water, sand, sandMask, shadows, ...plants.map(p => p.mesh), roots,
    fish.graphics, fish.artBack, ...hardscape, fish.foreground, fish.artFront, fish.foodGraphics, light, shimmer);
  container.addChild(sideMask, side, frontMask, interior, shell);
  let seconds = 0;

  return {
    container,
    hitArea: { x: 0, y: 0, width: shell.width, height: shell.height },
    feed() { game.act({ type: 'feed', grams: 0.004, x: 0.53, kind: 'pellets' }); },
    tap(x: number, y: number) { fish.scareAt(x, y); },
    update(dt: number) {
      seconds += dt;
      game.update(dt);
      fish.update(game.state, true, swimming, pxPerCm, seconds, dt);
      game.observeFeedingContacts(fish.feedingContacts);
      game.observeGrains(fish.foodPositions, fish.grainContacts);
      for (const plant of plants) {
        const visitors = Array.from(fish.motion.bodies.values(), body => ({
          height: (sandTop - swimming.y - body.y * pxPerCm) / plant.height,
          distance: Math.abs(swimming.x + body.x * pxPerCm - plant.cx) / (plant.height * 0.65),
          speed: body.vx / 4,
        }));
        const flow = fish.water.getWaterVelocity((plant.cx - swimming.x) / pxPerCm, waterHeight * 0.78);
        plant.motion.update(dt, seconds, 0, visitors, flow.x);
        for (let i = 0; i < plant.positions.length; i += 2) {
          const row = Math.floor(i / 8);
          plant.positions[i] = plant.rest[i]! + plant.motion.offsets[8 - row]! * (plant.height / plant.mesh.scale.x);
        }
        plant.buffer.update();
      }

      shimmer.clear();
      shimmer.moveTo(x, surface);
      for (let i = 1; i <= 44; i++) {
        const u = i / 44;
        shimmer.lineTo(x + u * width, surface + Math.sin(u * 26 - seconds * 1.3) * 1.2);
      }
      shimmer.stroke({ color: 0xe9ffe6, width: 2.4, alpha: 0.55 });
      bubbles.update(dt, waterWidth, waterHeight, 0.4, fish.water);
      for (const bubble of bubbles.particles) {
        const r = bubble.radius * pxPerCm;
        const bx = swimming.x + bubble.x * pxPerCm;
        const by = swimming.y + bubble.y * pxPerCm;
        shimmer.circle(bx, by, r).stroke({ color: 0xc5f0e4, width: 1, alpha: 0.65 });
        shimmer.circle(bx - r * 0.35, by - r * 0.4, Math.max(0.7, r * 0.18)).fill({ color: 0xf2fff8, alpha: 0.73 });
      }
    },
  };
}
