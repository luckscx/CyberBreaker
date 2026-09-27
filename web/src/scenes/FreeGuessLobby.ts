import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";


import { SceneChrome } from "@/components/SceneChrome";
import { playClick } from "@/audio/click";
import { FreeRoomClient, type FreeRoomMsg, type FreePlayerInfo } from "@/freeRoom/client";

export interface FreeGuessLobbyOptions {
  app: Application;
  client: FreeRoomClient;
  roomCode: string;
  roomName: string;
  guessLimit: number;
  isHost: boolean;
  onBack: () => void;
  onGameStart: (guessLimit: number, players: FreePlayerInfo[]) => void;
}

export class FreeGuessLobby extends Container {
  private app: Application;
  private client: FreeRoomClient;
  private isHost: boolean;
  private playerListContainer: Container;
  private playerCountText: Text;
  private statusText: Text;
  private startBtn: Button | null = null;
  private unsub: (() => void) | null = null;
  private chrome!: SceneChrome;
  private players: FreePlayerInfo[] = [];

  constructor(private opts: FreeGuessLobbyOptions) {
    super();
    this.app = opts.app;
    this.client = opts.client;
    this.isHost = opts.isHost;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;

    // 统一顶栏
    this.chrome = new SceneChrome({
      width: w,
      height: h,
      onBack: () => { playClick(); opts.onBack(); },
      title: opts.roomName,
      particleCount: 20,
    });
    this.addChild(this.chrome);
    this.app.ticker.add(this._animate, this);

    const codeText = new Text({
      text: `房间码：${opts.roomCode}`,
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0xffdd44, fontWeight: "bold", letterSpacing: 2 },
    });
    codeText.anchor.set(0.5);
    codeText.x = cx; codeText.y = 96;
    this.addChild(codeText);

    const limitText = new Text({
      text: `猜数上限：${opts.guessLimit} 次`,
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    limitText.anchor.set(0.5);
    limitText.x = cx; limitText.y = 118;
    this.addChild(limitText);

    this.playerCountText = new Text({
      text: "玩家 0/8",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x99aabb },
    });
    this.playerCountText.anchor.set(0.5);
    this.playerCountText.x = cx; this.playerCountText.y = 142;
    this.addChild(this.playerCountText);

    // Player list area
    const listY = 165;
    const listH = h - listY - 120;
    const listW = Math.min(300, w - 40);

    const listBg = new Graphics();
    listBg.roundRect(cx - listW / 2, listY, listW, listH, 10).fill({ color: 0x0d1520, alpha: 0.9 });
    listBg.roundRect(cx - listW / 2, listY, listW, listH, 10).stroke({ width: 1, color: 0x334455 });
    this.addChild(listBg);

    this.playerListContainer = new Container();
    this.playerListContainer.x = cx - listW / 2 + 16;
    this.playerListContainer.y = listY + 10;
    this.addChild(this.playerListContainer);

    // Start button (host only)
    if (this.isHost) {
      this.startBtn = new Button({
        label: "开始游戏",
        width: 200,
        fontSize: 16,
        onClick: () => this._startGame(),
      });
      this.startBtn.x = cx;
      this.startBtn.y = h - 70;
      this.startBtn.eventMode = "none";
      this.startBtn.alpha = 0.4;
      this.addChild(this.startBtn);
    }

    // Waiting text for non-host
    if (!this.isHost) {
      const waitText = new Text({
        text: "等待房主开始游戏...",
        style: { fontFamily: "system-ui", fontSize: 14, fill: 0x99aabb },
      });
      waitText.anchor.set(0.5);
      waitText.x = cx; waitText.y = h - 70;
      this.addChild(waitText);
    }

    this.statusText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xff6644 },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.x = cx; this.statusText.y = h - 38;
    this.addChild(this.statusText);

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
  }

  private _onMsg(msg: FreeRoomMsg): void {
    if (msg.type === "player_list") {
      this.players = msg.players ?? [];
      this._renderPlayers();
    }
    if (msg.type === "game_start") {
      this.opts.onGameStart(msg.guessLimit ?? this.opts.guessLimit, msg.players ?? this.players);
    }
    if (msg.type === "error") {
      this.statusText.text = msg.message ?? "错误";
    }
  }

  private _renderPlayers(): void {
    this.playerListContainer.removeChildren();
    this.playerCountText.text = `玩家 ${this.players.length}/8`;

    if (this.startBtn) {
      const canStart = this.players.length >= 1;
      this.startBtn.eventMode = canStart ? "static" : "none";
      this.startBtn.alpha = canStart ? 1 : 0.4;
    }

    this.players.forEach((p, i) => {
      const row = new Container();
      row.y = i * 32;

      const icon = new Text({
        text: p.isHost ? "👑" : "👤",
        style: { fontFamily: "system-ui", fontSize: 14 },
      });
      icon.x = 0; icon.y = 4;
      row.addChild(icon);

      const name = new Text({
        text: p.nickname,
        style: { fontFamily: "system-ui", fontSize: 14, fill: p.playerId === this.client.playerId ? 0x00ffcc : 0xccddee },
      });
      name.x = 26; name.y = 4;
      row.addChild(name);

      if (p.playerId === this.client.playerId) {
        const me = new Text({
          text: "(我)",
          style: { fontFamily: "system-ui", fontSize: 11, fill: 0x00ffcc },
        });
        me.x = name.x + name.width + 4; me.y = 6;
        row.addChild(me);
      }

      this.playerListContainer.addChild(row);
    });
  }

  private _startGame(): void {
    this.client.start();
  }

  private _animate = (): void => {
    this.chrome?.animate();
  };

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.app.ticker.remove(this._animate, this);
    this.unsub?.();
    super.destroy(options);
  }
}
