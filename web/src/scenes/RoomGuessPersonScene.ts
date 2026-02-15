import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { Background } from "@/components/Background";
import { RoomClient, type RoomRole, type RoomMsg, type GpCandidateQuestion } from "@/room/client";

const TURN_SEC = 30;

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface RoomGuessPersonSceneOptions {
  app: Application;
  client: RoomClient;
  myRole: RoomRole;
  initialTurn: RoomRole;
  turnStartAt: number;
  totalQuestions: number;
  candidateQuestions: GpCandidateQuestion[];
  onBack: () => void;
  joinUrl?: string;
  /** 重连用 */
  gpQAHistory?: { question: string; answer: string; askedBy: RoomRole }[];
  gpWrongGuesses?: { role: RoomRole; name: string }[];
  gpAskedCount?: number;
  gpAllAsked?: boolean;
}

export class RoomGuessPersonScene extends Container {
  private app: Application;
  private client: RoomClient;
  private myRole: RoomRole;
  private turn: RoomRole;
  private turnStartAt: number;
  private totalQuestions: number;
  private askedCount = 0;
  private allAsked = false;
  private unsub: (() => void) | null = null;
  private tickerId: ReturnType<typeof setInterval> | null = null;
  private timeoutReported = false;
  private gameOver = false;

  // UI elements
  private bg: Background;
  private titleText: Text;
  private turnText: Text;
  private countdownText: Text;
  private candidateContainer: Container;
  private qaHistoryContainer: Container;
  private qaHistoryItems: { question: string; answer: string; askedBy: RoomRole }[] = [];
  private qaScrollOffset = 0;
  private resultText: Text;
  private wrongGuessesText: Text;
  private wrongGuesses: { role: RoomRole; name: string }[] = [];

  // HTML input for name guessing
  private nameInput: HTMLInputElement | null = null;
  private submitBtn: Button | null = null;

  // 猜错冷却
  private guessCooldown = false;
  private cooldownTimerId: ReturnType<typeof setInterval> | null = null;
  private cooldownText: Text | null = null;

  // Game over overlay
  private gameOverOverlay: Container | null = null;
  private gameOverStartTime = 0;
  private gameOverParticles: Particle[] = [];
  private gameOverTickerBound: ((ticker: { deltaMS: number }) => void) | null = null;

  constructor(opts: RoomGuessPersonSceneOptions) {
    super();
    const { app, client, myRole, initialTurn, turnStartAt, totalQuestions, candidateQuestions, onBack, joinUrl } = opts;
    this.app = app;
    this.client = client;
    this.myRole = myRole;
    this.turn = initialTurn;
    this.turnStartAt = turnStartAt;
    this.totalQuestions = totalQuestions;
    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;

    // Restore reconnect data
    if (opts.gpQAHistory) this.qaHistoryItems = [...opts.gpQAHistory];
    if (opts.gpWrongGuesses) this.wrongGuesses = [...opts.gpWrongGuesses];
    if (opts.gpAskedCount != null) this.askedCount = opts.gpAskedCount;
    if (opts.gpAllAsked) this.allAsked = opts.gpAllAsked;

    // Update browser URL
    if (joinUrl && typeof window !== "undefined") {
      try {
        const url = new URL(joinUrl);
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {}
    }

    // Background
    this.bg = new Background({ width: w, height: h, particleCount: 15 });
    this.addChild(this.bg);

    // Back button
    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => onBack(),
    });
    this.addChild(backButton);

    // Music toggle
    const musicToggle = new MusicToggle({ x: w - 16 - 48, y: 16 });
    this.addChild(musicToggle);

