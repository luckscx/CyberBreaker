import { Application, Container, Graphics, Text } from "pixi.js";
import { Button } from "../components/Button";
import { GuessInput } from "../components/GuessInput";
import { PowerUpButton } from "../components/PowerUpButton";
import { Background } from "../components/Background";
import { MusicToggle } from "../components/MusicToggle";
import { BackButton } from "../components/BackButton";
import { BackpackButton } from "../components/BackpackButton";
import { BackpackModal } from "../components/BackpackModal";
import { LevelConfig, LevelGameState, PowerUpType } from "../types/level";
import { getLevelById } from "../data/levels";
import { getPowerUp } from "../data/powerUps";
import { ProgressManager } from "../services/progressManager";
import { generateSecret, evaluate, isValidGuess } from "../logic/guess";
import { PowerUpEffects } from "../logic/powerUpEffects";
import { playClick } from "../audio/click";
import { submitCampaignScore } from "../api/leaderboard";
import { getNickname, setNickname } from "../services/settingsManager";

export interface CampaignSceneOptions {
  levelId: number;
  onBack: () => void;
  onNextLevel?: (nextLevelId: number) => void;
}

export class CampaignScene extends Container {
  private levelConfig: LevelConfig;
  private gameState: LevelGameState;
  private bg: Background;

  // UI Elements
  private slotsContainer: Container;
  private guessInput: GuessInput | null = null;
  private historyText: Text;
  private resultText: Text;
  private timerText: Text | null = null;
  private guessesText: Text | null = null;
  private powerUpButtons: Map<PowerUpType, PowerUpButton> = new Map();
  private effectHintText: Text;
  private backpackButton: BackpackButton | null = null;
  private backpackModal: BackpackModal | null = null;

  private timerId: ReturnType<typeof setInterval> | null = 0;
  private startTime: number = 0;

