import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { BackButton } from "@/components/BackButton";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { playClick } from "@/audio/click";
import { createRoom, type RoomRule } from "@/api/room";
import { startBgm } from "@/audio/bgm";
import { HomeScene } from "@/scenes/HomeScene";
import { GuessScene } from "@/scenes/GuessScene";
import { LevelSelectScene } from "@/scenes/LevelSelectScene";
import { CampaignScene } from "@/scenes/CampaignScene";
import { LeaderboardScene } from "@/scenes/LeaderboardScene";
import { RoomWaitScene } from "@/scenes/RoomWaitScene";
import { RoomPlayScene } from "@/scenes/RoomPlayScene";
import { RoomClient } from "@/room/client";
import type { GameMode } from "@/types";
import type { RoomRole } from "@/room/client";
import { getUserUUID } from "@/utils/uuid";

export class Game {
  private homeScene: HomeScene | null = null;
  private roomClient: RoomClient | null = null;
  private currentJoinUrl: string | undefined = undefined;

  constructor(private app: Application) {}

  start(): void {
    // 自动生成或加载用户 UUID (静默执行)
    getUserUUID();

    startBgm();
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      this.joinRoom(roomId);
      return;
    }
    this.showHome();
  }

  private showHome(): void {
    this.app.stage.removeChildren();
    this.homeScene = new HomeScene(this.app, {
      onModeSelect: (mode) => this.onModeSelect(mode),
    });
    this.app.stage.addChild(this.homeScene);
  }

  private onModeSelect(mode: GameMode): void {
    if (mode === "campaign") {
      this.showLevelSelect();
      return;
    }
    if (mode === "leaderboard") {
      this.showLeaderboard();
      return;
    }
    if (mode === "room") {
      this.showRuleSelect();
      return;
    }
    this.app.stage.removeChildren();
    const guessScene = new GuessScene(this.app, { onBack: () => this.showHome() });
    this.app.stage.addChild(guessScene);
  }

  private showRuleSelect(): void {
    this.app.stage.removeChildren();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;

    const scene = new Container();

    const bg = new Background({ width: w, height: h, particleCount: 20 });
    scene.addChild(bg);
    this.app.ticker.add(() => bg.animate());

    const backButton = new BackButton({
      x: 16 + 24,
      y: 16 + 24,
      onClick: () => { playClick(); this.showHome(); },
    });
    scene.addChild(backButton);

    const margin = 16;
    const musicToggle = new MusicToggle({ x: w - margin - 24, y: margin + 24 });
    scene.addChild(musicToggle);

    const title = new Text({
      text: "选择对战规则",
      style: { fontFamily: "system-ui", fontSize: 24, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = h * 0.18;
    scene.addChild(title);

    const cardW = Math.min(280, w - 40);
    const cardH = 130;
    const cardGap = 20;
    const startY = h * 0.3;

    const makeCard = (y: number, name: string, desc: string, rule: RoomRule) => {
      const card = new Container();
      card.eventMode = "static";
      card.cursor = "pointer";

      const border = new Graphics();
      border.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).fill({ color: 0x0d1520, alpha: 0.95 });
      border.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).stroke({ width: 2, color: 0x334455 });
      card.addChild(border);

      const nameText = new Text({
        text: name,
        style: { fontFamily: "system-ui", fontSize: 18, fill: 0x00ffcc, fontWeight: "bold" },
      });
      nameText.anchor.set(0.5);
      nameText.y = -30;
      card.addChild(nameText);

      const descText = new Text({
        text: desc,
        style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb, wordWrap: true, wordWrapWidth: cardW - 40 },
      });
      descText.anchor.set(0.5);
      descText.y = 10;
      card.addChild(descText);

      card.x = cx;
      card.y = y;

      card.on("pointerover", () => { border.tint = 0x22ccaa; });
      card.on("pointerout", () => { border.tint = 0xffffff; });
      card.on("pointertap", () => { playClick(); this.createAndEnterRoom(rule); });

      return card;
    };

    scene.addChild(makeCard(startY, "标准对战", "4 位不重复数字\n反馈：几个数字位置正确(A)、几个数字对但位置错(B)", "standard"));
    scene.addChild(makeCard(startY + cardH + cardGap, "位置赛", "4 位数字可重复\n仅反馈：几个位置完全正确", "position_only"));

    this.app.stage.addChild(scene);
  }

  private createAndEnterRoom(rule: RoomRule): void {
    createRoom(rule)
      .then((data) => {
        this.enterRoom(data.roomId, "host", data.joinUrl);
      })
      .catch(() => {
        this.app.stage.removeChildren();
        const cx = this.app.screen.width / 2;
        const err = new Text({
          text: "创建房间失败，请确认服务端已启动",
          style: { fontFamily: "system-ui", fontSize: 18, fill: 0xff6644 },
        });
        err.anchor.set(0.5);
        err.x = cx;
        err.y = this.app.screen.height / 2 - 30;
        this.app.stage.addChild(err);
        const backBtn = new Button({
          label: "返回",
          width: 100,
          onClick: () => this.showHome(),
        });
        backBtn.x = cx;
        backBtn.y = this.app.screen.height / 2 + 20;
        this.app.stage.addChild(backBtn);
      });
  }

  private showLevelSelect(): void {
    this.app.stage.removeChildren();
    const levelSelectScene = new LevelSelectScene(this.app, {
      onBack: () => this.showHome(),
      onLevelSelect: (levelId) => this.startLevel(levelId),
    });
    this.app.stage.addChild(levelSelectScene);

    // 添加动画
    const animateTicker = () => {
      levelSelectScene.animate();
    };
    this.app.ticker.add(animateTicker);
  }

  private showLeaderboard(): void {
    this.app.stage.removeChildren();
    const leaderboardScene = new LeaderboardScene(this.app, {
      onBack: () => this.showHome(),
    });
    this.app.stage.addChild(leaderboardScene);

    // 添加动画
    const animateTicker = () => {
      leaderboardScene.animate();
    };
    this.app.ticker.add(animateTicker);
  }

  private startLevel(levelId: number): void {
    this.app.stage.removeChildren();
    const campaignScene = new CampaignScene(this.app, {
      levelId,
      onBack: () => this.showLevelSelect(),
      onNextLevel: (nextId) => this.startLevel(nextId),
    });
    this.app.stage.addChild(campaignScene);

    // 添加动画
    const animateTicker = () => {
      campaignScene.animate();
    };
    this.app.ticker.add(animateTicker);
  }

  private enterRoom(roomId: string, role: RoomRole, joinUrl?: string): void {
    const shareUrl = joinUrl ?? (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname || "/"}?room=${roomId}` : undefined);
    this.currentJoinUrl = shareUrl;
    this.roomClient = new RoomClient();
    this.roomClient.connect(roomId, role).then(
      () => {
        this.app.stage.removeChildren();
        const scene = new RoomWaitScene({
          app: this.app,
          client: this.roomClient!,
          roomId,
          role,
          joinUrl: shareUrl,
          onGameStart: (turn, turnStartAt, rule, history) => this.startRoomPlay(role, turn, turnStartAt, rule, history),
          onBack: () => this.leaveRoom(),
        });
        this.app.stage.addChild(scene);
      },
      () => {
        this.app.stage.removeChildren();
        const err = new Text({
          text: "连接房间失败",
          style: { fontFamily: "system-ui", fontSize: 20, fill: 0xff6644 },
        });
        err.anchor.set(0.5);
        err.x = this.app.screen.width / 2;
        err.y = this.app.screen.height / 2;
        this.app.stage.addChild(err);
      }
    );
  }

  private joinRoom(roomId: string): void {
    this.enterRoom(roomId, "guest");
  }

  private startRoomPlay(
    myRole: RoomRole,
    initialTurn: RoomRole,
    turnStartAt: number,
    rule: import("@/room/client").RoomRule,
    history?: { role: RoomRole; guess: string; result: string; timestamp: number }[]
  ): void {
    if (!this.roomClient) return;
    this.app.stage.removeChildren();
    const scene = new RoomPlayScene({
      app: this.app,
      client: this.roomClient,
      myRole,
      initialTurn,
      turnStartAt,
      rule,
      joinUrl: this.currentJoinUrl,
      onBack: () => this.leaveRoom(),
      history,
    });
    this.app.stage.addChild(scene);
  }

  private leaveRoom(): void {
    this.roomClient?.close();
    this.roomClient = null;
    this.currentJoinUrl = undefined;
    this.app.stage.removeChildren();
    window.history.replaceState({}, "", window.location.pathname || "/");
    this.showHome();
  }
}
