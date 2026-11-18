import type { SimState, DerivedValues } from "../../sim";
import type { TankView } from "../tank/tank-view";
import { HybridTank } from "./hybrid-tank";
import { createHybridConfig } from "../motion/hybrid-tank-geometry";
import { texts } from "../ui/texts";
import "./hybrid-tank-dev.css";
/** Development-only A/B and visual parameter editor; no saves or simulation actions. */
export class HybridTankDev extends HybridTank {
  private readonly panel = document.createElement("details");
  private readonly stats = document.createElement("small");
  private readonly select = document.createElement("select");
  private readonly inputs: {
    input: HTMLInputElement;
    output: HTMLOutputElement;
    get: () => number;
  }[] = [];
  private exportedUrl: string | undefined;
  private statAt = 0;
  constructor(tank: TankView) {
    super(tank);
    const t = texts.hybridTank;
    this.panel.className = "hybrid-tank-dev";
    this.panel.setAttribute("aria-label", t.panel);
    const summary = document.createElement("summary");
    summary.textContent = t.panel;
    const body = document.createElement("div");
    body.className = "hybrid-tank-controls";
    const label = document.createElement("label");
    label.textContent = t.mode;
    this.select.setAttribute("aria-label", t.mode);
    for (const [value, name] of [
      ["current", t.current],
      ["hybrid", t.hybrid],
    ]) {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = name!;
      this.select.append(option);
    }
    this.select.value = this.config.mode;
    this.select.onchange = () => {
      this.config.mode = this.select.value as "current" | "hybrid";
    };
    label.append(this.select);
    body.append(label);
    const c = this.config;
    const entries: [
      string,
      number,
      number,
      number,
      () => number,
      (v: number) => void,
    ][] = [
      [
        t.positionX,
        -120,
        120,
        1,
        () => c.placement.x,
        (v) => (c.placement.x = v),
      ],
      [
        t.positionY,
        -60,
        60,
        1,
        () => c.placement.y,
        (v) => (c.placement.y = v),
      ],
      [
        t.scale,
        0.7,
        1.2,
        0.01,
        () => c.placement.scale,
        (v) => (c.placement.scale = v),
      ],
      [
        t.depth,
        0,
        1.6,
        0.02,
        () => c.geometry.depth,
        (v) => (c.geometry.depth = v),
      ],
      [
        t.angle,
        0,
        28,
        0.5,
        () => c.geometry.angleDeg,
        (v) => (c.geometry.angleDeg = v),
      ],
      [
        t.reflection,
        0,
        1,
        0.01,
        () => c.appearance.reflection,
        (v) => (c.appearance.reflection = v),
      ],
      [
        t.illumination,
        0,
        1,
        0.01,
        () => c.appearance.illumination,
        (v) => (c.appearance.illumination = v),
      ],
      [
        t.duration,
        0.35,
        2.5,
        0.05,
        () => c.transition.seconds,
        (v) => (c.transition.seconds = v),
      ],
    ];
    for (const [name, min, max, step, get, set] of entries) {
      const row = document.createElement("label"),
        input = document.createElement("input"),
        output = document.createElement("output");
      row.append(name);
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.setAttribute("aria-label", name);
      output.textContent = input.value;
      input.oninput = () => {
        const n = Number(input.value);
        if (Number.isFinite(n)) set(n);
        output.textContent = input.value;
      };
      row.append(input, output);
      body.append(row);
      this.inputs.push({ input, output, get });
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = t.reset;
    reset.onclick = () => {
      Object.assign(c, createHybridConfig());
      this.select.value = c.mode;
      for (const item of this.inputs) {
        item.input.value = String(item.get());
        item.output.textContent = item.input.value;
      }
    };
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = t.export;
    exportButton.onclick = () => {
      if (this.exportedUrl) URL.revokeObjectURL(this.exportedUrl);
      const json = JSON.stringify(this.config, null, 2) + "\n";
      this.exportedUrl = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = this.exportedUrl;
      link.download = "hybrid-tank.json";
      link.click();
    };
    const note = document.createElement("p");
    note.textContent = t.note;
    const help = document.createElement("small");
    help.textContent = t.exportHelp;
    body.append(reset, exportButton, note, this.stats, help);
    this.panel.append(summary, body);
    document.body.append(this.panel);
  }
  override update(state: SimState, derived: DerivedValues, dt: number): void {
    super.update(state, derived, dt);
    this.statAt += Math.max(0, dt);
    if (this.statAt < 0.2) return;
    this.statAt = 0;
    this.stats.textContent =
      this.config.mode === "hybrid" && !this.active
        ? texts.hybridTank.round
        : `${texts.hybridTank.status} · ${Math.round(this.progress * 100)}%`;
  }
  override destroy(): void {
    if (this.exportedUrl) URL.revokeObjectURL(this.exportedUrl);
    this.panel.remove();
    super.destroy();
  }
}
