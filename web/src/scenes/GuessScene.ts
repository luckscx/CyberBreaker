import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { KeyButton } from "@/components/KeyButton";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { playClick } from "@/audio/click";
import { evaluate, generateSecret, isValidGuess } from "@/logic/guess";

const SLOT_SIZE = 60;
const SLOT_GAP = 8;
const RADIUS = 8;

// 密码盘：3 行 4 列，键尺寸与间距
const KEY_SIZE = 70;
const KEY_GAP = 8;
const KEYPAD_COLS = 3;
const KEYPAD_ROWS = 4;
const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; // 显示顺序
const KEYPAD_FILL = 0x1a2636;
const KEYPAD_FILL_HOVER = 0x2a3648;

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
  private digitButtons: KeyButton[] = [];
  private gameEnded = false;
  private bg: Background;

  constructor(private app: Application, opts: GuessSceneOptions) {
    super();
    this.secret = generateSecret();

    // Add animated background
    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
      particleCount: 25,
    });
    this.addChild(this.bg);

    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;

    // 顶部按钮区域
    const topMargin = 20;
    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => {
        opts.onBack();
      },
    });
    this.addChild(backButton);

    const toggleSize = 48;
    const musicToggle = new MusicToggle({
      x: w - 16 - toggleSize,
      y: 16,
    });
    this.addChild(musicToggle);

    // 标题区域
    const title = new Text({
      text: "教学模式",
      style: { fontFamily: "system-ui", fontSize: 24, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = topMargin + 40;
    this.addChild(title);

    // 游戏规则说明 - 简化版
    const rulesText = new Text({
      text: "🎯 猜出4位不重复数字\n💡 A=位置正确  B=数字正确位置错",
      style: {
        fontFamily: "system-ui",
        fontSize: 12,
        fill: 0xaaaaaa,
        align: "center",
        lineHeight: 18,
      },
    });
    rulesText.anchor.set(0.5, 0);
    rulesText.x = cx;
    rulesText.y = topMargin + 75;
    this.addChild(rulesText);

    // 插槽区域
    this.slotContainer = this._buildSlotRow();
    this.slotContainer.x = cx - (4 * SLOT_SIZE + 3 * SLOT_GAP) / 2 + SLOT_SIZE / 2 + SLOT_GAP / 2;
    this.slotContainer.y = topMargin + 150;
    this.addChild(this.slotContainer);

    // 键盘区域 - 调整为3列4行适配竖屏
    const keypadY = topMargin + 235;
    const keypadW = KEYPAD_COLS * KEY_SIZE + (KEYPAD_COLS - 1) * KEY_GAP;
    const keypadContainer = new Container();
    keypadContainer.x = cx - keypadW / 2 + KEY_SIZE / 2;
    keypadContainer.y = keypadY;

    // Enhanced panel with shadow and glow
    const panelShadow = new Graphics();
    panelShadow.roundRect(-KEY_GAP - KEY_SIZE / 2 + 4, -KEY_GAP - KEY_SIZE / 2 + 4, keypadW + KEY_GAP * 2, KEYPAD_ROWS * KEY_SIZE + (KEYPAD_ROWS - 1) * KEY_GAP + KEY_GAP * 2, 16).fill({
      color: 0x000000,
      alpha: 0.3,
    });
    keypadContainer.addChild(panelShadow);

    const panel = new Graphics();
    panel.roundRect(-KEY_GAP - KEY_SIZE / 2, -KEY_GAP - KEY_SIZE / 2, keypadW + KEY_GAP * 2, KEYPAD_ROWS * KEY_SIZE + (KEYPAD_ROWS - 1) * KEY_GAP + KEY_GAP * 2, 16).fill({ color: 0x0d1219 });
    panel.roundRect(-KEY_GAP - KEY_SIZE / 2, -KEY_GAP - KEY_SIZE / 2, keypadW + KEY_GAP * 2, KEYPAD_ROWS * KEY_SIZE + (KEYPAD_ROWS - 1) * KEY_GAP + KEY_GAP * 2, 16).stroke({
      width: 2,
      color: 0x1e2a3a,
      alpha: 0.5,
    });
    keypadContainer.addChild(panel);

    // 数字键 1-9 排成3x3，0单独在最后
    KEYPAD_DIGITS.forEach((digit, i) => {
      const row = Math.floor(i / KEYPAD_COLS);
      const col = i % KEYPAD_COLS;
      const btn = new KeyButton({
        label: String(digit),
        width: KEY_SIZE,
        height: KEY_SIZE,
        fontSize: 28,
        onClick: () => {
          this._addDigit(digit);
        },
      });
      btn.x = col * (KEY_SIZE + KEY_GAP);
      btn.y = row * (KEY_SIZE + KEY_GAP);
      keypadContainer.addChild(btn);
      this.digitButtons.push(btn);
    });
    this.addChild(keypadContainer);

    // 操作按钮区域 - 退格和确认
    const actionY = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 15;
    const backspace = new Button({
      label: "⌫ 退格",
      width: 110,
      onClick: () => {
        this._backspace();
      },
    });
    backspace.x = cx - 60;
    backspace.y = actionY;
    this.addChild(backspace);

    const confirm = new Button({
      label: "✓ 确认",
      width: 110,
      onClick: () => {
        this._confirm();
      },
    });
    confirm.x = cx + 60;
    confirm.y = actionY;
    this.addChild(confirm);

    // 结果文本
    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 18, fill: 0x88ff88, fontWeight: "bold" },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = actionY + 50;
    this.addChild(this.resultText);

    // 历史记录
    this.historyText = new Text({
      text: "历史记录：",
      style: { fontFamily: "Courier New, monospace", fontSize: 13, fill: 0xaaaaaa },
    });
    this.historyText.anchor.set(0.5, 0);
    this.historyText.x = cx;
    this.historyText.y = actionY + 80;
    this.addChild(this.historyText);

    this._refreshSlots();

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  private _animate = (): void => {
    this.bg.animate();
  };

  private _buildSlotRow(): Container {
    const c = new Container();
    for (let i = 0; i < 4; i++) {
      // Glow layer
      const glow = new Graphics();
      glow.roundRect(-SLOT_SIZE / 2 - 2, -SLOT_SIZE / 2 - 2, SLOT_SIZE + 4, SLOT_SIZE + 4, RADIUS + 2).fill({
        color: 0x00ffcc,
        alpha: 0,
      });
      glow.x = i * (SLOT_SIZE + SLOT_GAP);
      glow.name = `glow-${i}`;
      c.addChild(glow);

      const box = new Graphics();
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: 0x1a2332 });
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({ width: 2, color: 0x334455 });
      box.x = i * (SLOT_SIZE + SLOT_GAP);
      box.name = `box-${i}`;
      c.addChild(box);

      const text = new Text({
        text: "?",
        style: {
          fontFamily: "system-ui",
          fontSize: 26,
          fill: 0x00ffcc,
          dropShadow: {
            color: 0x00ffcc,
            blur: 6,
            alpha: 0.4,
            distance: 0,
          },
        },
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
      const box = this.slotContainer.getChildByName(`box-${i}`) as Graphics;
      const glow = this.slotContainer.getChildByName(`glow-${i}`) as Graphics;

      if (t) t.text = digits[i] ?? "?";

      // Animate active slot
      if (box) {
        box.clear();
        const isActive = i === digits.length && digits.length < 4;
        const fillColor = isActive ? 0x1e2a3c : 0x1a2332;
        const strokeColor = isActive ? 0x00ffcc : 0x334455;
        const strokeWidth = isActive ? 2 : 2;

        box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: fillColor });
        box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({
          width: strokeWidth,
          color: strokeColor,
          alpha: isActive ? 0.8 : 0.3,
        });

        if (glow && isActive) {
          glow.alpha = 0.3;
        } else if (glow) {
          glow.alpha = 0;
        }
      }
    }
    this.digitButtons.forEach((btn, i) => {
      const digit = KEYPAD_DIGITS[i];
      btn.visible = !this.currentGuess.includes(String(digit));
    });
  }

  private _addDigit(d: number): void {
    if (this.gameEnded) return;
    if (this.currentGuess.length >= 4) return;
    if (this.currentGuess.includes(String(d))) return;
    this.currentGuess += d;
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _backspace(): void {
    if (this.gameEnded) return;
    this.currentGuess = this.currentGuess.slice(0, -1);
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _confirm(): void {
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
      this.resultText.text = "猜中了！";
      this.resultText.style.fill = 0x00ff88;
      return;
    }
    this.resultText.text = `→ ${a}A${b}B`;
    this.resultText.style.fill = 0x88ff88;
  }

  private _updateHistoryText(): void {
    const lines = this.history.map(({ guess, a, b }) => `${guess} → ${a}A${b}B`);
    this.historyText.text = "历史记录：\n" + lines.slice(-6).join("\n");
  }
}
