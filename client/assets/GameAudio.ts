/**
 * 音效：从 resources/audio 加载 Kenney 免费音效并播放。
 * 资源来自 https://kenney.nl/assets/interface-sounds (CC0)
 */
import { _decorator, Component, AudioSource, AudioClip, resources } from 'cc';
const { ccclass } = _decorator;

const PATHS = {
  click: 'audio/click_001',
  back: 'audio/back_001',
  confirm: 'audio/confirmation_001',
  error: 'audio/error_001',
};

@ccclass('GameAudio')
export class GameAudio extends Component {
  private static _ins: GameAudio | null = null;
  private _source: AudioSource | null = null;
  private _clips: Partial<Record<keyof typeof PATHS, AudioClip>> = {};

  onLoad() {
    GameAudio._ins = this;
    this._source = this.getComponent(AudioSource) ?? this.addComponent(AudioSource);
    this.loadAll();
  }

  onDestroy() {
    if (GameAudio._ins === this) GameAudio._ins = null;
  }

  private loadAll() {
    (Object.keys(PATHS) as (keyof typeof PATHS)[]).forEach((key) => {
      resources.load(PATHS[key], AudioClip, (err, clip) => {
        if (!err && clip) this._clips[key] = clip;
      });
    });
  }

  private play(key: keyof typeof PATHS, volume = 1) {
    const clip = this._clips[key];
    if (this._source && clip) this._source.playOneShot(clip, volume);
  }

  static playClick() { GameAudio._ins?.play('click'); }
  static playBack() { GameAudio._ins?.play('back'); }
  static playConfirm() { GameAudio._ins?.play('confirm'); }
  static playError() { GameAudio._ins?.play('error'); }
}
