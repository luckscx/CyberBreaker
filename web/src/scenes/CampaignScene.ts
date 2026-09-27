import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { Button } from "../components/Button";
import { GuessInput } from "../components/GuessInput";
import { GuessBoard, type GuessRecord } from "../components/GuessBoard";
import { ResultBanner } from "../components/ResultBanner";
import { SceneChrome } from "../components/SceneChrome";
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
import { ITEM_TYPE_DIGITS } from "../types/itemTypes";
import {
  computePlayGeometry,
  computePlayScreen,
  observeResize,
} from "../ui/layout";
import { Color, Font, Play, Radius, Size } from "../ui/theme";

export interface CampaignSceneOptions {
  levelId: number;
  onBack: () => void;
  onNextLevel?: (nextLevelId: number) => void;
}

/** 统计条单行高度 */
const STATS_H = 26;
/** 道具效果提示行高度 */
const HINT_H = 20;

/**
 * 关卡模式。
 *
 * 本次重构只替换「呈现层」，玩法逻辑（道具、计时、星级、排行榜）保持不变：
 *   - 顶栏改用统一的 SceneChrome（返回键 / 标题 / 音乐 / 背包位置全站一致）
 *   - 输入槽与键盘改用统一的 computePlayGeometry，槽位与键盘等宽对齐
 *   - 历史记录由「8 行等宽纯文本」换成统一的 GuessBoard（带序号、方块、A/B 徽章、可滚动）
 *   - 结果反馈由一行 resultText 换成独立的 ResultBanner，不再被键盘遮挡
 *   - 整页自下而上排布 + 尺寸变化重建，短屏手机不再把内容顶出屏幕
 */
export class CampaignScene extends Container {
  private levelConfig: LevelConfig;
  private gameState: LevelGameState;

  // 分层：UI 层可整体重建，模态层与结算层始终在其上
  private uiLayer: Container;
  private modalLayer: Container;
  private overlayLayer: Container;

  private chrome: SceneChrome | null = null;
  private board: GuessBoard | null = null;
  private result: ResultBanner | null = null;
  private slotsContainer: Container | null = null;
  private guessInput: GuessInput | null = null;
  private timerText: Text | null = null;
  private guessesText: Text | null = null;
  private effectHintText: Text | null = null;
  private backpackButton: BackpackButton | null = null;
  private backpackModal: BackpackModal | null = null;

  /** 结算覆盖层的重建参数（尺寸变化后需要重放） */
  private pendingResult: { victory: boolean; stars: number; isPerfect: boolean } | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private stopResize: (() => void) | null = null;

  constructor(
    private app: Application,
    private opts: CampaignSceneOptions
  ) {
    super();

    const config = getLevelById(opts.levelId);
    if (!config) {
      throw new Error(`Level ${opts.levelId} not found`);
    }
    this.levelConfig = config;

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

    this.uiLayer = new Container();
    this.modalLayer = new Container();
    this.overlayLayer = new Container();
    this.addChild(this.uiLayer, this.modalLayer, this.overlayLayer);

    this._buildUI();
    this.startTime = Date.now();
    if (config.timeLimit) this._startTimer();

    this.stopResize = observeResize(() => this._relayout());
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this._stopTimer();
    this.stopResize?.();
    this.stopResize = null;
    this._removeNicknameInput();
    super.destroy(options);
  }

  animate(): void {
    this.chrome?.animate();
  }

  // ════════════════════════════════════════
  //  构建
  // ════════════════════════════════════════

