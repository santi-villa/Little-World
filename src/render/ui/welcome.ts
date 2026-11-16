/**
 * Resumen de bienvenida: lo que pasó mientras no estabas. Es HTML común
 * encima del canvas, como el panel de debug.
 */

import type { WelcomeSummary } from '../../sim';
import { texts } from './texts';

export class WelcomePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly list: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'welcome';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    const card = document.createElement('div');
    card.className = 'welcome-card';
    this.title = document.createElement('h2');
    this.list = document.createElement('ul');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'welcome-close';
    close.textContent = texts.welcome.close;
    close.addEventListener('click', () => this.hide());
    card.append(this.title, this.list, close);
    this.root.append(card);
    // Tocar afuera de la tarjeta también lo cierra.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.hide();
    });
    parent.append(this.root);
  }

  show(summary: WelcomeSummary): void {
    this.title.textContent = summary.title;
    this.list.replaceChildren(
      ...summary.lines.map((line) => {
        const item = document.createElement('li');
        item.className = `tone-${line.tone}`;
        item.textContent = line.text;
        return item;
      }),
    );
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
