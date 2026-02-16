import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { BackButton } from "@/components/BackButton";
import { MusicToggle } from "@/components/MusicToggle";
import { FreeRoomClient, type FreeRoomMsg, type FreePlayerInfo, type FreeRanking } from "@/freeRoom/client";

export interface FreeGuessPlayOptions {
  app: Application;
  client: FreeRoomClient;
  guessLimit: number;
  players: FreePlayerInfo[];
  onBack: () => void;
  onGameOver: (msg: FreeRoomMsg) => void;
}

export class FreeGuessPlay extends Container {
  private app: Application;
  private client: FreeRoomClient;
  private guessLimit: number;
  private guessInput: GuessInput;
  private resultText: Text;
  private remainText: Text;
  private myHistoryContainer: Container;
  private publicContainer: Container;
  private unsub: (() => void) | null = null;
  private myHistory: { guess: string; a: number; b: number }[] = [];
  private ranking: FreeRanking[] = [];
  private players: FreePlayerInfo[] = [];
  private eliminated = false;

  constructor(private opts: FreeGuessPlayOptions) {
    super();
    this.app = opts.app;
    this.client = opts.client;
    this.guessLimit = opts.guessLimit;
    this.players = opts.players;

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;

    // Back & music
    const back = new BackButton({ x: 16, y: 16, onClick: () => opts.onBack() });
    this.addChild(back);
    const music = new MusicToggle({ x: w - 40, y: 16 });
    this.addChild(music);

    // Title
    const title = new Text({
      text: "多人猜数",
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx; title.y = 20;
    this.addChild(title);

    const limitHint = new Text({
      text: `每人 ${this.guessLimit} 次机会 | 4位数字可重复`,
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
    });
    limitHint.anchor.set(0.5);
    limitHint.x = cx; limitHint.y = 38;
    this.addChild(limitHint);

    // --- Public scoreboard (top area) ---
    const pubY = 54;
    const pubH = 68;
    const pubW = Math.min(340, w - 16);

    const pubBg = new Graphics();
    pubBg.roundRect(cx - pubW / 2, pubY, pubW, pubH, 8).fill({ color: 0x0d1520, alpha: 0.9 });
    pubBg.roundRect(cx - pubW / 2, pubY, pubW, pubH, 8).stroke({ width: 1, color: 0x334455 });
    this.addChild(pubBg);

    const pubLabel = new Text({
      text: "📊 实时排名",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x99aabb },
    });
    pubLabel.x = cx - pubW / 2 + 8;
    pubLabel.y = pubY + 4;
    this.addChild(pubLabel);

    this.publicContainer = new Container();
    this.publicContainer.x = cx - pubW / 2 + 8;
    this.publicContainer.y = pubY + 20;
    this.addChild(this.publicContainer);
    this._renderPublicBoard();

    // --- GuessInput ---
    const inputY = pubY + pubH + 6;
    this.guessInput = new GuessInput({
      slotSize: 44,
      slotGap: 6,
      keySize: 56,
      keyGap: 6,
      keyFontSize: 20,
      slotFontSize: 18,
      allowRepeat: true,
      confirmLabel: "✓ 提交",
      backspaceLabel: "⌫ 退格",
      actionWidth: 80,
      actionFontSize: 13,
      onSubmit: (guess) => this._submitGuess(guess),
    });
    this.guessInput.x = cx;
    this.guessInput.y = inputY;
    this.addChild(this.guessInput);

    // Remaining text
    this.remainText = new Text({
      text: `剩余 ${this.guessLimit} 次`,
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    this.remainText.anchor.set(0.5);
    this.remainText.x = cx;
    this.remainText.y = inputY + this.guessInput.totalHeight + 4;
    this.addChild(this.remainText);

    // Result text
    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0x88ff88 },
    });
    this.resultText.anchor.set(0.5);
    this.resultText.x = cx;
    this.resultText.y = inputY + this.guessInput.totalHeight + 20;
    this.addChild(this.resultText);

    // --- My history ---
    const histY = inputY + this.guessInput.totalHeight + 38;
    const histH = h - histY - 8;
    const histW = Math.min(340, w - 16);

    const histBg = new Graphics();
    histBg.roundRect(cx - histW / 2, histY, histW, histH, 8).fill({ color: 0x0d1520, alpha: 0.85 });
    histBg.roundRect(cx - histW / 2, histY, histW, histH, 8).stroke({ width: 1, color: 0x334455 });
    this.addChild(histBg);

    const histLabel = new Text({
      text: "我的历史记录",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x99aabb },
    });
    histLabel.x = cx - histW / 2 + 8;
    histLabel.y = histY + 4;
    this.addChild(histLabel);