  private _buildUI(): void {
    const { width, height } = this.app.screen;

    this.chrome = new SceneChrome({
      width,
      height,
      onBack: () => {
        this._stopTimer();
        this.opts.onBack();
      },
      title: this.levelConfig.name,
      subtitle: this.levelConfig.description,
      extras: ({ right, y, size }) => this._buildBackpackButton(right, y, size),
    });
    this.uiLayer.addChild(this.chrome);

    const geometry = computePlayGeometry(width, ITEM_TYPE_DIGITS);
    // 恒定预留提示行高度：若按「有无提示」动态变化，
    // 使用道具后提示行会突然出现并压到历史板上（曾出现重叠）。
    // 恒定占位既避免重排跳动，也让历史板高度稳定。
    const statsH = STATS_H + HINT_H;
    // showSlots: true 只为「预留出槽位那一条高度」，
    // 真正的槽由本场景自绘（要显示「揭示」道具的数字），故键盘本身不画槽。
    const layout = computePlayScreen({
      chrome: this.chrome,
      geometry,
      showSlots: true,
      statsH,
    });

    // ── 统计条：剩余时间 / 剩余次数 ──
    this.timerText = null;
    this.guessesText = null;
    this._buildStats(layout.stats.y, this.chrome.contentLeft, this.chrome.contentRight);

    // ── 道具效果提示 ──
    this.effectHintText = new Text({
      text: "",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.caption,
        fill: 0x9fd6ff,
        align: "center",
        wordWrap: true,
        wordWrapWidth: this.chrome.contentWidth,
      },
    });
    this.effectHintText.anchor.set(0.5, 0);
    this.effectHintText.x = layout.centerX;
    this.effectHintText.y = layout.stats.y + STATS_H;
    this.uiLayer.addChild(this.effectHintText);
    this._updateEffectHint();

    // ── 历史记录板（统一组件，替代原来的 8 行纯文本）──
    const records: GuessRecord[] = this.gameState.history.map((h) => ({
      guess: h.guess,
      a: h.a,
      b: h.b,
    }));
    this.board = new GuessBoard({
      width: layout.board.w,
      height: layout.board.h,
      emptyText: "还没有猜测记录\n用下方键盘输入 4 位数字",
    });
    this.board.x = layout.board.x;
    this.board.y = layout.board.y;
    this.board.setRecords(records);
    this.uiLayer.addChild(this.board);

    // ── 结果条带（固定高度带，绝不遮挡键盘）──
    this.result = new ResultBanner({
      width: layout.board.w,
      idleText: this.levelConfig.timeLimit ? "注意时间，A 位置对 · B 数字对" : "A 位置对 · B 数字对",
    });
    this.result.x = layout.board.x;
    this.result.y = layout.result.y;
    this.uiLayer.addChild(this.result);

    // ── 输入槽（保留自绘，以支持「揭示」道具显示单个数字）──
    this.slotsContainer = new Container();
    this._buildSlots();
    // 槽以自身原点为中心绘制，第 i 个槽中心 = i*(SS+SG)；
    // 把第 0 个槽中心放到「4 槽整体居中」的左边第一个位置
    this.slotsContainer.x = layout.centerX - 1.5 * (geometry.slotSize + geometry.slotGap);
    this.slotsContainer.y = layout.inputTop + geometry.slotSize / 2;
    this.uiLayer.addChild(this.slotsContainer);