    // Title
    this.titleText = new Text({
      text: `猜人名 ${this.askedCount}/${this.totalQuestions}`,
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0x00ffcc, fontWeight: "bold" },
    });
    this.titleText.anchor.set(0.5);
    this.titleText.x = cx;
    this.titleText.y = 58;
    this.addChild(this.titleText);

    const ruleHint = new Text({
      text: "轮流选题获取线索，抢先猜对人名即获胜",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
    });
    ruleHint.anchor.set(0.5);
    ruleHint.x = cx;
    ruleHint.y = 78;
    this.addChild(ruleHint);

    // Turn indicator + countdown（与规则留出整行间距）
    this.turnText = new Text({
      text: this.turn === myRole ? "你来选题" : "对方选题",
      style: { fontFamily: "system-ui", fontSize: 14, fill: this.turn === myRole ? 0x00ffcc : 0xffaa44 },
    });
    this.turnText.anchor.set(0.5);
    this.turnText.x = cx - 45;
    this.turnText.y = 102;
    this.addChild(this.turnText);

    this.countdownText = new Text({
      text: String(TURN_SEC),
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0xffaa44 },
    });
    this.countdownText.anchor.set(0.5);
    this.countdownText.x = cx + 40;
    this.countdownText.y = 102;
    this.addChild(this.countdownText);

    const secLabel = new Text({
      text: "秒",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x888888 },
    });
    secLabel.anchor.set(0, 0.5);
    secLabel.x = cx + 52;
    secLabel.y = 102;
    this.addChild(secLabel);

    // Candidate questions area（与回合行、选题提示留足间距）
    this.candidateContainer = new Container();
    this.candidateContainer.y = 158;
    this.addChild(this.candidateContainer);
    this._renderCandidates(candidateQuestions);

    // Q&A history area (scrollable)
    const historyLabel = new Text({
      text: "── 已知线索 ──",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x668899 },
    });
    historyLabel.anchor.set(0.5);
    historyLabel.x = cx;
    historyLabel.y = 308;
    this.addChild(historyLabel);

    this.qaHistoryContainer = new Container();
    this.qaHistoryContainer.y = 326;
    this.addChild(this.qaHistoryContainer);
    this._renderQAHistory();

    // Result text (for errors / status)
    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xff6644 },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = h - 135;
    this.addChild(this.resultText);

    // Wrong guesses display
    this.wrongGuessesText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0xff6666 },
    });
    this.wrongGuessesText.anchor.set(0.5, 0);
    this.wrongGuessesText.x = cx;
    this.wrongGuessesText.y = h - 120;
    this.addChild(this.wrongGuessesText);
    this._renderWrongGuesses();

    // Name input (HTML overlay)
    this._createNameInput(app);

    // Submit button（缩小并右移，与输入框留出间隙）
    this.submitBtn = new Button({
      label: "提交猜测",
      width: 72,
      fontSize: 12,
      onClick: () => this._submitGuess(),
    });
    this.submitBtn.x = cx + 48;
    this.submitBtn.y = h - 38;
    this.addChild(this.submitBtn);

    // Cooldown text (shown after wrong guess)
    this.cooldownText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xff8844 },
    });
    this.cooldownText.anchor.set(0.5);
    this.cooldownText.x = cx;
    this.cooldownText.y = h - 62;
    this.addChild(this.cooldownText);

    // Start countdown & listen
    if (!this.allAsked) this._startCountdown();
    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.app.ticker.add(this._animate, this);
  }

  private _animate = (): void => {
    this.bg.animate();
  };

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    if (this.cooldownTimerId !== null) clearInterval(this.cooldownTimerId);
    if (this.gameOverTickerBound) this.app.ticker.remove(this.gameOverTickerBound);
    this.app.ticker.remove(this._animate, this);
    this.unsub?.();
    this._removeNameInput();
    super.destroy(options);
  }

  /* ── HTML Input ── */

  private _createNameInput(app: Application): void {
    const canvas = app.canvas as HTMLCanvasElement;
    const gameRoot = canvas.parentElement;
    if (!gameRoot) return;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "输入人名...";
    input.maxLength = 20;
    input.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-100%);
      margin-right: 10px;
      width: 120px;
      height: 28px;
      border: 1px solid #334455;
      border-radius: 6px;
      background: rgba(13, 21, 32, 0.95);
      color: #00ffcc;
      font-size: 13px;
      font-family: system-ui;
      padding: 0 8px;
      outline: none;
      z-index: 10;
      caret-color: #00ffcc;
    `;
    input.addEventListener("focus", () => {
      input.style.borderColor = "#00ffcc";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#334455";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitGuess();
    });

    gameRoot.style.position = "relative";
    gameRoot.appendChild(input);
    this.nameInput = input;
  }

  private _removeNameInput(): void {
    if (this.nameInput) {
      this.nameInput.remove();
      this.nameInput = null;
    }
  }

  /* ── Candidate Questions Rendering ── */

  private _renderCandidates(questions: GpCandidateQuestion[]): void {
    this.candidateContainer.removeChildren();
    const w = this.app.screen.width;
    const cx = w / 2;
    const cardW = Math.min(w - 40, 320);

    if (this.allAsked || questions.length === 0) {
      const noMore = new Text({
        text: "所有问题已用完，请猜测人名！",
        style: { fontFamily: "system-ui", fontSize: 13, fill: 0xffaa44 },
      });
      noMore.anchor.set(0.5);
      noMore.x = cx;
      noMore.y = 30;
      this.candidateContainer.addChild(noMore);
      return;
    }

    const isMyTurn = this.turn === this.myRole;
    const hint = new Text({
      text: isMyTurn ? "选择一个问题提问：" : "等待对方选题中...",
      style: { fontFamily: "system-ui", fontSize: 12, fill: isMyTurn ? 0x00ccaa : 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = cx;
    hint.y = 0;
    this.candidateContainer.addChild(hint);

    questions.forEach((q, i) => {
      const cardH = 36;
      const gap = 6;
      const y = 28 + i * (cardH + gap); // 28 让「选择一个问题提问」与第一张卡片有间距

      const card = new Container();
      card.x = cx;
      card.y = y;

      const bg = new Graphics();
      bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8)
        .fill({ color: isMyTurn ? 0x0d1a2a : 0x0d1520, alpha: 0.95 });
      bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8)
        .stroke({ width: 1, color: isMyTurn ? 0x225566 : 0x1a2832 });
      card.addChild(bg);

      const text = new Text({
        text: q.question,
        style: {
          fontFamily: "system-ui",
          fontSize: 13,
          fill: isMyTurn ? 0xccddee : 0x667788,
          wordWrap: true,
          wordWrapWidth: cardW - 24,
        },
      });
      text.anchor.set(0.5);
      card.addChild(text);

      if (isMyTurn && !this.gameOver) {
        card.eventMode = "static";
        card.cursor = "pointer";
        card.on("pointerover", () => {
          bg.tint = 0x22ccaa;
        });
        card.on("pointerout", () => {
          bg.tint = 0xffffff;
        });
        card.on("pointertap", () => {
          this._pickQuestion(q.id);
        });
      }

      this.candidateContainer.addChild(card);
    });
  }

  /* ── Q&A History Rendering ── */

  private _renderQAHistory(): void {
    this.qaHistoryContainer.removeChildren();
    const w = this.app.screen.width;
    const maxH = this.app.screen.height - 326 - 150; // Leave room for input area
    const colGap = 12;

    if (this.qaHistoryItems.length === 0) {
      const empty = new Text({
        text: "暂无线索",
        style: { fontFamily: "system-ui", fontSize: 11, fill: 0x445566 },
      });
      empty.anchor.set(0.5);
      empty.x = w / 2;
      empty.y = 8;
      this.qaHistoryContainer.addChild(empty);
      return;
    }

    // Show recent items (newest at top), limited by available space
    const maxVisible = Math.min(this.qaHistoryItems.length, Math.floor(maxH / 28));
    const startIdx = Math.max(0, this.qaHistoryItems.length - maxVisible);

    for (let i = startIdx; i < this.qaHistoryItems.length; i++) {
      const item = this.qaHistoryItems[i];
      const displayIdx = i - startIdx;
      const y = displayIdx * 28;
      const prefix = item.askedBy === this.myRole ? "我" : "对";

      const line = new Text({
        text: `[${prefix}] Q: ${item.question}`,
        style: { fontFamily: "system-ui", fontSize: 10, fill: 0x88aacc },
      });
      line.x = colGap;
      line.y = y;
      this.qaHistoryContainer.addChild(line);

      const ansLine = new Text({
        text: `    A: ${item.answer}`,
        style: { fontFamily: "system-ui", fontSize: 10, fill: 0x66cc88 },
      });
      ansLine.x = colGap;
      ansLine.y = y + 13;
      this.qaHistoryContainer.addChild(ansLine);
    }

    // Show scroll hint if truncated
    if (startIdx > 0) {
      const scrollHint = new Text({
        text: `↑ 还有 ${startIdx} 条线索`,
        style: { fontFamily: "system-ui", fontSize: 10, fill: 0x556677 },
      });
      scrollHint.anchor.set(0.5);
      scrollHint.x = w / 2;
      scrollHint.y = -14;
      this.qaHistoryContainer.addChild(scrollHint);
    }
  }

  /* ── Wrong Guesses ── */

  private _renderWrongGuesses(): void {
    if (this.wrongGuesses.length === 0) {
      this.wrongGuessesText.text = "";
      return;
    }
    const lines = this.wrongGuesses.map((g) => {
      const who = g.role === this.myRole ? "我" : "对方";
      return `${who}猜「${g.name}」✗`;
    });
    this.wrongGuessesText.text = lines.join("  ");
  }

  /* ── Countdown ── */

  private _startCountdown(): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    this.timeoutReported = false;
    this.countdownText.style.fill = 0xffaa44;

    const tick = () => {
      if (this.gameOver || this.allAsked) {
        this.countdownText.text = "--";
        return;
      }
      const elapsed = (Date.now() - this.turnStartAt) / 1000;
      const remaining = TURN_SEC - elapsed;
      const sec = Math.max(0, Math.ceil(remaining));
      this.countdownText.text = String(sec);
      if (sec <= 5) this.countdownText.style.fill = 0xff6644;

      if (remaining <= 0) {
        if (this.tickerId !== null) clearInterval(this.tickerId);
        this.tickerId = null;
        this.countdownText.text = "0";
        if (this.turn === this.myRole && !this.timeoutReported) {
          this.timeoutReported = true;
          this.client.gpTurnTimeout();
        }
      }
    };
    tick();
    this.tickerId = setInterval(tick, 500);
  }

  /* ── Actions ── */

  private _pickQuestion(questionId: number): void {
    if (this.turn !== this.myRole || this.gameOver || this.allAsked) return;
    this.client.gpPickQuestion(questionId);
    // Disable candidates immediately
    this.candidateContainer.children.forEach((c) => {
      c.eventMode = "none";
    });
  }

  private _submitGuess(): void {
    if (this.gameOver || !this.nameInput || this.guessCooldown) return;
    const name = this.nameInput.value.trim();
    if (!name) {
      this.resultText.text = "请输入人名";
      return;
    }
    this.client.gpGuessName(name);
    this.nameInput.value = "";
    this.resultText.text = "";
  }

  /** 猜错后启动 10 秒冷却，禁用输入和按钮 */
  private _startGuessCooldown(cooldownMs: number): void {
    this.guessCooldown = true;
    if (this.cooldownTimerId !== null) clearInterval(this.cooldownTimerId);

    // 禁用输入
    if (this.nameInput) {
      this.nameInput.disabled = true;
      this.nameInput.style.opacity = "0.4";
    }
    if (this.submitBtn) {
      this.submitBtn.eventMode = "none";
      this.submitBtn.alpha = 0.4;
    }

    const endTime = Date.now() + cooldownMs;
    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      const sec = Math.ceil(remaining / 1000);
      if (this.cooldownText) this.cooldownText.text = `猜错冷却 ${sec}s`;

      if (remaining <= 0) {
        // 冷却结束
        this.guessCooldown = false;
        if (this.cooldownTimerId !== null) clearInterval(this.cooldownTimerId);
        this.cooldownTimerId = null;
        if (this.cooldownText) this.cooldownText.text = "";
        if (this.nameInput && !this.gameOver) {
          this.nameInput.disabled = false;
          this.nameInput.style.opacity = "1";
        }
        if (this.submitBtn && !this.gameOver) {
          this.submitBtn.eventMode = "static";
          this.submitBtn.alpha = 1;
        }
      }
    };
    tick();
    this.cooldownTimerId = setInterval(tick, 500);
  }

  /* ── Message Handling ── */

  private _onMsg(msg: RoomMsg): void {
    if (msg.type === "gp_question_answered") {
      // A question was answered
      if (msg.question && msg.answer && msg.askedBy) {
        this.qaHistoryItems.push({
          question: msg.question,
          answer: msg.answer,
          askedBy: msg.askedBy,
        });
        this._renderQAHistory();
      }
      if (msg.askedCount != null) this.askedCount = msg.askedCount;
      if (msg.allAsked) this.allAsked = true;
      this.titleText.text = `猜人名 ${this.askedCount}/${this.totalQuestions}`;

      // Switch turn
      if (msg.nextTurn != null) {
        this.turn = msg.nextTurn;
        this.turnStartAt = msg.turnStartAt ?? Date.now();
        this.turnText.text = this.turn === this.myRole ? "你来选题" : "对方选题";
        this.turnText.style.fill = this.turn === this.myRole ? 0x00ffcc : 0xffaa44;
        this._renderCandidates(msg.candidateQuestions ?? []);
        if (!this.allAsked) this._startCountdown();
        else {
          this.countdownText.text = "--";
          if (this.tickerId !== null) clearInterval(this.tickerId);
        }
      }
      return;
    }

    if (msg.type === "gp_turn_switch") {
      // Turn switch (timeout, no question asked)
      if (msg.nextTurn != null) {
        this.turn = msg.nextTurn;
        this.turnStartAt = msg.turnStartAt ?? Date.now();
        if (msg.allAsked) this.allAsked = true;
        this.turnText.text = this.turn === this.myRole ? "你来选题" : "对方选题";
        this.turnText.style.fill = this.turn === this.myRole ? 0x00ffcc : 0xffaa44;
        this._renderCandidates(msg.candidateQuestions ?? []);
        if (!this.allAsked) this._startCountdown();
        else {
          this.countdownText.text = "--";
          if (this.tickerId !== null) clearInterval(this.tickerId);
        }
      }
      return;
    }

    if (msg.type === "gp_wrong_guess") {
      if (msg.role && msg.name) {
        this.wrongGuesses.push({ role: msg.role, name: msg.name });
        this._renderWrongGuesses();
        if (msg.role === this.myRole) {
          this.resultText.text = "猜错了！10秒后可重试";
          this.resultText.style.fill = 0xff6644;
          // 启动冷却
          this._startGuessCooldown(msg.cooldownMs ?? 10_000);
        } else {
          this.resultText.text = "对方猜错了";
          this.resultText.style.fill = 0xffaa44;
        }
      }
      return;
    }

    if (msg.type === "game_over") {
      this.gameOver = true;
      if (this.tickerId !== null) clearInterval(this.tickerId);
      const won = msg.winner === this.myRole;
      this._showGameOverOverlay(won, msg.personName ?? "???");
      return;
    }

    if (msg.type === "error") {
      this.resultText.text = msg.error ?? "错误";
      this.resultText.style.fill = 0xff6644;
      return;
    }

    if (msg.type === "peer_left") {
      this.resultText.text = "对方已断开连接";
      this.resultText.style.fill = 0xff6644;
      return;
    }
  }

  /* ── Game Over Overlay ── */

  private _showGameOverOverlay(won: boolean, personName: string): void {
    this._removeNameInput();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h / 2;

    const overlay = new Container();
    overlay.eventMode = "static";

    const bg = new Graphics();
    if (won) {
      bg.roundRect(0, 0, w, h, 0).fill({ color: 0x0a1220, alpha: 0.92 });
      const glow = new Graphics();
      glow.circle(cx, cy, 180).fill({ color: 0x00ffcc, alpha: 0.08 });
      overlay.addChild(glow);
    } else {
      bg.roundRect(0, 0, w, h, 0).fill({ color: 0x0d0810, alpha: 0.94 });
    }
    overlay.addChildAt(bg, 0);

    const title = new Text({
      text: won ? "你赢了！" : "你输了",
      style: {
        fontFamily: "system-ui",
        fontSize: 40,
        fontWeight: "bold",
        fill: won ? 0x00ffcc : 0xff4466,
      },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = cy - 50;
    title.scale.set(0);
    overlay.addChild(title);

    const answerText = new Text({
      text: `答案：${personName}`,
      style: { fontFamily: "system-ui", fontSize: 22, fill: 0xffdd44, fontWeight: "bold" },
    });
    answerText.anchor.set(0.5);
    answerText.x = cx;
    answerText.y = cy + 10;
    answerText.alpha = 0;
    overlay.addChild(answerText);

    const sub = new Text({
      text: won ? "恭喜你猜对了！" : "对方先猜中了",
      style: { fontFamily: "system-ui", fontSize: 16, fill: won ? 0x88ffaa : 0xaa6688 },
    });
    sub.anchor.set(0.5);
    sub.x = cx;
    sub.y = cy + 50;
    sub.alpha = 0;
    overlay.addChild(sub);

    // Particles
    const particleCount = won ? 24 : 12;
    const colors = won ? [0x00ffcc, 0x00ff88, 0xffdd00, 0x88ffff] : [0x440022, 0x660033, 0xff2244];
    for (let i = 0; i < particleCount; i++) {
      const g = new Graphics();
      const r = won ? 4 + Math.random() * 6 : 3 + Math.random() * 4;
      const color = colors[Math.floor(Math.random() * colors.length)];
      g.circle(0, 0, r).fill({ color, alpha: won ? 0.9 : 0.6 });
      g.x = cx + (Math.random() - 0.5) * 40;
      g.y = cy + (Math.random() - 0.5) * 40;
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = won ? 80 + Math.random() * 120 : 30 + Math.random() * 40;
      overlay.addChild(g);
      this.gameOverParticles.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: (won ? Math.sin(angle) : 1) * speed,
        life: 0,
        maxLife: won ? 1200 + Math.random() * 400 : 1800 + Math.random() * 600,
      });
    }

    this.addChild(overlay);
    this.gameOverOverlay = overlay;
    this.gameOverStartTime = performance.now();

    const tickerFn = (ticker: { deltaMS: number }) => {
      const dtSec = ticker.deltaMS / 1000;
      const elapsed = performance.now() - this.gameOverStartTime;

      let titleScale: number;
      if (elapsed < 200) titleScale = (elapsed / 200) * 1.25;
      else if (elapsed < 350) titleScale = 0.9 + (0.1 * (elapsed - 200)) / 150;
      else titleScale = 1 + Math.sin(elapsed * 0.004) * 0.06;
      title.scale.set(Math.min(1.15, titleScale));
      title.alpha = Math.min(1, elapsed / 120);
      if (elapsed > 150) answerText.alpha = Math.min(1, (elapsed - 150) / 200);
      if (elapsed > 300) sub.alpha = Math.min(1, (elapsed - 300) / 200);

      for (let i = this.gameOverParticles.length - 1; i >= 0; i--) {
        const p = this.gameOverParticles[i];
        p.g.x += p.vx * dtSec;
        p.g.y += p.vy * dtSec;
        p.life += ticker.deltaMS;
        const t = p.life / p.maxLife;
        p.g.alpha = Math.max(0, 1 - t);
        p.g.scale.set(1 - t * 0.5);
        if (p.life >= p.maxLife) {
          overlay.removeChild(p.g);
          p.g.destroy();
          this.gameOverParticles.splice(i, 1);
        }
      }
    };
    this.gameOverTickerBound = tickerFn;
    this.app.ticker.add(tickerFn);
  }
}
