import allTexts from '../../data/texts.es.json';
import type { Game } from '../../game';
import { advice, suggestedFoodG } from '../../care';
import { defaultConfig, findSpecies, type SimAction } from '../../sim';
import { fill, formatClock, texts } from './texts';
import type { CareId } from './scene-ui';

const careText = allTexts.careUi;

type Page = 'status' | 'fish' | 'diary' | 'guide';
const button = (label: string, run: () => void): HTMLButtonElement => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', run); return b;
};

/** Accessible HTML tools over the scene, also reachable without canvas gestures. */
export class AquariumPanel {
  private readonly dialog = document.createElement('dialog');
  private readonly body = document.createElement('div');
  private readonly heading = document.createElement('h2');
  private readonly statusButton: HTMLButtonElement;
  private page: Page | null = null;
  private lastKey = '';
  private opener: Element | null = null;
  constructor(private readonly game: Game) {
    const nav = document.createElement('nav');
    nav.className = 'aquarium-nav'; nav.setAttribute('aria-label', careText.herramientas_del_acuario);
    this.statusButton = button(careText.agua, () => this.open('status'));
    nav.append(this.statusButton, button(careText.peces, () => this.open('fish')),
      button(careText.diario, () => this.open('diary')), button(careText.guia, () => this.open('guide')));
    this.dialog.className = 'aquarium-dialog';
    this.heading.id = 'aquarium-title'; this.dialog.setAttribute('aria-labelledby', this.heading.id);
    const close = button(careText.volver_al_acuario, () => this.close()); close.className = 'aquarium-close';
    this.dialog.append(this.heading, this.body, close);
    this.dialog.addEventListener('close', () => { this.page = null; if (this.opener instanceof HTMLElement) this.opener.focus(); });
    document.body.append(nav, this.dialog);
    if (game.player.tutorial < 4) this.open('guide');
  }
  close(): void { this.dialog.close(); }
  open(page: Page): void {
    this.page = page; this.render();
    if (!this.dialog.open) { this.opener = document.activeElement; this.dialog.showModal(); }
  }
  private title(text: string): void { this.heading.textContent = text; this.body.replaceChildren(); this.dialog.scrollTop = 0; }
  private paragraph(text: string, parent: HTMLElement = this.body): void {
    const p = document.createElement('p'); p.textContent = text; parent.append(p);
  }
  private act(action: SimAction): void { this.game.act(action); this.render(); }
  private nextGuide(): void {
    this.game.player.tutorial = Math.min(4, this.game.player.tutorial + 1);
    this.game.dirty = true; this.game.saveSoon = true; this.render();
  }
  update(): void {
    const state = this.game.state;
    const count = state.alerts.length;
    const label = count ? fill(careText.agua_avisos, { p0: count }) : careText.agua_sin_alertas;
    if (this.statusButton.textContent !== label) this.statusButton.textContent = label;
    this.statusButton.classList.toggle('has-alerts', count > 0);
    const key = state.alerts.join('|');
    if (key !== this.lastKey && this.page === 'status') this.render();
    this.lastKey = key;
  }
  private render(): void {
    if (this.page === 'fish') this.fish();
    else if (this.page === 'diary') this.diary();
    else if (this.page === 'guide') this.guide();
    else this.status();
  }
  private status(): void {
    const s = this.game.state;
    this.title(careText.como_esta_tu_acuario);
    this.paragraph(careText.estas_lecturas_corresponden_al_momento_en);
    this.paragraph(fill(careText.l_c_ph, { p0: s.tank.waterLiters.toFixed(1), p1: s.water.temperatureC.toFixed(1), p2: s.water.ph.toFixed(1) }));
    this.paragraph(fill(careText.amoniaco_total_ppm_nitrito_ppm_nitrato, { p0: s.water.ammonia.toFixed(2), p1: s.water.nitrite.toFixed(2), p2: s.water.nitrate.toFixed(1) }));
    this.paragraph(fill(careText.oxigeno_mg_l_kh_dkh_caudal, { p0: s.water.oxygen.toFixed(1), p1: s.water.kh.toFixed(1), p2: s.filter.running ? 'encendido' : 'apagado' }));
    if (!s.cycle.established) this.paragraph(careText.el_ciclo_todavia_no_esta_confirmado);
    if (!s.alerts.length) this.paragraph(careText.no_hay_alertas_activas_observa_tambien);
    for (const id of s.alerts) {
      const section = document.createElement('section');
      const h = document.createElement('h3'); h.textContent = texts.alerts[id]; section.append(h);
      this.paragraph(advice[id], section); this.body.append(section);
    }
    this.body.append(button(careText.volver_a_medir, () => this.status()));
    if (!s.filter.running && s.filter.flowLph > 0) this.body.append(button(careText.encender_filtro, () => this.act({ type: 'setFilterRunning', running: true })));
    if (s.water.chlorine > 0) this.body.append(button(careText.agregar_acondicionador, () => this.act({ type: 'addConditioner' })));
    this.body.append(button(careText.cambio_parcial_de_agua, () => this.care('waterChange')),
      button(careText.revisar_filtro, () => this.care('cleanFilter')));
  }
  care(id: CareId): void {
    if (!this.dialog.open) { this.opener = document.activeElement; this.dialog.showModal(); }
    this.page = null;
    const s = this.game.state;
    this.title(texts.scene.care[id]);
    let action: () => SimAction;
    let enabled = true;
    if (id === 'feed') {
      const amount = suggestedFoodG(s);
      enabled = amount > 0.0001;
      this.paragraph(careText.una_porcion_chica_calculada_segun_los);
      this.paragraph(fill(careText.porcion_sugerida_g_comida_todavia_en, { p0: amount.toFixed(3), p1: (s.food.surfaceG + s.food.sinkingG).toFixed(3) }));
      const select = document.createElement('select'); select.setAttribute('aria-label', careText.tamano_de_porcion);
      for (const [v, label] of [[0.5, careText.media_porcion], [1, careText.porcion_sugerida]] as const) {
        const option = document.createElement('option'); option.value = String(v); option.textContent = label; select.append(option);
      }
      select.value = '1'; this.body.append(select);
      if (!enabled) this.paragraph(careText.por_ahora_no_hace_falta_mas);
      action = () => ({ type: 'feed', grams: suggestedFoodG(this.game.state) * Number(select.value) });
    } else if (id === 'waterChange') {
      this.paragraph(careText.el_agua_nueva_se_acondiciona_y);
      const select = document.createElement('select'); select.setAttribute('aria-label', careText.cantidad_de_agua_a_cambiar);
      for (const fraction of [0.1, 0.25]) {
        const option = document.createElement('option'); option.value = String(fraction);
        option.textContent = fill(careText.l, { p0: fraction * 100, p1: (s.tank.waterLiters * fraction).toFixed(1) }); select.append(option);
      }
      select.value = '0.25'; this.body.append(select);
      action = () => ({ type: 'waterChange', fraction: Number(select.value), conditioned: true, vacuum: true, temperatureC: this.game.state.water.temperatureC });
    } else if (id === 'cleanFilter') {
      enabled = s.filter.mediaCapacity > 0 && s.filter.clog >= defaultConfig.thresholds.filterClogged;
      this.paragraph(fill(careText.obstruccion, { p0: Math.round(s.filter.clog * 100), p1: enabled ? 'El caudal necesita ayuda.' : 'No hace falta limpiar ahora.' }));
      this.paragraph(careText.el_material_aloja_bacterias_utiles_solo);
      action = () => ({ type: 'cleanFilter', method: 'tankWater' });
    } else if (id === 'topOff') {
      enabled = s.tank.fullLiters - s.tank.waterLiters > 0.01;
      this.paragraph(fill(careText.faltan_l_se_usara_agua_acondicionada, { p0: (s.tank.fullLiters - s.tank.waterLiters).toFixed(2) }));
      action = () => ({ type: 'topOff', conditioned: true, temperatureC: this.game.state.water.temperatureC });
    } else if (id === 'removeDead') {
      this.paragraph(careText.retirar_los_animales_muertos_evita_que);
      action = () => ({ type: 'removeDead' });
    } else {
      this.paragraph(careText.se_retiran_algas_del_vidrio_si);
      action = () => ({ type: 'cleanGlass' });
    }
    const confirm = button(careText.aplicar_cuidado, () => {
      // Recheck against the current state, not a stale dialog snapshot.
      if (id === 'cleanFilter' && this.game.state.filter.clog < defaultConfig.thresholds.filterClogged) return this.care(id);
      const selected = action();
      if (selected.type === 'feed' && selected.grams <= 0.0001) return this.care(id);
      this.game.act(selected);
      if (id === 'feed' && this.game.player.tutorial === 2) { this.nextGuide(); this.open('guide'); }
      else { this.page = 'status'; this.status(); this.paragraph(careText.cuidado_realizado_observa_como_responden_el); }
    });
    confirm.disabled = !enabled; this.body.append(confirm);
  }
  private fish(): void {
    this.title(careText.conoce_a_tus_peces);
    if (!this.game.state.animals.length) this.paragraph(careText.todavia_no_hay_animales_en_esta);
    for (const a of this.game.state.animals) {
      const card = document.createElement('section');
      const species = findSpecies(a.speciesId);
      const h = document.createElement('h3'); h.textContent = a.name || species?.name || a.speciesId; card.append(h);
      this.paragraph(fill(careText.dias, { p0: species?.name ?? a.speciesId, p1: Math.floor(a.ageDays), p2: a.alive ? texts.moods[a.mood] : 'Falleció' }), card);
      this.paragraph(fill(careText.hambre_estres_salud, { p0: Math.round(a.hunger * 100), p1: Math.round(a.stress), p2: Math.round(a.health) }), card);
      this.paragraph(a.feedingTrust > 0.4 ? careText.ya_esta_aprendiendo_que_tu_presencia : careText.todavia_se_esta_acostumbrando_a_vos, card);
      const form = document.createElement('form');
      const input = document.createElement('input'); input.maxLength = 24; input.value = a.name ?? ''; input.placeholder = careText.un_nombre_para_tu_pez;
      input.setAttribute('aria-label', fill(careText.nombre_de, { p0: species?.name ?? 'animal', p1: a.id }));
      const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = careText.guardar_nombre;
      form.append(input, submit);
      form.addEventListener('submit', event => {
        event.preventDefault(); this.game.act({ type: 'nameAnimal', id: a.id, name: input.value });
        this.game.note(fill(careText.ya_tiene_su_lugar_en_el, { p0: input.value.trim().slice(0, 24) || species?.name || 'Tu pez' }));
        if (this.game.player.tutorial === 1) { this.nextGuide(); this.open('guide'); } else this.fish();
      });
      card.append(form); this.body.append(card);
    }
  }
  private diary(): void {
    this.title(careText.diario_del_acuarista);
    this.paragraph(careText.lo_que_paso_y_lo_que);
    const list = document.createElement('ol');
    for (const entry of this.game.player.journal) {
      const li = document.createElement('li');
      const time = document.createElement('small'); time.textContent = formatClock(entry.timeMinutes);
      li.append(time); this.paragraph(entry.text, li); list.append(li);
    }
    if (!list.children.length) this.paragraph(careText.los_proximos_cuidados_y_cambios_del);
    this.body.append(list);
  }
  private guide(): void {
    const stage = this.game.player.tutorial;
    this.title(stage < 4 ? fill(careText.tu_primer_acuario_de, { p0: stage + 1 }) : careText.una_rutina_tranquila);
    if (stage === 0) {
      this.paragraph(careText.bienvenido_a_tu_habitacion_un_amigo);
      this.paragraph(careText.esas_bacterias_transforman_amoniaco_en_nitrito);
      this.body.append(button(careText.conocer_a_mi_pez, () => { this.nextGuide(); this.open('fish'); }));
    } else if (stage === 1) {
      this.paragraph(careText.elegi_un_nombre_para_tu_betta);
      this.body.append(button(careText.abrir_ficha, () => this.open('fish')), button(careText.elegir_nombre_despues, () => this.nextGuide()));
    } else if (stage === 2) {
      this.paragraph(careText.ofrece_una_porcion_pequena_espera_a);
      this.body.append(button(careText.preparar_primera_porcion, () => this.care('feed')), button(careText.ya_comio_seguir_observando, () => this.nextGuide()));
    } else if (stage === 3) {
      this.paragraph(careText.ahora_mira_como_busca_la_comida);
      this.paragraph(careText.toca_la_pecera_para_acercarte_o);
      this.body.append(button(careText.dejarlo_explorar, () => { this.nextGuide(); this.game.note(careText.primera_visita_observar_medir_y_cuidar); this.close(); }));
    } else {
      this.paragraph(careText.observa_primero_alimenta_en_pequenas_porciones);
      this.paragraph(careText.el_agua_nueva_necesita_acondicionador_y);
      this.paragraph(careText.la_habitacion_sigue_viviendo_cuando_cerras);
      this.body.append(button(careText.leer_sobre_el_ciclo, () => this.status()));
    }
  }
}