    // ── 键盘（贴底，几何由屏幕宽度推算）──
    this.guessInput = new GuessInput({
      screenWidth: width,
      showSlots: false,
      allowRepeat: false,
      confirmLabel: "确认",
      backspaceLabel: "退格",
      eliminatedItems: this.gameState.powerUpEffects.eliminatedDigits || [],
      onGuessChange: (guess) => {
        this.gameState.currentGuess = guess;
        this._buildSlots();
      },
      onSubmit: (guess) => this._handleConfirm(guess),
    });
    this.guessInput.setGuess(this.gameState.currentGuess);
    this.guessInput.x = layout.centerX;
    this.guessInput.y = layout.keypadTop;
    if (this.gameState.gameEnded) this.guessInput.setEnabled(false);
    this.uiLayer.addChild(this.guessInput);
  }

  /** 数字物品类型的最小定义（关卡模式固定猜数字） */
  private _buildBackpackButton(right: number, y: number, size: number): Container {
    const totalItems = Object.values(this.gameState.availablePowerUps).reduce(
      (sum, count) => sum + count,
      0
    );
    this.backpackButton = new BackpackButton({
      x: right - size,
      y,
      size,
      onClick: () => this._showBackpack(),
    });
    this.backpackButton.updateCount(totalItems);
    return this.backpackButton;
  }

  private _buildStats(y: number, left: number, right: number): void {
    const cfg = this.levelConfig;
    const mk = (text: string, color: number, x: number, anchorX: number) => {
      const t = new Text({
        text,
        style: { fontFamily: Font.mono, fontSize: Size.bodySm + 1, fill: color, fontWeight: "bold" },
      });
      t.anchor.set(anchorX, 0.5);
      t.position.set(x, y + STATS_H / 2);
      this.uiLayer.addChild(t);
      return t;
    };

    const timerLabel = `⏱ ${this.gameState.remainingSec ?? "-"}s`;
    const guessLabel = `🎯 ${this.gameState.remainingGuesses ?? "-"}次`;

    if (cfg.timeLimit && cfg.maxGuesses) {
      this.timerText = mk(timerLabel, Color.warning, left, 0);
      this.guessesText = mk(guessLabel, Color.success, right, 1);
    } else if (cfg.timeLimit) {
      this.timerText = mk(timerLabel, Color.warning, (left + right) / 2, 0.5);
    } else if (cfg.maxGuesses) {
      this.guessesText = mk(guessLabel, Color.success, (left + right) / 2, 0.5);
    }
  }

  /** 自绘输入槽：尺寸与统一几何一致，因此与教学模式完全同款 */
  private _buildSlots(): void {
    if (!this.slotsContainer) return;
    const geometry = computePlayGeometry(this.app.screen.width, ITEM_TYPE_DIGITS);
    const SS = geometry.slotSize;
    const SG = geometry.slotGap;
    const revealedPos = this.gameState.powerUpEffects.revealedPositions || [];

    this.slotsContainer.removeChildren().forEach((c) => c.destroy({ children: true }));

    for (let i = 0; i < 4; i++) {
      const slot = new Container();
      slot.x = i * (SS + SG);

      const bg = new Graphics();
      const revealed = revealedPos.find((r) => r.pos === i);
      const digit = this.gameState.currentGuess[i] || "";

      // 已揭示 → 绿色实底；已填 / 空白 → 深底 + 描边
      const filled = !!digit || !!revealed;
      bg.roundRect(-SS / 2, -SS / 2, SS, SS, Play.slotRadius).fill({
        color: revealed ? 0x14503a : filled ? 0x0f2a2b : Color.bgDeep,
        alpha: revealed ? 1 : 0.9,
      });
      bg.roundRect(-SS / 2, -SS / 2, SS, SS, Play.slotRadius).stroke({
        width: revealed ? 2.4 : 1.6,
        color: revealed ? Color.success : filled ? Color.primary : Color.lineStrong,
        alpha: filled ? 0.95 : 0.5,
      });
      slot.addChild(bg);

      const text = revealed?.digit ?? digit;
      // 空槽也画占位符「?」，与教学模式（GuessInput）保持完全一致的观感
      const t = new Text({
        text: text || "?",
        style: {
          fontFamily: Font.mono,
          fontSize: Math.round(SS * (text ? 0.5 : 0.46)),
          fill: text ? Color.text : Color.textFaint,
          fontWeight: "bold",
        },
      });
      t.anchor.set(0.5);
      t.alpha = text ? 1 : 0.5;
      slot.addChild(t);

      this.slotsContainer.addChild(slot);
    }
  }

  /** 尺寸变化：重建 UI 层并重放结算层，避免沿用旧坐标导致内容溢出 */
  private _relayout(): void {
    this.backpackModal = null;
    this.modalLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.uiLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._buildUI();

    if (this.pendingResult) {
      const { victory, stars, isPerfect } = this.pendingResult;
      this.overlayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._showResult(victory, stars, isPerfect);
    }
  }

  // ════════════════════════════════════════
  //  道具 / 背包
  // ════════════════════════════════════════

  private _usePowerUp(type: PowerUpType): void {
    if (this.gameState.gameEnded) return;
    const count = this.gameState.availablePowerUps[type] || 0;
    if (count <= 0) return;

    playClick();
    this.gameState = PowerUpEffects.apply(this.gameState, type);
    this.gameState.availablePowerUps[type] = count - 1;

    this._hideBackpack();
    this._updateEffectHint();
    this._buildSlots();

    // 键盘需要重建以反映「排除」效果。
    // 旧实现用一个 keepElements 白名单 + children.filter 来挑选要保留的节点，
    // 一旦新增 UI 元素忘记加进白名单就会被误删；这里改为只重建键盘与背包计数。
    this._rebuildKeypad();

    const totalItems = Object.values(this.gameState.availablePowerUps).reduce(
      (sum, c) => sum + c,
      0
    );
    this.backpackButton?.updateCount(totalItems);
  }

  private _rebuildKeypad(): void {
    if (!this.guessInput) return;
    const x = this.guessInput.x;
    const y = this.guessInput.y;
    this.uiLayer.removeChild(this.guessInput);
    this.guessInput.destroy({ children: true });

    this.guessInput = new GuessInput({
      screenWidth: this.app.screen.width,
      showSlots: false,
      allowRepeat: false,
      confirmLabel: "确认",
      backspaceLabel: "退格",
      eliminatedItems: this.gameState.powerUpEffects.eliminatedDigits || [],
      onGuessChange: (guess) => {
        this.gameState.currentGuess = guess;
        this._buildSlots();
      },
      onSubmit: (guess) => this._handleConfirm(guess),
    });
    this.guessInput.setGuess(this.gameState.currentGuess);
    this.guessInput.x = x;
    this.guessInput.y = y;
    if (this.gameState.gameEnded) this.guessInput.setEnabled(false);
    this.uiLayer.addChild(this.guessInput);
  }

  private _showBackpack(): void {
    if (this.backpackModal || this.gameState.gameEnded) return;

    const items = this.levelConfig.availablePowerUps.map((type) => {
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
    this.modalLayer.addChild(this.backpackModal);
  }

  private _hideBackpack(): void {
    if (this.backpackModal) {
      this.modalLayer.removeChild(this.backpackModal);
      this.backpackModal.destroy();
      this.backpackModal = null;
    }
  }

  private _updateEffectHint(): void {
    if (!this.effectHintText) return;
    const hints: string[] = [];
    const { eliminatedDigits, revealedPositions, knownDigits } = this.gameState.powerUpEffects;

    if (eliminatedDigits && eliminatedDigits.length > 0) {
      hints.push(`❌ 已排除: ${eliminatedDigits.join(",")}`);
    }
    if (knownDigits && knownDigits.length > 0) {
      hints.push(`🔍 包含: ${knownDigits.slice().sort().join(",")}`);
    }
    if (revealedPositions && revealedPositions.length > 0) {
      hints.push(`💡 已揭示 ${revealedPositions.length} 位`);
    }
    this.effectHintText.text = hints.join("  ·  ");
  }

  // ════════════════════════════════════════
  //  提交 / 计时
  // ════════════════════════════════════════

  private _handleConfirm(guess: string): void {
    if (this.gameState.gameEnded) return;
    if (!isValidGuess(guess)) {
      this.result?.showError("请输入 4 位不重复数字");
      return;
    }

    const { a, b } = evaluate(this.gameState.secret, guess);
    this.gameState.history.push({ guess, a, b });
    this.gameState.currentGuess = "";
    this.guessInput?.clear();

    if (this.gameState.remainingGuesses !== null) {
      this.gameState.remainingGuesses--;
      if (this.guessesText) {
        this.guessesText.text = this.levelConfig.timeLimit && this.levelConfig.maxGuesses
          ? `🎯 ${this.gameState.remainingGuesses}次`
          : `🎯 剩余机会: ${this.gameState.remainingGuesses}次`;
      }
    }

    this._buildSlots();
    this.board?.setRecords(
      this.gameState.history.map((h) => ({ guess: h.guess, a: h.a, b: h.b }))
    );
    this.result?.show(guess, a, b);

    if (a === 4) {
      this._handleVictory();
    } else if (
      this.gameState.remainingGuesses !== null &&
      this.gameState.remainingGuesses <= 0
    ) {
      this._handleDefeat();
    }
  }

  private _startTimer(): void {
    this._stopTimer();
    this.timerId = setInterval(() => {
      if (this.gameState.remainingSec === null) return;
      this.gameState.remainingSec--;
      if (this.timerText) {
        this.timerText.text =
          this.levelConfig.timeLimit && this.levelConfig.maxGuesses
            ? `⏱ ${this.gameState.remainingSec}s`
            : `⏱ 剩余时间: ${this.gameState.remainingSec}s`;
        // 最后 10 秒转红，给出明确紧迫感
        this.timerText.style.fill =
          this.gameState.remainingSec <= 10 ? Color.danger : Color.warning;
      }
      if (this.gameState.remainingSec <= 0) this._handleDefeat();
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
    this._showNameInputDialog(guessCount, elapsedMs, stars, isPerfect);
  }

  private _handleDefeat(): void {
    if (this.gameState.gameEnded) return;
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

  // ════════════════════════════════════════
  //  结算层
  // ════════════════════════════════════════

  /** 结算弹窗：卡片宽度随屏幕收窄，不再固定 400px（小屏会溢出） */
  private _showResult(victory: boolean, stars: number, isPerfect: boolean): void {
    this.pendingResult = { victory, stars, isPerfect };

    const { width, height } = this.app.screen;
    const cardW = Math.min(320, width - 40);
    const cardH = victory ? 300 : 240;

    const scrim = new Graphics();
    scrim.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.8 });
    this.overlayLayer.addChild(scrim);

    const panel = new Container();
    panel.x = width / 2;
    panel.y = height / 2;

    const bg = new Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).fill({
      color: Color.bgElevated,
      alpha: 0.98,
    });
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).stroke({
      width: 1.6,
      color: victory ? Color.success : Color.danger,
      alpha: 0.85,
    });
    panel.addChild(bg);

    const title = new Text({
      text: victory ? (isPerfect ? "🏆 完美通关！" : "✅ 通关成功！") : "❌ 挑战失败",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.title,
        fill: victory ? (isPerfect ? Color.gold : Color.success) : Color.danger,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5);
    title.y = -cardH / 2 + 46;
    panel.addChild(title);

    if (victory) {
      const starsText = new Text({
        text: `⭐ 获得星星 ${stars}`,
        style: { fontFamily: Font.sans, fontSize: Size.body, fill: Color.gold },
      });
      starsText.anchor.set(0.5);
      starsText.y = -cardH / 2 + 88;
      panel.addChild(starsText);
    } else {
      const secretText = new Text({
        text: `正确答案 ${this.gameState.secret}`,
        style: { fontFamily: Font.mono, fontSize: Size.body, fill: Color.gold },
      });
      secretText.anchor.set(0.5);
      secretText.y = -cardH / 2 + 88;
      panel.addChild(secretText);
    }

    const statsText = new Text({
      text: `猜测次数 ${this.gameState.history.length}`,
      style: { fontFamily: Font.sans, fontSize: Size.bodySm, fill: Color.textSub },
    });
    statsText.anchor.set(0.5);
    statsText.y = -cardH / 2 + 116;
    panel.addChild(statsText);

    const btnW = cardW - 60;
    if (victory) {
      const nextBtn = new Button({
        label: "下一关",
        width: btnW,
        height: 46,
        fontSize: 16,
        onClick: () => {
          this._stopTimer();
          if (this.opts.onNextLevel) this.opts.onNextLevel(this.levelConfig.id + 1);
        },
      });
      nextBtn.y = -cardH / 2 + 152;
      panel.addChild(nextBtn);
    }

    const backBtn = new Button({
      label: victory ? "返回关卡列表" : "返回",
      width: btnW,
      height: victory ? 42 : 46,
      fontSize: 15,
      fillColor: victory ? Color.bgPanel : undefined,
      onClick: () => {
        this._stopTimer();
        this.opts.onBack();
      },
    });
    backBtn.y = victory ? -cardH / 2 + 204 : -cardH / 2 + 152;
    panel.addChild(backBtn);

    this.overlayLayer.addChild(panel);
  }

  /**
   * 昵称输入对话框。
   * 旧实现在多个分支里手动 removeChild 一堆节点，漏掉任何一次都会把
   * DOM 输入框永久留在页面上（还会挡住 canvas）。这里统一成 closeDialog()。
   */
  private _showNameInputDialog(
    guessCount: number,
    timeMs: number,
    stars: number,
    isPerfect: boolean
  ): void {
    const { width, height } = this.app.screen;

    const scrim = new Graphics();
    scrim.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.78 });
    scrim.eventMode = "static";
    scrim.hitArea = new Rectangle(0, 0, width, height);
    this.overlayLayer.addChild(scrim);

    const cardW = Math.min(320, width - 40);
    const cardH = 268;
    const panel = new Container();
    panel.x = width / 2;
    panel.y = height / 2;

    const bg = new Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).fill({
      color: Color.bgElevated,
      alpha: 0.98,
    });
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).stroke({
      width: 1.6,
      color: Color.primary,
      alpha: 0.85,
    });
    panel.addChild(bg);
    this.overlayLayer.addChild(panel);

    const title = new Text({
      text: "🎉 通关成功！",
      style: { fontFamily: Font.sans, fontSize: Size.sectionTitle, fill: Color.success, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.y = -cardH / 2 + 36;
    panel.addChild(title);

    const statsText = new Text({
      text: `猜测 ${guessCount} 次 · 用时 ${(timeMs / 1000).toFixed(1)}s`,
      style: { fontFamily: Font.sans, fontSize: Size.bodySm, fill: Color.textSub },
    });
    statsText.anchor.set(0.5);
    statsText.y = -cardH / 2 + 68;
    panel.addChild(statsText);

    const hint = new Text({
      text: "输入昵称上传排行榜",
      style: { fontFamily: Font.sans, fontSize: Size.bodySm, fill: Color.text },
    });
    hint.anchor.set(0.5);
    hint.y = -cardH / 2 + 98;
    panel.addChild(hint);

    // DOM 输入框：定位到卡片内「昵称」那一行的位置（屏幕居中下方一点）
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "昵称（最多 20 字）";
    input.maxLength = 20;
    input.value = getNickname();
    input.style.cssText = `
      position: fixed;
      left: 50%;
      top: calc(50% - 8px);
      transform: translate(-50%, 0);
      width: ${Math.round(cardW - 60)}px;
      padding: 10px 12px;
      font-size: 16px;
      text-align: center;
      border: 2px solid #2ff3d0;
      border-radius: 10px;
      background: #0a1a2a;
      color: #ffffff;
      outline: none;
      z-index: 10000;
    `;
    document.body.appendChild(input);
    this.nicknameInput = input;
    // 移动端不要立刻弹软键盘（会把画面顶上去），仅在桌面端自动聚焦
    if (!matchMedia("(pointer: coarse)").matches) input.focus();

    const btnW = (cardW - 72) / 2;

    const closeDialog = () => {
      this._removeNicknameInput();
      this.overlayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    };

    const loadingText = new Text({
      text: "",
      style: { fontFamily: Font.sans, fontSize: Size.caption, fill: Color.warning },
    });
    loadingText.anchor.set(0.5);
    loadingText.y = -cardH / 2 + 142;
    panel.addChild(loadingText);

    const submitBtn = new Button({
      label: "提交成绩",
      width: btnW,
      height: 44,
      fontSize: 15,
      onClick: () => void handleSubmit(),
    });
    submitBtn.x = -btnW / 2 - 6;
    submitBtn.y = cardH / 2 - 44;
    panel.addChild(submitBtn);

    const skipBtn = new Button({
      label: "跳过",
      width: btnW,
      height: 44,
      fontSize: 15,
      fillColor: Color.bgPanel,
      onClick: () => {
        closeDialog();
        this._showResult(true, stars, isPerfect);
      },
    });
    skipBtn.x = btnW / 2 + 6;
    skipBtn.y = cardH / 2 - 44;
    panel.addChild(skipBtn);

    const handleSubmit = async (): Promise<void> => {
      const playerName = input.value.trim();
      if (!playerName) {
        loadingText.text = "请先输入昵称";
        loadingText.style.fill = Color.danger;
        return;
      }
      playClick();
      loadingText.text = "上传中…";
      loadingText.style.fill = Color.warning;

      try {
        await submitCampaignScore({
          levelId: this.levelConfig.id,
          playerName,
          guessCount,
          timeMs,
        });
        if (playerName !== getNickname()) setNickname(playerName);
        closeDialog();
        this._showResult(true, stars, isPerfect);
      } catch (error) {
        console.error("提交成绩失败:", error);
        loadingText.text = "上传失败，可稍后再试或跳过";
        loadingText.style.fill = Color.danger;
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void handleSubmit();
    });
  }

  private nicknameInput: HTMLInputElement | null = null;

  private _removeNicknameInput(): void {
    if (this.nicknameInput && this.nicknameInput.parentNode) {
      this.nicknameInput.parentNode.removeChild(this.nicknameInput);
    }
    this.nicknameInput = null;
  }
}
