import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { playClick } from "@/audio/click";
import { isBgmPaused, toggleBgmPaused } from "@/audio/bgm";
import { evaluate, generateSecret, isValidGuess } from "@/logic/guess";

const SLOT_SIZE = 52;
const SLOT_GAP = 12;
const RADIUS = 8;

// 密码盘：3 行 4 列，键尺寸与间距
const KEY_SIZE = 56;
const KEY_GAP = 10;
const KEYPAD_COLS = 4;
const KEYPAD_ROWS = 3;
const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; // 显示顺序
const KEYPAD_FILL = 0x1a2636;
const KEYPAD_FILL_HOVER = 0x2a3648;

const COUNTDOWN_SEC = 15;

export interface GuessSceneOptions {
  onBack: () => void;
}

interface HistoryItem {
  guess: string;
  a: number;
  b: number;
}

export class GuessScene extends Container {
  private secret: string;
  private currentGuess = "";
  private history: HistoryItem[] = [];
  private slotContainer: Container;
  private historyText: Text;
  private resultText: Text;
  private digitButtons: Button[] = [];
  private countdownText: Text;
  private remainingSec = COUNTDOWN_SEC;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private gameEnded = false;

  constructor(app: Application, opts: GuessSceneOptions) {
    super();
    this.secret = generateSecret();

    const w = app.screen.width;
    const cx = w / 2;

    const back = new Button({
      label: "返回",
      width: 72,
      onClick: () => opts.onBack(),
    });
    back.x = 60;
    back.y = 50;
    back.on("pointerdown", () => playClick());
    this.addChild(back);

    const margin = 16;
    const musicBtn = new Button({
      label: isBgmPaused() ? "音乐关" : "音乐开",
      width: 72,
      fontSize: 14,
      onClick: () => {
        playClick();
        toggleBgmPaused();
        musicBtn.setLabel(isBgmPaused() ? "音乐关" : "音乐开");
      },
    });
    musicBtn.x = w - margin - musicBtn.width / 2;
    musicBtn.y = margin + musicBtn.height / 2;
    this.addChild(musicBtn);

    const title = new Text({
      text: "猜数字",
      style: { fontFamily: "system-ui", fontSize: 28, fill: 0x00ffcc },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = 100;
    this.addChild(title);

    this.countdownText = new Text({
      text: String(COUNTDOWN_SEC),
      style: { fontFamily: "system-ui", fontSize: 22, fill: 0xffaa44 },
    });
    this.countdownText.anchor.set(0.5);
    this.countdownText.x = cx + 90;
    this.countdownText.y = 100;
    this.addChild(this.countdownText);

    const countdownLabel = new Text({
      text: "秒",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x888888 },
    });
    countdownLabel.anchor.set(0, 0.5);
    countdownLabel.x = cx + 105;
    countdownLabel.y = 100;
    this.addChild(countdownLabel);

    this.slotContainer = this._buildSlotRow();
    this.slotContainer.x = cx - (4 * SLOT_SIZE + 3 * SLOT_GAP) / 2 + SLOT_SIZE / 2 + SLOT_GAP / 2;
    this.slotContainer.y = 170;
    this.addChild(this.slotContainer);

    const keypadY = 250;
    const keypadW = KEYPAD_COLS * KEY_SIZE + (KEYPAD_COLS - 1) * KEY_GAP;
    const keypadContainer = new Container();
    keypadContainer.x = cx - keypadW / 2 + KEY_SIZE / 2;
    keypadContainer.y = keypadY;

    const panel = new Graphics();
    panel.roundRect(-KEY_GAP - KEY_SIZE / 2, -KEY_GAP - KEY_SIZE / 2, keypadW + KEY_GAP * 2, KEYPAD_ROWS * KEY_SIZE + (KEYPAD_ROWS - 1) * KEY_GAP + KEY_GAP * 2, 16).fill({ color: 0x0d1219 });
    panel.roundRect(-KEY_GAP - KEY_SIZE / 2, -KEY_GAP - KEY_SIZE / 2, keypadW + KEY_GAP * 2, KEYPAD_ROWS * KEY_SIZE + (KEYPAD_ROWS - 1) * KEY_GAP + KEY_GAP * 2, 16).stroke({ width: 1, color: 0x1e2a3a });
    keypadContainer.addChild(panel);

    KEYPAD_DIGITS.forEach((digit, i) => {
      const row = Math.floor(i / KEYPAD_COLS);
      const col = i % KEYPAD_COLS;
      const btn = new Button({
        label: String(digit),
        width: KEY_SIZE,
        height: KEY_SIZE,
        fontSize: 24,
        fillColor: KEYPAD_FILL,
        fillHover: KEYPAD_FILL_HOVER,
        onClick: () => {
          playClick();
          this._addDigit(digit);
        },
      });
      btn.x = col * (KEY_SIZE + KEY_GAP);
      btn.y = row * (KEY_SIZE + KEY_GAP);
      keypadContainer.addChild(btn);
      this.digitButtons.push(btn);
    });
    this.addChild(keypadContainer);

    const actionY = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 20;
    const backspace = new Button({
      label: "退格",
      width: 90,
      onClick: () => {
        playClick();
        this._backspace();
      },
    });
    backspace.x = cx - 100;
    backspace.y = actionY;
    this.addChild(backspace);

    const confirm = new Button({
      label: "确认",
      width: 90,
      onClick: () => {
        playClick();
        this._confirm();
      },
    });
    confirm.x = cx + 10;
    confirm.y = actionY;
    this.addChild(confirm);

    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 18, fill: 0x88ff88 },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = actionY + 56;
    this.addChild(this.resultText);

    this.historyText = new Text({
      text: "历史：",
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0xaaaaaa },
    });
    this.historyText.anchor.set(0.5, 0);
    this.historyText.x = cx;
    this.historyText.y = actionY + 90;
    this.addChild(this.historyText);