  constructor(
    private app: Application,
    private opts: CampaignSceneOptions
  ) {
    super();

    // 加载关卡配置
    const config = getLevelById(opts.levelId);
    if (!config) {
      throw new Error(`Level ${opts.levelId} not found`);
    }
    this.levelConfig = config;

    // 初始化游戏状态
    const progress = ProgressManager.load();
    this.gameState = {
      levelConfig: config,
      secret: config.fixedSecret || generateSecret(),
      currentGuess: "",
      history: [],
      remainingGuesses: config.maxGuesses,
      remainingSec: config.timeLimit,
      usedPowerUps: [],
      gameEnded: false,
      victory: false,
      availablePowerUps: {
        ...progress.powerUpInventory,
        ...config.startingPowerUps,
      },
      powerUpEffects: {},
    };

    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
    });
    this.addChild(this.bg);

    this.slotsContainer = new Container();
    this.historyText = new Text({ text: "", style: {} });
    this.resultText = new Text({ text: "", style: {} });
    this.effectHintText = new Text({ text: "", style: {} });

    this._buildUI();
    this.startTime = Date.now();
    if (config.timeLimit) {
      this._startTimer();
    }
  }

  private _buildUI(): void {
    const { width, height } = this.app.screen;
    const centerX = width / 2;

    // 顶部工具栏容器
    const topBarY = 25;

    // 返回按钮（左上角）
    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => {
        this._stopTimer();
        this.opts.onBack();
      },
    });
    this.addChild(backButton);

    // 音乐按钮（右上角）
    const toggleSize = 48;
    const musicToggle = new MusicToggle({
      x: width - 16 - toggleSize,
      y: 16,
    });
    this.addChild(musicToggle);

    // 背包按钮（音乐按钮左侧）
    const totalItems = Object.values(this.gameState.availablePowerUps).reduce((sum, count) => sum + count, 0);
    this.backpackButton = new BackpackButton({
      x: width - 16 - toggleSize * 2 - 10,
      y: 16,
      onClick: () => this._showBackpack(),
    });
    this.backpackButton.updateCount(totalItems);
    this.addChild(this.backpackButton);

    // 关卡标题（居中，向下移动避免与按钮重叠）
    const title = new Text({
      text: this.levelConfig.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        fill: this.levelConfig.isBoss ? 0xff0044 : 0xffffff,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5);
    title.position.set(centerX, 60);
    this.addChild(title);

    // 关卡描述（标题下方）
    const description = new Text({
      text: this.levelConfig.description,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fill: 0xaaaaaa,
        align: "center",
        wordWrap: true,
        wordWrapWidth: width - 60,
      },
    });
    description.anchor.set(0.5);
    description.position.set(centerX, 85);
    this.addChild(description);

    // 限制信息容器（居中）
    const infoContainer = new Container();
    let infoY = 110;

    if (this.levelConfig.timeLimit && this.levelConfig.maxGuesses) {
      // 同时有时间和次数限制 - 并排居中显示
      this.timerText = new Text({
        text: `⏱️ ${this.gameState.remainingSec}s`,
        style: { fontFamily: "Arial", fontSize: 18, fill: 0xffdd00 },
      });
      this.timerText.anchor.set(1, 0.5);
      this.timerText.position.set(-20, 0);
      infoContainer.addChild(this.timerText);

      this.guessesText = new Text({
        text: `🎯 ${this.gameState.remainingGuesses}次`,
        style: { fontFamily: "Arial", fontSize: 18, fill: 0x00ff88 },
      });
      this.guessesText.anchor.set(0, 0.5);
      this.guessesText.position.set(20, 0);
      infoContainer.addChild(this.guessesText);

      infoContainer.position.set(centerX, infoY);
      this.addChild(infoContainer);
    } else if (this.levelConfig.timeLimit) {
      // 只有时间限制 - 单独居中
      this.timerText = new Text({
        text: `⏱️ 剩余时间: ${this.gameState.remainingSec}s`,
        style: { fontFamily: "Arial", fontSize: 18, fill: 0xffdd00 },
      });
      this.timerText.anchor.set(0.5, 0.5);
      this.timerText.position.set(centerX, infoY);
      this.addChild(this.timerText);
    } else if (this.levelConfig.maxGuesses) {
      // 只有次数限制 - 单独居中
      this.guessesText = new Text({
        text: `🎯 剩余机会: ${this.gameState.remainingGuesses}次`,
        style: { fontFamily: "Arial", fontSize: 18, fill: 0x00ff88 },
      });
      this.guessesText.anchor.set(0.5, 0.5);
      this.guessesText.position.set(centerX, infoY);
      this.addChild(this.guessesText);
    }

    // 道具效果提示（居中）
    this.effectHintText.style = {
      fontFamily: "Arial",
      fontSize: 11,
      fill: 0xaaddff,
      align: "center",
    };
    this.effectHintText.anchor.set(0.5);
    this.effectHintText.position.set(centerX, 135);
    this.addChild(this.effectHintText);
    this._updateEffectHint();

    // 插槽区域（居中）
    this._buildSlots();
    const slotWidth = 60;
    const slotHeight = 70;
    const gap = 10;
    const totalSlotsWidth = 4 * slotWidth + 3 * gap;
    this.slotsContainer.position.set(centerX - totalSlotsWidth / 2, 160);
    this.addChild(this.slotsContainer);

    // GuessInput 键盘（仅键盘，槽由上方 slotsContainer 负责）
    const keypadY = 160 + this.slotsContainer.height + 60;
    this.guessInput = new GuessInput({
      showSlots: false,
      slotSize: 60,
      slotGap: gap,
      keySize: 70,
      keyGap: 10,
      keyFontSize: 24,
      actionFontSize: 13,
      allowRepeat: false,
      confirmLabel: "✓",
      backspaceLabel: "⌫",
      eliminatedItems: this.gameState.powerUpEffects.eliminatedDigits || [],
      onGuessChange: (guess) => {
        this.gameState.currentGuess = guess;
        this._buildSlots();
      },
      onSubmit: (guess) => this._handleConfirm(guess),
    });
    this.guessInput.setGuess(this.gameState.currentGuess);
    this.guessInput.x = centerX;
    this.guessInput.y = keypadY;
    this.addChild(this.guessInput);
    if (this.gameState.gameEnded) this.guessInput.setEnabled(false);

    // 结果文本（居中）- 键盘下方
    const resultY = keypadY + this.guessInput.totalHeight + 10;
    this.resultText.style = {
      fontFamily: "Arial",
      fontSize: 22,
      fill: 0xffff00,
      align: "center",
    };
    this.resultText.anchor.set(0.5);
    this.resultText.position.set(centerX, resultY);
    this.addChild(this.resultText);

    // 历史记录（居中）- 结果文本下方
    const historyY = resultY + 35;
    this.historyText.style = {
      fontFamily: "Courier New, monospace",
      fontSize: 13,
      fill: 0xcccccc,
      align: "center",
    };
    this.historyText.anchor.set(0.5, 0);
    this.historyText.position.set(centerX, historyY);
    this.addChild(this.historyText);

    // 道具栏移除 - 现在使用背包按钮
    // this._buildPowerUps(centerX, height - 80);
  }

  private _buildSlots(): void {
    this.slotsContainer.removeChildren();
    const revealedPos = this.gameState.powerUpEffects.revealedPositions || [];

    const slotWidth = 60;
    const slotHeight = 70;
    const gap = 10;

    for (let i = 0; i < 4; i++) {
      const slot = new Container();
      const slotBg = new Graphics();
      const revealed = revealedPos.find((r) => r.pos === i);

      if (revealed) {
        // 已揭示的位置 - 显示数字
        slotBg.roundRect(0, 0, slotWidth, slotHeight, 8).fill({ color: 0x00ff44 });
        slotBg.roundRect(0, 0, slotWidth, slotHeight, 8).stroke({ color: 0x00ff88, width: 3 });
        slot.addChild(slotBg);

        const digitText = new Text({
          text: revealed.digit,
          style: { fontFamily: "Arial", fontSize: 36, fill: 0xffffff, fontWeight: "bold" },
        });
        digitText.anchor.set(0.5);
        digitText.position.set(slotWidth / 2, slotHeight / 2);
        slot.addChild(digitText);
      } else {
        const digit = this.gameState.currentGuess[i] || "";
        slotBg.roundRect(0, 0, slotWidth, slotHeight, 8).fill({ color: 0x1a2a3a });
        slotBg.roundRect(0, 0, slotWidth, slotHeight, 8).stroke({ color: 0x00aaff, width: 2 });
        slot.addChild(slotBg);

        if (digit) {
          const digitText = new Text({
            text: digit,
            style: { fontFamily: "Arial", fontSize: 36, fill: 0xffffff },
          });
          digitText.anchor.set(0.5);
          digitText.position.set(slotWidth / 2, slotHeight / 2);
          slot.addChild(digitText);
        }
      }

      slot.position.set(i * (slotWidth + gap), 0);
      this.slotsContainer.addChild(slot);
    }
  }

  private _buildPowerUps(centerX: number, y: number): void {
    const availableTypes = this.levelConfig.availablePowerUps;
    const totalWidth = availableTypes.length * 70 + (availableTypes.length - 1) * 10;
    const startX = centerX - totalWidth / 2;

    availableTypes.forEach((type, idx) => {
      const powerUpData = getPowerUp(type);
      const count = this.gameState.availablePowerUps[type] || 0;
      const btn = new PowerUpButton({
        icon: powerUpData.icon,
        name: powerUpData.name,
        count,
        disabled: this.gameState.gameEnded,
        onClick: () => this._usePowerUp(type),
      });
      btn.position.set(startX + idx * 80, y);
      this.addChild(btn);
      this.powerUpButtons.set(type, btn);
    });
  }

  private _handleConfirm(guess: string): void {
    if (this.gameState.gameEnded) return;
    if (!isValidGuess(guess)) {
      this.resultText.text = "请输入 4 位不重复数字";
      this.resultText.style.fill = 0xff6644;
      return;
    }

    playClick();
    const { a, b } = evaluate(this.gameState.secret, guess);
    this.gameState.history.push({ guess, a, b });
    this.gameState.currentGuess = "";
    this.guessInput?.clear();

    if (this.gameState.remainingGuesses !== null) {
      this.gameState.remainingGuesses--;
      this.guessesText!.text = `🎯 ${this.gameState.remainingGuesses}次`;
    }

    this._buildSlots();
    this._updateHistory();

    if (a === 4) {
      this._handleVictory();
    } else if (
      this.gameState.remainingGuesses !== null &&
      this.gameState.remainingGuesses <= 0
    ) {
      this._handleDefeat();
    } else {
      this.resultText.text = `→ ${a}A${b}B`;
      this.resultText.style.fill = 0x88ff88;
    }
  }

  private _usePowerUp(type: PowerUpType): void {
    if (this.gameState.gameEnded) return;
    const count = this.gameState.availablePowerUps[type] || 0;
    if (count <= 0) return;

    playClick();
    this.gameState = PowerUpEffects.apply(this.gameState, type);
    this.gameState.availablePowerUps[type] = count - 1;

    // 关闭背包模态框（稍后会重建UI）
    this._hideBackpack();

    this._updateEffectHint();
    this._buildSlots();

    // 重建键盘以反映排除效果
    // 保存需要保留的UI元素引用
    const keepElements = [
      this.bg,
      this.slotsContainer,
      this.effectHintText,
      this.resultText,
      this.historyText,
      this.timerText,
      this.guessesText,
    ].filter(Boolean);

    // 找到并移除键盘和其他临时元素
    const toRemove = this.children.filter((c) => !keepElements.includes(c));
    toRemove.forEach((c) => this.removeChild(c));

    this._buildUI();
  }

  private _showBackpack(): void {
    if (this.backpackModal || this.gameState.gameEnded) return;

    // 转换道具数据格式
    const items = this.levelConfig.availablePowerUps.map(type => {
      const powerUpData = getPowerUp(type);
      return {
        id: type,
        icon: powerUpData.icon,
        name: powerUpData.name,
        description: powerUpData.description,
        count: this.gameState.availablePowerUps[type] || 0,
      };
    });

    this.backpackModal = new BackpackModal({
      app: this.app,
      items,
      disabled: this.gameState.gameEnded,
      onUseItem: (itemId) => this._usePowerUp(itemId as PowerUpType),
      onClose: () => this._hideBackpack(),
    });
    this.addChild(this.backpackModal);
  }

  private _hideBackpack(): void {
    if (this.backpackModal) {
      this.removeChild(this.backpackModal);
      this.backpackModal.destroy();
      this.backpackModal = null;
    }
  }

  private _updateEffectHint(): void {
    const hints: string[] = [];
    const { eliminatedDigits, revealedPositions, knownDigits } = this.gameState.powerUpEffects;

    if (eliminatedDigits && eliminatedDigits.length > 0) {
      hints.push(`❌ 已排除: ${eliminatedDigits.join(", ")}`);
    }
    if (knownDigits && knownDigits.length > 0) {
      hints.push(`🔍 包含数字: ${knownDigits.sort().join(", ")}`);
    }
    if (revealedPositions && revealedPositions.length > 0) {
      hints.push(`💡 已揭示 ${revealedPositions.length} 个位置`);
    }

    this.effectHintText.text = hints.join("  |  ");
  }

  private _updateHistory(): void {
    const lines = this.gameState.history.map(
      (h) => `${h.guess}  →  ${h.a}A${h.b}B`
    );
    this.historyText.text = lines.slice(-8).join("\n");
  }

  private _startTimer(): void {
    this._stopTimer();
    this.timerId = setInterval(() => {
      if (this.gameState.remainingSec === null) return;
      this.gameState.remainingSec--;
      this.timerText!.text = `⏱️ ${this.gameState.remainingSec}s`;

      if (this.gameState.remainingSec <= 0) {
        this._handleDefeat();
      }
    }, 1000);
  }

  private _stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private _handleVictory(): void {
    this.gameState.gameEnded = true;
    this.gameState.victory = true;
    this.guessInput?.setEnabled(false);
    this._stopTimer();

    const elapsedMs = Date.now() - this.startTime;
    const guessCount = this.gameState.history.length;
    const isPerfect =
      this.levelConfig.perfectGuesses !== undefined &&
      guessCount <= this.levelConfig.perfectGuesses;

    let stars = this.levelConfig.rewardStars;
    if (isPerfect && this.levelConfig.perfectBonus) {
      stars += this.levelConfig.perfectBonus;
    }

    this._saveProgress(guessCount, elapsedMs, stars, isPerfect);

    // 先显示昵称输入弹窗，再显示结果
    this._showNameInputDialog(guessCount, elapsedMs, stars, isPerfect);
  }

  private _handleDefeat(): void {
    this.gameState.gameEnded = true;
    this.gameState.victory = false;
    this.guessInput?.setEnabled(false);
    this._stopTimer();
    this._showResult(false, 0, false);
  }

  private _saveProgress(
    guesses: number,
    timeMs: number,
    stars: number,
    isPerfect: boolean
  ): void {
    let progress = ProgressManager.load();
    const oldProgress = progress.levels[this.levelConfig.id];

    const newLevelProgress = {
      levelId: this.levelConfig.id,
      completed: true,
      bestGuesses: oldProgress?.bestGuesses
        ? Math.min(oldProgress.bestGuesses, guesses)
        : guesses,
      bestTime: oldProgress?.bestTime
        ? Math.min(oldProgress.bestTime, timeMs)
        : timeMs,
      starsEarned: oldProgress ? Math.max(oldProgress.starsEarned, stars) : stars,
      isPerfect: oldProgress?.isPerfect || isPerfect,
    };

    progress = ProgressManager.updateLevelProgress(
      progress,
      this.levelConfig.id,
      newLevelProgress
    );
    ProgressManager.save(progress);
  }

  private _showResult(victory: boolean, stars: number, isPerfect: boolean): void {
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 0.8 });
    this.addChild(overlay);

    const { width, height } = this.app.screen;
    const panel = new Graphics();
    panel.roundRect(0, 0, 400, 350, 16).fill({ color: 0x1a2a3a });
    panel.position.set(width / 2 - 200, height / 2 - 175);
    this.addChild(panel);

    const btnWidth = 120;
    const widthOffset = 10;
    const heightOffset = 60;

    if (victory) {
      const title = new Text({
        text: isPerfect ? "🏆 完美通关！" : "✅ 通关成功！",
        style: {
          fontFamily: "Arial",
          fontSize: 36,
          fill: isPerfect ? 0xffd700 : 0x00ff88,
          fontWeight: "bold",
        },
      });
      title.anchor.set(0.5);
      title.position.set(width / 2, height / 2 - 100);
      this.addChild(title);

      const starsText = new Text({
        text: `⭐ 获得星星: ${stars}`,
        style: { fontFamily: "Arial", fontSize: 24, fill: 0xffdd00 },
      });
      starsText.anchor.set(0.5);
      starsText.position.set(width / 2, height / 2 - 40);
      this.addChild(starsText);

      const statsText = new Text({
        text: `猜测次数: ${this.gameState.history.length}`,
        style: { fontFamily: "Arial", fontSize: 18, fill: 0xcccccc },
      });
      statsText.anchor.set(0.5);
      statsText.position.set(width / 2, height / 2);
      this.addChild(statsText);

      const nextBtn = new Button({
        label: "下一关",
        width: btnWidth,
        fontSize: 15,
        onClick: () => {
          this._stopTimer();
          if (this.opts.onNextLevel) {
            this.opts.onNextLevel(this.levelConfig.id + 1);
          }
        },
      });
      nextBtn.position.set(width / 2 - btnWidth / 2 - widthOffset, height / 2 + heightOffset);
      this.addChild(nextBtn);

      // 返回按钮（横向排列在右侧）
      const backBtn = new Button({
        label: "返回",
        width: btnWidth,
        fontSize: 15,
        onClick: () => {
          this._stopTimer();
          this.opts.onBack();
        },
      });
      backBtn.position.set(width / 2 + btnWidth / 2 + widthOffset, height / 2 + heightOffset);
      this.addChild(backBtn);
    } else {
      const title = new Text({
        text: "❌ 挑战失败",
        style: {
          fontFamily: "Arial",
          fontSize: 36,
          fill: 0xff4444,
          fontWeight: "bold",
        },
      });
      title.anchor.set(0.5);
      title.position.set(width / 2, height / 2 - 80);
      this.addChild(title);

      const secretText = new Text({
        text: `答案是: ${this.gameState.secret}`,
        style: { fontFamily: "Arial", fontSize: 24, fill: 0xffdd00 },
      });
      secretText.anchor.set(0.5);
      secretText.position.set(width / 2, height / 2 - 20);
      this.addChild(secretText);

      const backBtn = new Button({
        label: "返回",
        width: btnWidth,
        fontSize: 15,
        onClick: () => {
          this._stopTimer();
          this.opts.onBack();
        },
      });
      backBtn.position.set(width / 2, height / 2 + heightOffset);
      this.addChild(backBtn);
    }
  }

  /**
   * 显示昵称输入对话框
   */
  private _showNameInputDialog(
    guessCount: number,
    timeMs: number,
    stars: number,
    isPerfect: boolean
  ): void {
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    overlay.eventMode = "static";
    this.addChild(overlay);

    const { width, height } = this.app.screen;
    const panel = new Graphics();
    panel.roundRect(0, 0, 400, 300, 16).fill({ color: 0x1a2a3a });
    panel.roundRect(0, 0, 400, 300, 16).stroke({ color: 0x00aaff, width: 2 });
    panel.position.set(width / 2 - 200, height / 2 - 150);
    this.addChild(panel);

    // 标题
    const title = new Text({
      text: "🎉 通关成功！",
      style: {
        fontFamily: "Arial",
        fontSize: 28,
        fill: 0x00ff88,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, height / 2 - 120);
    this.addChild(title);

    // 成绩信息
    const statsText = new Text({
      text: `猜测次数：${guessCount}  用时：${(timeMs / 1000).toFixed(1)}秒`,
      style: {
        fontFamily: "Arial",
        fontSize: 16,
        fill: 0xcccccc,
      },
    });
    statsText.anchor.set(0.5, 0);
    statsText.position.set(width / 2, height / 2 - 70);
    this.addChild(statsText);

    // 提示文本
    const hint = new Text({
      text: "输入你的昵称上传排行榜：",
      style: {
        fontFamily: "Arial",
        fontSize: 18,
        fill: 0xffffff,
      },
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(width / 2, height / 2 - 35);
    this.addChild(hint);

    // 创建 HTML 输入框
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "请输入昵称 (最多20字)";
    input.maxLength = 20;
    input.value = getNickname(); // 使用Cookie中保存的昵称作为默认值
    input.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -10px);
      width: 300px;
      padding: 10px;
      font-size: 16px;
      border: 2px solid #00aaff;
      border-radius: 8px;
      background: #0a1a2a;
      color: #ffffff;
      outline: none;
      z-index: 10000;
    `;
    document.body.appendChild(input);
    input.focus();

    // 提交逻辑
    const handleSubmit = async () => {
      const playerName = input.value.trim();
      if (!playerName) {
        alert("请输入昵称");
        return;
      }

      playClick();
      submitBtn.visible = false;
      skipBtn.visible = false;

      // 显示加载提示
      const loadingText = new Text({
        text: "上传中...",
        style: { fontFamily: "Arial", fontSize: 16, fill: 0xffaa00 },
      });
      loadingText.anchor.set(0.5);
      loadingText.position.set(width / 2, height / 2 + 60);
      this.addChild(loadingText);

      try {
        await submitCampaignScore({
          levelId: this.levelConfig.id,
          playerName,
          guessCount,
          timeMs,
        });

        // 保存昵称到Cookie（如果用户修改了）
        if (playerName !== getNickname()) {
          setNickname(playerName);
        }

        // 移除输入框和对话框
        document.body.removeChild(input);
        this.removeChild(overlay);
        this.removeChild(panel);
        this.removeChild(title);
        this.removeChild(statsText);
        this.removeChild(hint);
        this.removeChild(loadingText);

        // 显示成绩结果
        this._showResult(true, stars, isPerfect);
      } catch (error) {
        console.error("提交成绩失败:", error);
        loadingText.text = "上传失败，请稍后重试";
        loadingText.style.fill = 0xff4444;
        submitBtn.visible = true;
        skipBtn.visible = true;
      }
    };


    const btnWidth = 100;
    const widthOffset = 10;
    const heightOffset = 70;

    // 提交按钮（左侧）
    const submitBtn = new Button({
      label: "提交成绩",
      width: btnWidth,
      fontSize: 15,
      onClick: handleSubmit,
    });
    submitBtn.position.set(width / 2 - btnWidth / 2 - widthOffset, height / 2 + heightOffset);
    this.addChild(submitBtn);

    // 跳过按钮（右侧）
    const skipBtn = new Button({
      label: "跳过",
      width: btnWidth,
      fontSize: 15,
      onClick: () => {
        playClick();
        document.body.removeChild(input);
        this.removeChild(overlay);
        this.removeChild(panel);
        this.removeChild(title);
        this.removeChild(statsText);
        this.removeChild(hint);
        this.removeChild(submitBtn);
        this.removeChild(skipBtn);
        this._showResult(true, stars, isPerfect);
      },
    });
    skipBtn.position.set(width / 2 + btnWidth / 2 + widthOffset, height / 2 + heightOffset);
    this.addChild(skipBtn);

    // 回车提交
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    });
  }

  animate(): void {
    this.bg.animate();
  }
}
