import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { Camera } from "../src/render/camera";
import { ViewBlend } from "../src/render/motion/view-transition";
import {
  createHybridConfig,
  hybridGeometry,
  identityAffine,
  insidePolygon,
  projectPoint,
  unprojectPoint,
} from "../src/render/motion/hybrid-tank-geometry";
const tank = { x: 592, y: 206, width: 388, height: 256 };
describe("geometría de pecera híbrida", () => {
  it("llega al frente original exactamente, sin una segunda cara desalineada", () => {
    const config = createHybridConfig(),
      g = hybridGeometry(tank, 0.5, 1, config);
    expect(g.matrix).toEqual({ ...identityAffine(), b: -0 });
    expect(g.extrusion).toEqual({ x: 0, y: -0 });
    expect(g.bounds).toEqual(tank);
    expect(g.front[0]).toEqual({ x: 592, y: 206 });
  });
  it("mantiene un frente no degenerado y coordenadas invertibles en todo el viaje y rango de ajustes", () => {
    for (const scale of [0.7, 0.98, 1.2])
      for (const angle of [0, 12, 28])
        for (const near of [0, 0.1, 0.5, 0.9, 1]) {
          const config = createHybridConfig();
          config.placement.scale = scale;
          config.geometry.angleDeg = angle;
          const g = hybridGeometry(tank, 0.5, near, config);
          expect(g.matrix.a * g.matrix.d).toBeGreaterThan(0.4);
          for (const p of [
            { x: 600, y: 210 },
            { x: 786, y: 320 },
            { x: 970, y: 450 },
          ]) {
            const projected = projectPoint(p, g.matrix),
              back = unprojectPoint(projected, g.matrix);
            expect(back.x).toBeCloseTo(p.x, 9);
            expect(back.y).toBeCloseTo(p.y, 9);
          }
        }
  });
  it("comparte las aristas entre frente, tapa y lateral y registra el volumen tocable", () => {
    const g = hybridGeometry(tank, 0.5, 0, createHybridConfig());
    expect(g.right[0]).toEqual(g.front[1]);
    expect(g.right[3]).toEqual(g.front[2]);
    expect(g.top[3]).toEqual(g.front[1]);
    const center = g.right.reduce(
      (sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }),
      { x: 0, y: 0 },
    );
    expect(insidePolygon(center, g.right)).toBe(true);
    expect(insidePolygon({ x: 20, y: 20 }, g.right)).toBe(false);
    expect(g.bounds.width).toBeGreaterThan(g.front[1]!.x - g.front[0]!.x);
  });
  it("un lateral o tapa de área cero nunca captura todos los clics", () => {
    const g = hybridGeometry(tank, 0.5, 1, createHybridConfig());
    expect(insidePolygon({ x: 20, y: 20 }, g.right)).toBe(false);
    expect(insidePolygon({ x: 700, y: 300 }, g.top)).toBe(false);
    expect(insidePolygon({ x: 700, y: 300 }, g.front)).toBe(true);
  });
});
describe("transición reversible de presentación", () => {
  it("conserva la posición al invertir y termina en la duración configurada a distintos FPS", () => {
    for (const fps of [15, 30, 60, 120]) {
      const blend = new ViewBlend();
      blend.set(1, 1);
      for (let i = 0; i < fps / 2; i++) blend.update(1 / fps);
      expect(blend.value).toBeGreaterThan(0.4);
      const halfway = blend.value;
      blend.set(0, 1);
      expect(blend.value).toBe(halfway);
      for (let i = 0; i < fps + 1; i++) blend.update(1 / fps);
      expect(blend.value).toBe(0);
      expect(blend.moving).toBe(false);
    }
  });
  it("ignora tiempos inválidos y no produce saltos cuando recibe el mismo objetivo", () => {
    const blend = new ViewBlend();
    blend.set(1, 1);
    blend.update(0.4);
    const current = blend.value;
    blend.set(1, 1);
    blend.update(NaN);
    blend.update(-1);
    expect(blend.value).toBe(current);
    blend.update(0.6);
    expect(blend.value).toBe(1);
  });
  it("la cámara termina a tiempo, puede volver a mitad de camino y conserva la inversión de coordenadas", () => {
    const world = new Container(),
      camera = new Camera(world);
    camera.goTo({ x: 780, y: 355, zoom: 3 }, false, 1);
    camera.update(0.5);
    const midpoint = { ...camera.current };
    expect(midpoint.zoom).toBeGreaterThan(1);
    expect(midpoint.zoom).toBeLessThan(3);
    camera.goTo({ x: 640, y: 360, zoom: 1 }, false, 1);
    expect(camera.current).toEqual(midpoint);
    camera.update(1);
    expect(camera.current).toEqual({ x: 640, y: 360, zoom: 1 });
    expect(camera.transitioning).toBe(false);
    camera.goTo({ x: 780, y: 355, zoom: 3 }, false, 1);
    for (let i = 0; i < 61; i++) camera.update(1 / 60);
    expect(camera.settled).toBe(true);
    const point = camera.toWorld(640, 360);
    expect(point.x).toBeCloseTo(camera.current.x, 8);
    expect(point.y).toBeCloseTo(camera.current.y, 8);
  });
  it("la rueda interrumpe el viaje finito y conserva su anclaje al cursor", () => {
    const camera = new Camera(new Container());
    camera.goTo({ x: 780, y: 355, zoom: 3 }, false, 1);
    camera.update(0.5);
    const p = camera.toWorld(670, 340);
    camera.zoomAt(670, 340, 1.2);
    expect(camera.transitioning).toBe(false);
    for (let i = 0; i < 60; i++) {
      camera.update(1 / 60);
      expect(camera.toWorld(670, 340).x).toBeCloseTo(p.x, 7);
      expect(camera.toWorld(670, 340).y).toBeCloseTo(p.y, 7);
    }
  });
});
