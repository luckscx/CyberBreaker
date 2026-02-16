import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { evaluate, generateSecret, isValidGuess } from "@/logic/guess";

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
  private history: HistoryItem[] = [];
  private guessInput: GuessInput;
  private historyText: Text;
  private resultText: Text;
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
    const cx = w / 2;

    const top = 12;
    const backButton = new BackButton({
      x: 12,
      y: 12,
      onClick: () => opts.onBack(),
    });
    this.addChild(backButton);

    const toggleSize = 44;
    const musicToggle = new MusicToggle({
      x: w - 12 - toggleSize,
      y: 12,
    });
    this.addChild(musicToggle);

    const title = new Text({
      text: "教学模式",
      style: { fontFamily: "system-ui", fontSize: 20, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = top + 28;
    this.addChild(title);

    const rulesText = new Text({
      text: "🎯 4位不重复  💡 A=位置对 B=数字对位置错",
      style: {
        fontFamily: "system-ui",
        fontSize: 11,
        fill: 0x99aabb,
        align: "center",
      },
    });
    rulesText.anchor.set(0.5, 0);
    rulesText.x = cx;
    rulesText.y = top + 52;
    this.addChild(rulesText);

    this.guessInput = new GuessInput({
      slotSize: 48,
      slotGap: 6,
      keySize: 54,
      keyGap: 6,
      keyFontSize: 22,
      slotFontSize: 20,
      allowRepeat: false,
      actionWidth: 88,
      actionFontSize: 13,
      onSubmit: (guess) => this._confirm(guess),
    });
    this.guessInput.x = cx;
    this.guessInput.y = top + 72;
    this.addChild(this.guessInput);

    const resultY = top + 72 + this.guessInput.totalHeight + 4;
    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 15, fill: 0x88ff88, fontWeight: "bold" },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = resultY;
    this.addChild(this.resultText);

    this.historyText = new Text({
      text: "历史记录：",
      style: { fontFamily: "Courier New, monospace", fontSize: 12, fill: 0x99aabb },
    });
    this.historyText.anchor.set(0.5, 0);
    this.historyText.x = cx;
    this.historyText.y = resultY + 22;
    this.addChild(this.historyText);

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

  private _confirm(guess: string): void {
    if (this.gameEnded) return;
    if (!isValidGuess(guess)) {
      this.resultText.text = "请输入 4 位不重复数字";
      return;
    }
    const { a, b } = evaluate(this.secret, guess);
    this.history.push({ guess, a, b });
    this._updateHistoryText();
    if (a === 4) {
      this.gameEnded = true;
      this.guessInput.setEnabled(false);
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