    this.myHistoryContainer = new Container();
    this.myHistoryContainer.x = cx - histW / 2 + 8;
    this.myHistoryContainer.y = histY + 20;
    this.addChild(this.myHistoryContainer);

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.unsub?.();
    super.destroy(options);
  }

  private _onMsg(msg: FreeRoomMsg): void {
    if (msg.type === "guess_result") {
      this.myHistory.push({
        guess: msg.guess!,
        a: msg.a!,
        b: msg.b!,
      });
      this.remainText.text = `剩余 ${msg.remaining ?? 0} 次`;
      if (msg.remaining === 0) {
        this.eliminated = true;
        this.resultText.text = "次数已用完，等待其他玩家...";
        this.resultText.style.fill = 0xffaa44;
        this.guessInput.setEnabled(false);
      } else {
        this.resultText.text = `${msg.guess} → ${msg.a}A${msg.b}B`;
        this.resultText.style.fill = 0x88ff88;
      }
      this._renderMyHistory();
    }

    if (msg.type === "progress") {
      if (msg.ranking) this.ranking = msg.ranking;
      if (msg.players) {
        this.players = msg.players;
      }
      this._renderPublicBoard();
    }

    if (msg.type === "game_over") {
      this.eliminated = true;
      this.guessInput.setEnabled(false);
      this.opts.onGameOver(msg);
    }

    if (msg.type === "error") {
      this.resultText.text = msg.message ?? "错误";
      this.resultText.style.fill = 0xff6644;
    }
  }

  private _renderPublicBoard(): void {
    this.publicContainer.removeChildren();
    const list = this.ranking.length > 0 ? this.ranking : this.players.map((p, i) => ({
      ...p, rank: i + 1,
    }));

    const colWidths = [20, 80, 50, 60];
    // Header
    const headers = ["#", "玩家", "次数", "最佳"];
    headers.forEach((h, ci) => {
      const t = new Text({
        text: h,
        style: { fontFamily: "system-ui", fontSize: 10, fill: 0x668899 },
      });
      t.x = colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
      t.y = 0;
      this.publicContainer.addChild(t);
    });

    list.slice(0, 8).forEach((p, i) => {
      const y = 14 + i * 14;
      const isMe = p.playerId === this.client.playerId;
      const fill = isMe ? 0x00ffcc : 0xccddee;
      const vals = [
        String(p.rank),
        p.nickname.length > 6 ? p.nickname.slice(0, 6) + ".." : p.nickname,
        String(p.submitCount),
        `${p.bestScore}/4`,
      ];
      vals.forEach((v, ci) => {
        const t = new Text({
          text: v,
          style: { fontFamily: "system-ui", fontSize: 10, fill },
        });
        t.x = colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
        t.y = y;
        this.publicContainer.addChild(t);
      });
    });
  }

  private _renderMyHistory(): void {
    this.myHistoryContainer.removeChildren();
    const maxShow = 8;
    const start = Math.max(0, this.myHistory.length - maxShow);
    this.myHistory.slice(start).forEach((h, i) => {
      const t = new Text({
        text: `#${start + i + 1}  ${h.guess} → ${h.a}A${h.b}B`,
        style: { fontFamily: "system-ui", fontSize: 12, fill: h.a === 4 ? 0x00ff88 : 0x00ccaa },
      });
      t.y = i * 16;
      this.myHistoryContainer.addChild(t);
    });
  }

  private _submitGuess(guess: string): void {
    if (this.eliminated) return;
    this.client.submitGuess(guess);
  }
}
