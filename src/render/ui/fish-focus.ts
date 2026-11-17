import type { AnimalState } from '../../sim';
import { getSpecies } from '../../sim';
import { texts } from './texts';
import { woodButton } from './paper-ui';
/** Small, accessible status rings. Values are exposed as text to assistive technology. */
export class FishFocus {
  readonly root = document.createElement('aside');
  private name = document.createElement('span');
  private rings = document.createElement('div');
  private key = '';
  constructor(details: () => void, back: () => void) {
    this.root.className = 'fish-focus';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', texts.observation.status);
    this.rings.className = 'fish-rings';
    this.root.append(
      this.name,
      this.rings,
      woodButton(texts.observation.details, details),
      woodButton(texts.observation.back, back),
    );
    document.body.append(this.root);
  }
  update(animal: AnimalState | undefined): void {
    this.root.hidden = !animal;
    document.body.classList.toggle('following-fish', !!animal);
    if (!animal) return;
    const values = [
      animal.health,
      animal.stress,
      animal.hunger * 100,
      animal.feedingTrust * 100,
      (1 - animal.finDamage) * 100,
    ].map((v) => Math.round(Math.max(0, Math.min(100, v))));
    const key = animal.id + '|' + animal.name + '|' + values.join();
    if (key === this.key) return;
    this.key = key;
    this.name.textContent = animal.name ?? getSpecies(animal.speciesId).name;
    this.rings.replaceChildren();
    const paths = [
      'M10 17L4 11C0 5 7 1 10 6C13 1 20 5 16 11Z',
      'M10 3L10 12M10 16L10 17',
      'M3 7Q10 2 17 7L17 15Q10 20 3 15Z',
      'M2 10Q10 0 18 10Q10 20 2 10ZM10 7L10 13',
      'M3 5Q19 10 3 15Z',
    ];
    for (const [i, value] of values.entries()) {
      const ring = document.createElement('span'),
        label = texts.observation.metrics[i]!;
      ring.className = 'fish-ring';
      ring.setAttribute('role', 'img');
      ring.setAttribute('aria-label', label + ': ' + value + '%');
      ring.title = label + ': ' + value + '%';
      const danger = i === 1 || i === 2 ? value > 65 : i === 0 && value < 50;
      ring.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#c2b79d" stroke-width="3"/><circle cx="20" cy="20" r="17" fill="none" stroke="${danger ? '#bd604a' : '#39877d'}" stroke-width="3" pathLength="100" stroke-dasharray="${value} 100" transform="rotate(-90 20 20)"/><path d="${paths[i]}" transform="translate(10 10)" fill="none" stroke="#5b3a24" stroke-width="1.7" stroke-linecap="round"/></svg>`;
      this.rings.append(ring);
    }
  }
}
