import { getContext } from "@/audio/context";

const BPM = 128; // 提升到更有能量的速度
const BEAT = 60 / BPM;
const LOOP_BEATS = 16; // 扩展到 16 拍
const LOOP_DURATION = BEAT * LOOP_BEATS;

/** 科技感音高 - 使用小调音阶 (A minor) */
const NOTE = {
  C2: 65.41,
  E2: 82.41,
  A2: 110,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  C5: 523.25,
  E5: 659.25,
  A5: 880,
} as const;

/** Lead 主旋律: Arpeggio 琶音 */
const LEAD: [number, number, number][] = [
  // Bar 1: Am arpeggio
  [0, 0.25, NOTE.A4],
  [0.25, 0.25, NOTE.C5],
  [0.5, 0.25, NOTE.E5],
  [0.75, 0.25, NOTE.C5],
  [1, 0.25, NOTE.A4],
  [1.25, 0.25, NOTE.C5],
  [1.5, 0.25, NOTE.E5],
  [1.75, 0.25, NOTE.A5],
  // Bar 2: F major arpeggio
  [2, 0.25, NOTE.F4],
  [2.25, 0.25, NOTE.A4],
  [2.5, 0.25, NOTE.C5],
  [2.75, 0.25, NOTE.A4],
  [3, 0.25, NOTE.F4],
  [3.25, 0.25, NOTE.A4],
  [3.5, 0.25, NOTE.C5],
  [3.75, 0.25, NOTE.F4],
  // Bar 3: G major arpeggio
  [4, 0.25, NOTE.G4],
  [4.25, 0.25, NOTE.D4],
  [4.5, 0.25, NOTE.G4],
  [4.75, 0.25, NOTE.D4],
  [5, 0.25, NOTE.G4],
  [5.25, 0.25, NOTE.D4],
  [5.5, 0.25, NOTE.G4],
  [5.75, 0.25, NOTE.D4],
  // Bar 4: E arpeggio
  [6, 0.25, NOTE.E4],
  [6.25, 0.25, NOTE.G4],
  [6.5, 0.25, NOTE.E4],
  [6.75, 0.25, NOTE.G4],
  [7, 0.5, NOTE.E4],
  [7.5, 0.5, NOTE.G4],
];

/** 旋律副歌 */
const MELODY: [number, number, number][] = [
  [8, 1, NOTE.A4],
  [9, 0.5, NOTE.G4],
  [9.5, 0.5, NOTE.A4],
  [10, 1, NOTE.C5],
  [11, 1, NOTE.E5],
  [12, 1, NOTE.F4],
  [13, 0.5, NOTE.G4],
  [13.5, 0.5, NOTE.A4],
  [14, 2, NOTE.C5],
];

/** 贝斯: 更有节奏感 */
const BASS: [number, number, number][] = [
  // Bar 1-2: A
  [0, 0.5, NOTE.A2],
  [0.75, 0.25, NOTE.A2],
  [1, 0.5, NOTE.A2],
  [1.75, 0.25, NOTE.A2],
  [2, 0.5, NOTE.F3],
  [2.75, 0.25, NOTE.F3],
  [3, 0.5, NOTE.F3],
  [3.75, 0.25, NOTE.F3],
  // Bar 3-4: G -> E
  [4, 0.5, NOTE.G3],
  [4.75, 0.25, NOTE.G3],
  [5, 0.5, NOTE.G3],
  [5.75, 0.25, NOTE.G3],
  [6, 0.5, NOTE.E3],
  [6.75, 0.25, NOTE.E3],
  [7, 0.5, NOTE.E3],
  [7.75, 0.25, NOTE.E3],
  // Repeat pattern
  [8, 0.5, NOTE.A2],
  [8.75, 0.25, NOTE.A2],
  [9, 0.5, NOTE.A2],
  [9.75, 0.25, NOTE.A2],
  [10, 0.5, NOTE.F3],
  [10.75, 0.25, NOTE.F3],
  [11, 0.5, NOTE.F3],
  [11.75, 0.25, NOTE.F3],
  [12, 0.5, NOTE.G3],
  [12.75, 0.25, NOTE.G3],
  [13, 0.5, NOTE.G3],
  [13.75, 0.25, NOTE.G3],
  [14, 0.5, NOTE.E3],
  [14.75, 0.25, NOTE.E3],
  [15, 0.5, NOTE.E3],
  [15.75, 0.25, NOTE.E3],
];

/** Pad 氛围音 */
const PAD: [number, number, number][] = [
  [0, 4, NOTE.A3],
  [0, 4, NOTE.C4],
  [0, 4, NOTE.E4],
  [4, 4, NOTE.G3],
  [4, 4, NOTE.D4],
  [8, 4, NOTE.A3],
  [8, 4, NOTE.C4],
  [8, 4, NOTE.E4],
  [12, 4, NOTE.G3],
  [12, 4, NOTE.D4],
];

const BGM_VOLUME = 0.15;
let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let bgmPaused = true; // 默认关闭音乐

