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
  private _loading = false;
  private _loadDone = false;

  onLoad() {
    GameAudio._ins = this;
    this._source = this.getComponent(AudioSource) ?? this.addComponent(AudioSource);
  }

  onDestroy() {
    if (GameAudio._ins === this) GameAudio._ins = null;
  }

  private loadAll(cb?: () => void) {
    if (this._loadDone) { cb?.(); return; }
    if (this._loading) {
      const check = () => {
        if (this._loadDone) cb?.();
        else this.scheduleOnce(check, 0.1);
      };
      this.scheduleOnce(check, 0.1);
      return;
    }
    this._loading = true;
    const keys = Object.keys(PATHS) as (keyof typeof PATHS)[];
    let done = 0;
    const onOne = () => {
      done++;
      if (done >= keys.length) {
        this._loading = false;
        this._loadDone = true;
        cb?.();
      }
    };
    keys.forEach((key) => {
      resources.load(PATHS[key], AudioClip, (err, clip) => {
        if (!err && clip) this._clips[key] = clip;
        onOne();
      });
    });
  }

  private play(key: keyof typeof PATHS, volume = 1) {
    if (!this._loadDone) {
      this.loadAll(() => this.play(key, volume));
      return;
    }
    const clip = this._clips[key];
    if (this._source && clip) this._source.playOneShot(clip, volume);
  }

  static playClick() { GameAudio._ins?.play('click'); }
  static playBack() { GameAudio._ins?.play('back'); }
  static playConfirm() { GameAudio._ins?.play('confirm'); }
  static playError() { GameAudio._ins?.play('error'); }
}