    this._refreshSlots();
    this._startTimer();
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this._stopTimer();
    super.destroy(options);
  }

  private _startTimer(): void {
    this._stopTimer();
    this.remainingSec = COUNTDOWN_SEC;
    this.countdownText.text = String(this.remainingSec);
    this.countdownText.style.fill = 0xffaa44;
    this.timerId = setInterval(() => this._tick(), 1000);
  }

  private _stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private _tick(): void {
    if (this.gameEnded) return;
    this.remainingSec--;
    this.countdownText.text = String(Math.max(0, this.remainingSec));
    if (this.remainingSec <= 5) this.countdownText.style.fill = 0xff6644;
    if (this.remainingSec <= 0) {
      this.gameEnded = true;
      this._stopTimer();
      this.resultText.text = "时间到！";
      this.resultText.style.fill = 0xff6644;
    }
  }

  private _buildSlotRow(): Container {
    const c = new Container();
    for (let i = 0; i < 4; i++) {
      const box = new Graphics();
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: 0x1a2332 });
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({ width: 1, color: 0x334455 });
      box.x = i * (SLOT_SIZE + SLOT_GAP);
      c.addChild(box);
      const text = new Text({
        text: "?",
        style: { fontFamily: "system-ui", fontSize: 26, fill: 0x00ffcc },
      });
      text.anchor.set(0.5);
      text.x = i * (SLOT_SIZE + SLOT_GAP);
      text.name = `slot-${i}`;
      c.addChild(text);
    }
    return c;
  }

  private _refreshSlots(): void {
    const digits = this.currentGuess.split("");
    for (let i = 0; i < 4; i++) {
      const t = this.slotContainer.getChildByName(`slot-${i}`) as Text;
      if (t) t.text = digits[i] ?? "?";
    }
    this.digitButtons.forEach((btn, i) => {
      const digit = KEYPAD_DIGITS[i];
      btn.visible = !this.currentGuess.includes(String(digit));
    });
  }

  private _addDigit(d: number): void {
    if (this.gameEnded || this.remainingSec <= 0) return;
    if (this.currentGuess.length >= 4) return;
    if (this.currentGuess.includes(String(d))) return;
    this.currentGuess += d;
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _backspace(): void {
    if (this.gameEnded || this.remainingSec <= 0) return;
    this.currentGuess = this.currentGuess.slice(0, -1);
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _confirm(): void {
    if (this.remainingSec <= 0) return;
    if (!isValidGuess(this.currentGuess)) {
      this.resultText.text = "请输入 4 位不重复数字";
      return;
    }
    const { a, b } = evaluate(this.secret, this.currentGuess);
    this.history.push({ guess: this.currentGuess, a, b });
    this.currentGuess = "";
    this._refreshSlots();
    this._updateHistoryText();
    if (a === 4) {
      this.gameEnded = true;
      this._stopTimer();
      this.resultText.text = "猜中了！";
      this.resultText.style.fill = 0x00ff88;
      return;
    }
    this.resultText.text = `→ ${a}A${b}B`;
    this.resultText.style.fill = 0x88ff88;
    this._startTimer();
  }

  private _updateHistoryText(): void {
    const lines = this.history.map(({ guess, a, b }) => `${guess} → ${a}A${b}B`);
    this.historyText.text = "历史：\n" + lines.join("\n");
  }
}