/** 创建 Lead 合成器音色 (Sawtooth + Filter) */
function scheduleLead(
  ctx: OfflineAudioContext,
  startBeat: number,
  durationBeat: number,
  freq: number,
  dest: AudioNode
): void {
  const t0 = startBeat * BEAT;
  const dur = durationBeat * BEAT;

  // 双 Oscillator 加厚音色
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc1.type = "sawtooth";
  osc2.type = "sawtooth";
  osc1.frequency.setValueAtTime(freq, t0);
  osc2.frequency.setValueAtTime(freq * 1.01, t0); // 轻微 detune

  // Low-pass filter 营造柔和感
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2000, t0);
  filter.Q.setValueAtTime(1, t0);

  // ADSR Envelope
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.08, t0 + 0.005); // Attack
  gain.gain.linearRampToValueAtTime(0.05, t0 + 0.02); // Decay
  gain.gain.setValueAtTime(0.05, t0 + dur - 0.05); // Sustain
  gain.gain.linearRampToValueAtTime(0, t0 + dur); // Release

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc1.start(t0);
  osc2.start(t0);
  osc1.stop(t0 + dur);
  osc2.stop(t0 + dur);
}

/** 创建 Melody 音色 (Triangle + Vibrato) */
function scheduleMelody(
  ctx: OfflineAudioContext,
  startBeat: number,
  durationBeat: number,
  freq: number,
  dest: AudioNode
): void {
  const t0 = startBeat * BEAT;
  const dur = durationBeat * BEAT;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t0);

  // Vibrato (颤音)
  vibrato.frequency.setValueAtTime(5, t0);
  vibratoGain.gain.setValueAtTime(10, t0);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);

  // Envelope
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
  gain.gain.setValueAtTime(0.12, t0 + dur - 0.1);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(gain);
  gain.connect(dest);

  vibrato.start(t0);
  osc.start(t0);
  vibrato.stop(t0 + dur);
  osc.stop(t0 + dur);
}

/** 创建 Bass 音色 (Square + Sub) */
function scheduleBass(
  ctx: OfflineAudioContext,
  startBeat: number,
  durationBeat: number,
  freq: number,
  dest: AudioNode
): void {
  const t0 = startBeat * BEAT;
  const dur = durationBeat * BEAT;

  // 主 Bass
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t0);

  // Sub Bass (低八度)
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(freq / 2, t0);

  // 短促的 Envelope
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.25, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  subGain.gain.setValueAtTime(0, t0);
  subGain.gain.linearRampToValueAtTime(0.15, t0 + 0.005);
  subGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  osc.connect(gain);
  subOsc.connect(subGain);
  gain.connect(dest);
  subGain.connect(dest);

  osc.start(t0);
  subOsc.start(t0);
  osc.stop(t0 + dur);
  subOsc.stop(t0 + dur);
}

/** 创建 Pad 氛围音 (Sine + Reverb-like) */
function schedulePad(
  ctx: OfflineAudioContext,
  startBeat: number,
  durationBeat: number,
  freq: number,
  dest: AudioNode
): void {
  const t0 = startBeat * BEAT;
  const dur = durationBeat * BEAT;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, t0);
  filter.Q.setValueAtTime(0.5, t0);

  // 缓慢的 Fade in/out
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.03, t0 + dur * 0.3);
  gain.gain.setValueAtTime(0.03, t0 + dur * 0.7);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur);
}

function buildLoopBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (buffer) return Promise.resolve(buffer);
  const sr = ctx.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(LOOP_DURATION * sr), sr);

  // Layer 1: Lead Arpeggio
  for (const [beat, dur, freq] of LEAD) {
    scheduleLead(offline, beat, dur, freq, offline.destination);
  }

  // Layer 2: Melody
  for (const [beat, dur, freq] of MELODY) {
    scheduleMelody(offline, beat, dur, freq, offline.destination);
  }

  // Layer 3: Bass
  for (const [beat, dur, freq] of BASS) {
    scheduleBass(offline, beat, dur, freq, offline.destination);
  }

  // Layer 4: Pad
  for (const [beat, dur, freq] of PAD) {
    schedulePad(offline, beat, dur, freq, offline.destination);
  }

  return offline.startRendering().then((buf) => {
    buffer = buf;
    return buf;
  });
}

function getGainNode(ac: AudioContext): GainNode {
  if (!gainNode) {
    gainNode = ac.createGain();
    gainNode.gain.value = bgmPaused ? 0 : BGM_VOLUME;
    gainNode.connect(ac.destination);
  }
  return gainNode;
}

export function startBgm(): void {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  if (source) return;
  buildLoopBuffer(ac).then((buf) => {
    if (source) return;
    const acLive = getContext();
    if (!acLive) return;
    source = acLive.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(getGainNode(acLive));
    source.start(0);
  });
}

export function isBgmPaused(): boolean {
  return bgmPaused;
}

export function toggleBgmPaused(): boolean {
  bgmPaused = !bgmPaused;
  if (gainNode) gainNode.gain.value = bgmPaused ? 0 : BGM_VOLUME;
  return bgmPaused;
}

export function stopBgm(): void {
  if (source) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
    source = null;
  }
}

export function setBgmVolume(volume: number): void {
  if (gainNode && !bgmPaused) gainNode.gain.value = Math.max(0, Math.min(1, volume));
}
