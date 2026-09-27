import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { SceneChrome } from "@/components/SceneChrome";
import { GuessBoard, type GuessRecord } from "@/components/GuessBoard";
import { ResultBanner } from "@/components/ResultBanner";
import { BackpackButton } from "@/components/BackpackButton";
import { BackpackModal } from "@/components/BackpackModal";
import { FreeRoomClient, type FreeRoomMsg, type FreePlayerInfo, type FreeRanking } from "@/freeRoom/client";
import { freeInventoryToItemData, getFreeItem } from "@/data/freeItems";
import { ITEM_TYPE_DIGITS } from "@/types/itemTypes";
import { computePlayGeometry, computePlayScreen, observeResize } from "@/ui/layout";
import { Color, Font, Size } from "@/ui/theme";

export interface FreeGuessPlayOptions {
  app: Application;
  client: FreeRoomClient;
  guessLimit: number;
  players: FreePlayerInfo[];
  inventory?: { [itemId: string]: number };
  onBack: () => void;
  onGameOver: (msg: FreeRoomMsg) => void;
}

export class FreeGuessPlay extends Container {
  private app: Application;
  private client: FreeRoomClient;
  private guessLimit: number;
  private guessInput!: GuessInput;
  private result!: ResultBanner;
  private board!: GuessBoard;
  private remainText!: Text;
  private publicContainer!: Container;
  private chrome!: SceneChrome;
  private publicH = 88;
  private stopResize: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private myHistory: Array<
    | { type: 'guess'; guess: string; a: number; b: number }
    | { type: 'item'; itemName: string; effect: string }
  > = [];
  private ranking: FreeRanking[] = [];
  private players: FreePlayerInfo[] = [];
  private eliminated = false;
  private inventory: { [itemId: string]: number } = {};
  private backpackButton: BackpackButton | null = null;
  private backpackModal: BackpackModal | null = null;
  private itemEffectText: Text | null = null;
  private itemEffectBg: Graphics | null = null;
  private itemEffectTimer: ReturnType<typeof setInterval> | null = null;
  private eliminatedDigits: string[] = [];
  private revealedPositions: Array<{ pos: number; digit: string }> = [];
  private knownDigits: string[] = [];

  constructor(private opts: FreeGuessPlayOptions) {
    super();
    this.app = opts.app;
    this.client = opts.client;
    this.guessLimit = opts.guessLimit;
    this.players = opts.players;
    this.inventory = opts.inventory ?? {};

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;

    this._buildAll();

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.stopResize = observeResize(() => this._relayout());
  }

