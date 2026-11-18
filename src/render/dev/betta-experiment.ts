import "./betta-experiment.css";
import { loadIllustratedBettaArt } from "./illustrated-betta-art";
import { IllustratedBetta } from "./illustrated-betta";
import { texts } from "../ui/texts";
/** Loaded exclusively behind import.meta.env.DEV; no persistent player preference. */
export class BettaExperiment {
  private readonly root = document.createElement("aside");
  private readonly selection = document.createElement("select");
  private readonly note = document.createElement("small");
  private art: Awaited<ReturnType<typeof loadIllustratedBettaArt>> | undefined;
  constructor() {
    const t = texts.bettaIllustrated;
    this.root.className = "betta-experiment";
    this.root.setAttribute("aria-label", t.label);
    const label = document.createElement("label");
    label.textContent = t.style + " ";
    this.selection.setAttribute("aria-label", t.style);
    for (const [value, name] of [
      ["current", t.current],
      ["illustrated", t.illustrated],
    ]) {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = name!;
      this.selection.append(option);
    }
    this.selection.disabled = true;
    label.append(this.selection);
    const open = document.createElement("button");
    open.textContent = t.open;
    open.type = "button";
    open.onclick = () => {
      void import("./betta-comparison")
        .then(({ openBettaComparison }) => openBettaComparison())
        .catch(() => {
          this.note.textContent = t.error;
        });
    };
    this.note.textContent = t.loading;
    this.root.append(label, open, this.note);
    document.body.append(this.root);
    void loadIllustratedBettaArt()
      .then((art) => {
        this.art = art;
        this.selection.disabled = false;
        this.note.textContent = t.devNote;
      })
      .catch(() => {
        this.note.textContent = t.error;
      });
  }
  get illustrated(): boolean {
    return this.selection.value === "illustrated" && this.art !== undefined;
  }
  create(id: number, facing: number): IllustratedBetta | undefined {
    return this.art ? new IllustratedBetta(id, facing, this.art) : undefined;
  }
}
