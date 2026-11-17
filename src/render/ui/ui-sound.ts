/**
 * Sonidos suaves de la interfaz (opcionales): un roce de papel y un click de
 * madera, sintetizados con WebAudio (no hay archivos de sonido todavía).
 * Se apagan con localStorage `lw-sound` = "off" (más adelante, desde Ajustes).
 */

let ctx: AudioContext | null = null;

function enabled(): boolean {
  try {
    return localStorage.getItem('lw-sound') !== 'off';
  } catch {
    return true;
  }
}

function audio(): AudioContext | null {
  if (!enabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Roce de papel: un soplido de ruido corto y filtrado. */
export function playPaper(): void {
  const a = audio();
  if (!a) return;
  const length = Math.floor(a.sampleRate * 0.16);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / length);
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  filter.Q.value = 0.8;
  const gain = a.createGain();
  gain.gain.value = 0.045;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start();
}

/** Click de madera: un golpecito grave y muy corto. */
export function playClick(): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, a.currentTime + 0.06);
  gain.gain.setValueAtTime(0.06, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.08);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + 0.09);
}