  /**
   * 构建全部呈现元素（构造与尺寸变化共用）。
   *
   * 分区（自上而下，键盘贴底）：
   *   顶栏 / 剩余次数 / 实时排名 / 我的历史板 / 结果条带 / 输入槽 / 键盘
   * 原有实现是「左 60% 键盘 + 右 40% 两栏 11px 纯文本历史」，手机上两栏都看
   * 不清，且键盘不贴底、矮屏会溢出。现在历史换成统一 GuessBoard 吃满宽度，
   * 键盘自下而上贴底。
   */
  private _buildAll(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this.chrome = new SceneChrome({
      width: w,
      height: h,
      onBack: () => this.opts.onBack(),
      title: "多人猜数",
      subtitle: `每人 ${this.guessLimit} 次机会 · 4 位数字可重复`,
      particleCount: 20,
      extras: ({ right, y, size }) => {
        const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
        this.backpackButton = new BackpackButton({
          x: right - size,
          y,
          size,
          onClick: () => this._showBackpack(),
        });
        this.backpackButton.updateCount(totalItems);
        return this.backpackButton;
      },
    });
    this.addChild(this.chrome);

    // 两遍布局：排行榜先按完整高度试算，若历史板被挤到不可用就把它压矮。
    const geometry = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const statsH = 24;
    let rankH = this.publicH;
    let layout = computePlayScreen({
      chrome: this.chrome,
      geometry,
      showSlots: true,
      statsH: statsH + rankH + 8,
    });
    if (layout.board.h < 150) {
      rankH = 56;
      this.publicH = rankH;
      layout = computePlayScreen({
        chrome: this.chrome,
        geometry,
        showSlots: true,
        statsH: statsH + rankH + 8,
      });
    }

    this.remainText = new Text({
      text: `剩余 ${this.guessLimit} 次`,
      style: {
        fontFamily: Font.mono,
        fontSize: Size.bodySm + 1,
        fill: Color.primary,
        fontWeight: "bold",
      },
    });
    this.remainText.anchor.set(0, 0.5);
    this.remainText.position.set(layout.board.x + 4, layout.stats.y + statsH / 2);
    this.addChild(this.remainText);

    // 实时排名
    const pubTop = layout.stats.y + statsH + 8;
    const pubBg = new Graphics();
    pubBg
      .roundRect(layout.board.x, pubTop, layout.board.w, rankH, 10)
      .fill({ color: Color.bgPanel, alpha: 0.85 });
    pubBg
      .roundRect(layout.board.x, pubTop, layout.board.w, rankH, 10)
      .stroke({ width: 1, color: Color.line, alpha: 0.9 });
    this.addChild(pubBg);

    const pubLabel = new Text({
      text: "📊 实时排名",
      style: { fontFamily: Font.sans, fontSize: Size.caption, fill: Color.textSub },
    });
    pubLabel.position.set(layout.board.x + 10, pubTop + 4);
    this.addChild(pubLabel);

    this.publicContainer = new Container();
    this.publicContainer.position.set(layout.board.x + 10, pubTop + 20);
    this.addChild(this.publicContainer);
    this._renderPublicBoard();

    // 我的历史（统一历史板）
    this.board = new GuessBoard({
      width: layout.board.w,
      height: layout.board.h,
      title: "我的猜测",
      emptyText: "还没有提交过\n输入 4 位数字后确认",
    });
    this.board.x = layout.board.x;
    this.board.y = layout.board.y;
    this.addChild(this.board);
    this._syncBoard();

    // 结果条带
    this.result = new ResultBanner({
      width: layout.board.w,
      idleText: "提交后立刻显示 A / B 反馈",
    });
    this.result.x = layout.board.x;
    this.result.y = layout.result.y;
    this.addChild(this.result);

    // 输入（键盘贴底）
    this.guessInput = new GuessInput({
      screenWidth: w,
      itemType: ITEM_TYPE_DIGITS,
      allowRepeat: true,
      onSubmit: (guess) => this._submitGuess(guess),
    });
    this.guessInput.x = layout.centerX;
    this.guessInput.y = layout.inputTop;
    this.addChild(this.guessInput);

    // 重建（旋转 / 缩放）后恢复道具已排除的数字，否则一旋转效果就丢
    if (this.eliminatedDigits.length > 0) {
      this.guessInput.setEliminatedItems(this.eliminatedDigits);
    }

    // 道具效果浮动提示：叠在历史板正中，2 秒后淡出。
    // 最后 addChild 以保证盖在历史板之上；背景药丸宽度随文本实测宽度重算。
    this.itemEffectBg = new Graphics();
    this.addChild(this.itemEffectBg);
    this.itemEffectText = new Text({
      text: "",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.bodySm,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    this.itemEffectText.anchor.set(0.5);
    this.itemEffectText.x = layout.centerX;
    this.itemEffectText.y = layout.board.y + layout.board.h / 2;
    this.itemEffectText.alpha = 0;
    this.addChild(this.itemEffectText);

    if (this.eliminated) this.guessInput.setEnabled(false);
  }

  /** 尺寸变化：重建呈现层。WS 订阅与历史数据都在成员变量里，不受影响。 */
  private _relayout(): void {
    this._clearItemEffectTimer();
    this.backpackModal = null;
    this.backpackButton = null;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._buildAll();
  }

  private _clearItemEffectTimer(): void {
    if (this.itemEffectTimer) {
      clearInterval(this.itemEffectTimer);
      this.itemEffectTimer = null;
    }
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this._clearItemEffectTimer();
    this.stopResize?.();
    this.stopResize = null;
    this.unsub?.();
    super.destroy(options);
  }

  private _onMsg(msg: FreeRoomMsg): void {
    if (msg.type === "item_used") {
      this._onItemUsed(msg);
      return;
    }
    if (msg.type === "guess_result") {
      this.myHistory.push({
        type: 'guess',
        guess: msg.guess!,
        a: msg.a!,
        b: msg.b!,
      });
      this.remainText.text = `剩余 ${msg.remaining ?? 0} 次`;
      if (msg.remaining === 0) {
        this.eliminated = true;
        this.result.showError("次数已用完，等待其他玩家…");
        this.guessInput.setEnabled(false);
      } else {
        this.result.show(msg.guess!, msg.a!, msg.b!);
      }
      this._syncBoard();
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
      this.result.showError(msg.message ?? "错误");
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

    // 面板高度会随屏幕压缩，据此决定最多显示几行，避免文字溢出面板
    const maxRows = Math.max(2, Math.floor((this.publicH - 22) / 14));
    list.slice(0, maxRows).forEach((p, i) => {
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

  /** 把结构化历史推给统一历史板；道具使用记录渲染为 note 行 */
  private _syncBoard(): void {
    const records: GuessRecord[] = this.myHistory.map((e) =>
      e.type === 'guess'
        ? { guess: e.guess, a: e.a, b: e.b }
        : { guess: '', a: 0, b: 0, note: `🎒 ${e.itemName}：${e.effect}` }
    );
    this.board.setRecords(records);
  }

  private _submitGuess(guess: string): void {
    if (this.eliminated) return;
    this.client.submitGuess(guess);
  }

  private _showBackpack(): void {
    if (this.backpackModal || this.eliminated) return;

    const items = freeInventoryToItemData(this.inventory);
    this.backpackModal = new BackpackModal({
      app: this.app,
      items,
      disabled: this.eliminated,
      onUseItem: (itemId) => this._useItem(itemId),
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

  private _useItem(itemId: string): void {
    if (this.eliminated) return;

    const count = this.inventory[itemId] ?? 0;
    if (count <= 0) {
      this._showItemEffect("道具数量不足");
      return;
    }

    // Send use item message
    this.client.useItem(itemId);

    // Optimistically update local inventory
    this.inventory[itemId] = count - 1;

    // Update backpack button badge
    const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
    if (this.backpackButton) {
      this.backpackButton.updateCount(totalItems);
    }

    // Update modal if open
    if (this.backpackModal) {
      this.backpackModal.updateItemCount(itemId, this.inventory[itemId]);
    }

    // Close backpack
    this._hideBackpack();
  }

  private _onItemUsed(msg: FreeRoomMsg): void {
    const itemId = msg.itemId as string;
    const effectData = msg.effectData;
    const inventory = msg.inventory;

    // Update inventory from server
    if (inventory) {
      this.inventory = inventory;
      const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
      if (this.backpackButton) {
        this.backpackButton.updateCount(totalItems);
      }
    }

    // Apply visual effects
    this._applyItemEffect(itemId, effectData);
  }

  private _applyItemEffect(itemId: string, effectData: any): void {
    const effect = effectData?.effect;

    // Get item name from config
    const itemConfig = getFreeItem(itemId);
    const itemName = itemConfig?.name ?? '道具';

    switch (effect) {
      case 'extra_guess':
        if (effectData?.amount) {
          const effectText = `+${effectData.amount}次机会`;
          this._showItemEffect(`➕ 获得额外${effectData.amount}次机会！`);
          this.myHistory.push({
            type: 'item',
            itemName,
            effect: effectText,
          });
          this._syncBoard();
          // Note: guessLimit increase is handled by server
        }
        break;

      case 'reveal_one':
        if (effectData?.position != null && effectData?.digit != null) {
          this.revealedPositions.push({ pos: effectData.position, digit: effectData.digit });
          const effectText = `位置${effectData.position + 1}=${effectData.digit}`;
          this._showItemEffect(`🔍 揭示：${effectText}`);
          this.myHistory.push({
            type: 'item',
            itemName,
            effect: effectText,
          });
          this._syncBoard();
        } else if (effectData?.message) {
          this._showItemEffect(effectData.message);
        }
        break;

      case 'eliminate_two':
        if (effectData?.eliminated && effectData.eliminated.length > 0) {
          this.eliminatedDigits.push(...effectData.eliminated);
          // 把排除结果真正接到键盘上（置灰 + 「已排除」角标），
          // 否则道具只是记了一行历史，对下一次输入毫无帮助。
          this.guessInput.setEliminatedItems(this.eliminatedDigits);
          const effectText = `排除${effectData.eliminated.join(',')}`;
          this._showItemEffect(`❌ 排除数字：${effectData.eliminated.join(', ')}`);
          this.myHistory.push({
            type: 'item',
            itemName,
            effect: effectText,
          });
          this._syncBoard();
        } else if (effectData?.message) {
          this._showItemEffect(effectData.message);
        }
        break;

      case 'hint':
        if (effectData?.digits) {
          this.knownDigits = effectData.digits;
          const effectText = `含${effectData.digits.join(',')}`;
          this._showItemEffect(`💡 提示：答案包含 ${effectData.digits.join(', ')}`);
          this.myHistory.push({
            type: 'item',
            itemName,
            effect: effectText,
          });
          this._syncBoard();
        }
        break;

      default:
        this._showItemEffect('✓ 道具已使用');
    }
  }

  private _showItemEffect(text: string): void {
    if (!this.itemEffectText || !this.itemEffectBg) return;
    this.itemEffectText.text = text;

    // 药丸背景按文本实测宽度重算，避免长提示文字溢出底色
    const padX = 12;
    const padY = 6;
    const bw = this.itemEffectText.width + padX * 2;
    const bh = this.itemEffectText.height + padY * 2;
    const bx = this.itemEffectText.x - bw / 2;
    const by = this.itemEffectText.y - bh / 2;
    this.itemEffectBg
      .clear()
      .roundRect(bx, by, bw, bh, bh / 2)
      .fill({ color: 0x0a1a22, alpha: 0.92 })
      .stroke({ width: 1, color: Color.primary, alpha: 0.7 });

    this.itemEffectBg.alpha = 1;
    this.itemEffectText.alpha = 1;

    // 先清掉上一次的淡出定时器：连续使用道具时旧的 interval 不清理会叠加，
    // 多个 interval 同时写 alpha 会让提示闪动甚至卡在中间透明度。
    if (this.itemEffectTimer) {
      clearInterval(this.itemEffectTimer);
      this.itemEffectTimer = null;
    }

    // Fade out after 2 seconds
    setTimeout(() => {
      let alpha = 1;
      this.itemEffectTimer = setInterval(() => {
        alpha -= 0.05;
        if (alpha <= 0) {
          if (this.itemEffectTimer) {
            clearInterval(this.itemEffectTimer);
            this.itemEffectTimer = null;
          }
          if (this.itemEffectText) {
            this.itemEffectText.alpha = 0;
            this.itemEffectText.text = "";
          }
          if (this.itemEffectBg) {
            this.itemEffectBg.alpha = 0;
            this.itemEffectBg.clear();
          }
        } else {
          if (this.itemEffectText) this.itemEffectText.alpha = alpha;
          if (this.itemEffectBg) this.itemEffectBg.alpha = alpha;
        }
      }, 50);
    }, 2000);
  }
}
