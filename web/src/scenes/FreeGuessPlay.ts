import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { BackButton } from "@/components/BackButton";
import { MusicToggle } from "@/components/MusicToggle";
import { BackpackButton } from "@/components/BackpackButton";
import { BackpackModal } from "@/components/BackpackModal";
import { FreeRoomClient, type FreeRoomMsg, type FreePlayerInfo, type FreeRanking } from "@/freeRoom/client";
import { freeInventoryToItemData, getFreeItem } from "@/data/freeItems";

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
  private guessInput: GuessInput;
  private resultText: Text;
  private remainText: Text;
  private myHistoryContainer: Container;
  private publicContainer: Container;
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

    // Back & music
    const back = new BackButton({ x: 16, y: 16, onClick: () => opts.onBack() });
    this.addChild(back);

    const toggleSize = 48;
    const music = new MusicToggle({ x: w - 16 - toggleSize, y: 16 });
    this.addChild(music);

    // Backpack button
    const totalItems = Object.values(this.inventory).reduce((sum, count) => sum + count, 0);
    this.backpackButton = new BackpackButton({
      x: w - 16 - toggleSize * 2 - 10,
      y: 16,
      onClick: () => this._showBackpack(),
    });
    this.backpackButton.updateCount(totalItems);
    this.addChild(this.backpackButton);

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

    // --- Layout: Left 60% for input, Right 40% for history ---
    const inputY = pubY + pubH + 6;
    const leftWidth = w * 0.6;
    const rightWidth = w * 0.4;
    const padding = 12;

    // Left side: GuessInput (centered in 60% area)
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
    this.guessInput.x = leftWidth / 2;
    this.guessInput.y = inputY;
    this.addChild(this.guessInput);

    // Remaining text (below input)
    this.remainText = new Text({
      text: `剩余 ${this.guessLimit} 次`,
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    this.remainText.anchor.set(0.5);
    this.remainText.x = leftWidth / 2;
    this.remainText.y = inputY + this.guessInput.totalHeight + 4;
    this.addChild(this.remainText);

    // Result text (below remaining text)
    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0x88ff88 },
    });
    this.resultText.anchor.set(0.5);
    this.resultText.x = leftWidth / 2;
    this.resultText.y = inputY + this.guessInput.totalHeight + 20;
    this.addChild(this.resultText);

    // --- Right side: My history (40% area) ---
    const histX = leftWidth + padding;
    const histY = inputY;
    const histW = rightWidth - padding * 2;
    const histH = h - histY - 8;

    const histBg = new Graphics();
    histBg.roundRect(histX, histY, histW, histH, 8).fill({ color: 0x0d1520, alpha: 0.85 });
    histBg.roundRect(histX, histY, histW, histH, 8).stroke({ width: 1, color: 0x334455 });
    this.addChild(histBg);

    const histLabel = new Text({
      text: "我的历史",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x99aabb },
    });
    histLabel.x = histX + 8;
    histLabel.y = histY + 6;
    this.addChild(histLabel);

    this.myHistoryContainer = new Container();
    this.myHistoryContainer.x = histX + 8;
    this.myHistoryContainer.y = histY + 24;
    this.addChild(this.myHistoryContainer);

    // Item effect text (above history area)
    this.itemEffectText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xff6644, fontWeight: "bold", wordWrap: true, wordWrapWidth: histW - 12 },
    });
    this.itemEffectText.anchor.set(0, 0);
    this.itemEffectText.x = histX + 8;
    this.itemEffectText.y = histY - 18;
    this.addChild(this.itemEffectText);

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
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
    const maxShow = 15;
    const start = Math.max(0, this.myHistory.length - maxShow);
    this.myHistory.slice(start).forEach((entry, i) => {
      let text = '';
      let color = 0x00ccaa;

      if (entry.type === 'guess') {
        text = `#${start + i + 1}  ${entry.guess} → ${entry.a}A${entry.b}B`;
        color = entry.a === 4 ? 0x00ff88 : 0x00ccaa;
      } else if (entry.type === 'item') {
        text = `    🎒 ${entry.itemName}: ${entry.effect}`;
        color = 0xffaa44;
      }

      const t = new Text({
        text,
        style: { fontFamily: "Courier New, monospace", fontSize: 11, fill: color },
      });
      t.y = i * 16;
      this.myHistoryContainer.addChild(t);
    });
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
          this._renderMyHistory();
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
          this._renderMyHistory();
        } else if (effectData?.message) {
          this._showItemEffect(effectData.message);
        }
        break;

      case 'eliminate_two':
        if (effectData?.eliminated && effectData.eliminated.length > 0) {
          this.eliminatedDigits.push(...effectData.eliminated);
          const effectText = `排除${effectData.eliminated.join(',')}`;
          this._showItemEffect(`❌ 排除数字：${effectData.eliminated.join(', ')}`);
          this.myHistory.push({
            type: 'item',
            itemName,
            effect: effectText,
          });
          this._renderMyHistory();
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
          this._renderMyHistory();
        }
        break;

      default:
        this._showItemEffect('✓ 道具已使用');
    }
  }

  private _showItemEffect(text: string): void {
    if (!this.itemEffectText) return;
    this.itemEffectText.text = text;
    this.itemEffectText.alpha = 1;

    // Fade out after 2 seconds
    setTimeout(() => {
      let alpha = 1;
      const fadeInterval = setInterval(() => {
        alpha -= 0.05;
        if (alpha <= 0) {
          if (this.itemEffectText) {
            this.itemEffectText.alpha = 0;
            this.itemEffectText.text = "";
          }
          clearInterval(fadeInterval);
        } else {
          if (this.itemEffectText) this.itemEffectText.alpha = alpha;
        }
      }, 50);
    }, 2000);
  }
}
