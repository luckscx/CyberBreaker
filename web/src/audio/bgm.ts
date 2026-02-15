import { getContext } from "@/audio/context";

const BPM = 118;
const BEAT = 60 / BPM;
const LOOP_BEATS = 8;
const LOOP_DURATION = BEAT * LOOP_BEATS;

/** 8-bit 风格音高 (C4=261.63) */
const NOTE = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392,
  A4: 440,
  C5: 523.25,
} as const;

/** 旋律: [拍子偏移, 时长(拍), 频率] */
const MELODY: [number, number, number][] = [
  [0, 0.5, NOTE.C4],
  [0.5, 0.5, NOTE.E4],
  [1, 0.5, NOTE.G4],
  [1.5, 0.5, NOTE.E4],
  [2, 1, NOTE.C4],
  [3, 0.5, NOTE.G4],
  [3.5, 0.5, NOTE.A4],
  [4, 0.5, NOTE.G4],
  [4.5, 0.5, NOTE.E4],
  [5, 1, NOTE.C4],
  [6, 0.5, NOTE.E4],
  [6.5, 0.5, NOTE.G4],
  [7, 1, NOTE.C4],
];

/** 贝斯: 每拍根音 */
const BASS: [number, number, number][] = [
  [0, 2, NOTE.C3],
  [2, 2, NOTE.A3],
  [4, 2, NOTE.G3],
  [6, 2, NOTE.C3],
];

const BGM_VOLUME = 0.35;
let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let bgmPaused = false;

function scheduleNote(
  ctx: OfflineAudioContext,
  startBeat: number,
  durationBeat: number,
  freq: number,
  vol: number,
  dest: AudioNode
): void {
  const t0 = startBeat * BEAT;
  const dur = durationBeat * BEAT;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.setValueAtTime(vol, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function buildLoopBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (buffer) return Promise.resolve(buffer);
  const sr = ctx.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(LOOP_DURATION * sr), sr);
  for (const [beat, dur, freq] of MELODY) {
    scheduleNote(offline, beat, dur, freq, 0.12, offline.destination);
  }
  for (const [beat, dur, freq] of BASS) {
    scheduleNote(offline, beat, dur, freq, 0.2, offline.destination);
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
