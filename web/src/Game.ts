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
import { SettingsScene } from "@/scenes/SettingsScene";
import { RoomWaitScene } from "@/scenes/RoomWaitScene";
import { RoomPlayScene } from "@/scenes/RoomPlayScene";
import { RoomGuessPersonScene } from "@/scenes/RoomGuessPersonScene";
import { RoomClient } from "@/room/client";
import { FreeRoomClient, type FreePlayerInfo, type FreeRoomMsg } from "@/freeRoom/client";
import { FreeGuessHome } from "@/scenes/FreeGuessHome";
import { FreeGuessLobby } from "@/scenes/FreeGuessLobby";
import { FreeGuessPlay } from "@/scenes/FreeGuessPlay";
import { FreeGuessSettlement } from "@/scenes/FreeGuessSettlement";
import type { GameMode } from "@/types";
import type { RoomRole, RoomMsg, GpCandidateQuestion } from "@/room/client";
import { getUserUUID } from "@/utils/uuid";
import { getNickname } from "@/services/settingsManager";

export class Game {
  private homeScene: HomeScene | null = null;
  private roomClient: RoomClient | null = null;
  private currentJoinUrl: string | undefined = undefined;
  private freeClient: FreeRoomClient | null = null;
  private freeInventory: { [itemId: string]: number } = {};
  private freeRoomIntentionalLeave = false;

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
    const freeCode = params.get("free");
    if (freeCode) {
      this.enterFreeRoom(freeCode, false);
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
    if (mode === "free_room") {
      this.showFreeGuessHome();
      return;
    }
    if (mode === "settings") {
      this.showSettings();
      return;
    }
    this.app.stage.removeChildren();
    const guessScene = new GuessScene(this.app, { onBack: () => this.showHome() });
    this.app.stage.addChild(guessScene);
  }

  private showSettings(): void {
    this.app.stage.removeChildren();
    const settingsScene = new SettingsScene(this.app, {
      onBack: () => this.showHome(),
    });
    this.app.stage.addChild(settingsScene);
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

    scene.addChild(makeCard(startY, "标准对战", "4 位不重复数字\n反馈：\n几个数字位置正确(A)\n几个数字对但位置错(B)", "standard"));
    scene.addChild(makeCard(startY + cardH + cardGap, "位置赛", "4 位数字可重复\n仅反馈：几个位置完全正确(A)", "position_only"));
    scene.addChild(makeCard(startY + (cardH + cardGap) * 2, "猜人名", "系统随机选一位名人\n双方轮流选题获取线索\n抢先猜出人名即获胜！", "guess_person"));

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

        // 监听 gp_game_start 消息（猜人名模式跳过等待场景直接开始）
        let gpUnsub: (() => void) | null = null;
        gpUnsub = this.roomClient!.onMessage((msg: RoomMsg) => {
          if (msg.type === "gp_game_start") {
            gpUnsub?.();
            this.startGuessPersonPlay(
              role,
              msg.turn ?? "host",
              msg.turnStartAt ?? Date.now(),
              msg.totalQuestions ?? 20,
              msg.candidateQuestions ?? [],
            );
          }
          // 重连到进行中的猜人名游戏
          if (msg.type === "room_joined" && msg.isReconnect && msg.rule === "guess_person" && msg.state === "playing") {
            gpUnsub?.();
            setTimeout(() => {
              this.startGuessPersonPlay(
                role,
                msg.turn ?? "host",
                msg.turnStartAt ?? Date.now(),
                msg.gpTotalQuestions ?? 20,
                msg.gpCandidateQuestions ?? [],
                msg.gpQAHistory,
                msg.gpWrongGuesses,
                msg.gpAskedCount,
                msg.gpAllAsked,
              );
            }, 500);
          }
        });

        const scene = new RoomWaitScene({
          app: this.app,
          client: this.roomClient!,
          roomId,
          role,
          joinUrl: shareUrl,
          onGameStart: (turn, turnStartAt, rule, myCode, history) => this.startRoomPlay(role, turn, turnStartAt, rule, myCode, history),
          onBack: () => { gpUnsub?.(); this.leaveRoom(); },
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
    myCode: string,
    inventory?: { [itemId: string]: number },
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
      myCode,
      joinUrl: this.currentJoinUrl,
      inventory,
      onBack: () => this.leaveRoom(),
      history,
    });
    this.app.stage.addChild(scene);
  }

  private startGuessPersonPlay(
    myRole: RoomRole,
    initialTurn: RoomRole,
    turnStartAt: number,
    totalQuestions: number,
    candidateQuestions: GpCandidateQuestion[],
    gpQAHistory?: { question: string; answer: string; askedBy: RoomRole }[],
    gpWrongGuesses?: { role: RoomRole; name: string }[],
    gpAskedCount?: number,
    gpAllAsked?: boolean,
  ): void {
    if (!this.roomClient) return;
    this.app.stage.removeChildren();
    const scene = new RoomGuessPersonScene({
      app: this.app,
      client: this.roomClient,
      myRole,
      initialTurn,
      turnStartAt,
      totalQuestions,
      candidateQuestions,
      joinUrl: this.currentJoinUrl,
      onBack: () => this.leaveRoom(),
      gpQAHistory,
      gpWrongGuesses,
      gpAskedCount,
      gpAllAsked,
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

  /* ═══════ Free Room (多人自由猜数) ═══════ */

  private showFreeGuessHome(): void {
    this.app.stage.removeChildren();
    const scene = new FreeGuessHome({
      app: this.app,
      onBack: () => this.showHome(),
      onEnterRoom: (roomCode, isHost, password) => this.enterFreeRoom(roomCode, isHost, password),
    });
    this.app.stage.addChild(scene);
  }

  private enterFreeRoom(roomCode: string, isHost: boolean, password?: string): void {
    const uuid = getUserUUID();
    const nickname = getNickname();
    const playerId = uuid;

    this.freeClient = new FreeRoomClient();
    this.freeRoomIntentionalLeave = false;

    // Listen for unexpected disconnections
    this.freeClient.onClose(() => {
      // Only show error if it was not an intentional leave
      if (!this.freeRoomIntentionalLeave) {
        console.warn("[Game] Free room connection closed unexpectedly");
        this._showErrorAndReturnHome("连接已断开");
      }
    });

    this.freeClient.connect(roomCode, nickname, playerId, password).then(
      () => {
        let lobbyUnsub: (() => void) | null = null;
        lobbyUnsub = this.freeClient!.onMessage((msg: FreeRoomMsg) => {
          // Handle error messages from server
          if (msg.type === "error") {
            console.error("[Game] Free room error:", msg.message);
            lobbyUnsub?.();
            this.leaveFreeRoom();
            this._showErrorAndReturnHome(msg.message ?? "房间错误");
            return;
          }

          if (msg.type === "joined") {
            lobbyUnsub?.();
            // Save inventory
            if (msg.inventory) {
              this.freeInventory = msg.inventory;
            }
            this.showFreeGuessLobby(
              roomCode,
              msg.roomName ?? `房间 ${roomCode}`,
              msg.guessLimit ?? 10,
              isHost,
            );
          }
        });
      },
      (error) => {
        console.error("[Game] Free room connection failed:", error);
        this._showErrorAndReturnHome("连接房间失败");
      }
    );
  }

  private _showErrorAndReturnHome(errorMsg: string): void {
    this.app.stage.removeChildren();

    const container = new Container();

    const err = new Text({
      text: errorMsg,
      style: { fontFamily: "system-ui", fontSize: 18, fill: 0xff6644, fontWeight: "bold" },
    });
    err.anchor.set(0.5);
    err.x = this.app.screen.width / 2;
    err.y = this.app.screen.height / 2 - 30;
    container.addChild(err);

    const hint = new Text({
      text: "2秒后返回首页...",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = this.app.screen.width / 2;
    hint.y = this.app.screen.height / 2 + 10;
    container.addChild(hint);

    this.app.stage.addChild(container);

    // Auto return to home after 2 seconds
    setTimeout(() => {
      this.showHome();
    }, 2000);
  }

  private showFreeGuessLobby(roomCode: string, roomName: string, guessLimit: number, isHost: boolean): void {
    // 更新 URL 为可分享的加入链接
    if (typeof window !== "undefined") {
      const joinUrl = `${window.location.pathname || "/"}?free=${roomCode}`;
      window.history.replaceState({}, "", joinUrl);
    }
    this.app.stage.removeChildren();
    const scene = new FreeGuessLobby({
      app: this.app,
      client: this.freeClient!,
      roomCode,
      roomName,
      guessLimit,
      isHost,
      onBack: () => this.leaveFreeRoom(),
      onGameStart: (limit, players) => this.showFreeGuessPlay(limit, players, isHost),
    });
    this.app.stage.addChild(scene);
  }

  private showFreeGuessPlay(guessLimit: number, players: FreePlayerInfo[], isHost: boolean): void {
    this.app.stage.removeChildren();
    const scene = new FreeGuessPlay({
      app: this.app,
      client: this.freeClient!,
      guessLimit,
      players,
      inventory: this.freeInventory,
      onBack: () => this.leaveFreeRoom(),
      onGameOver: (msg) => this.showFreeGuessSettlement(msg, isHost),
    });
    this.app.stage.addChild(scene);
  }

  private showFreeGuessSettlement(msg: FreeRoomMsg, isHost: boolean): void {
    this.app.stage.removeChildren();
    const scene = new FreeGuessSettlement({
      app: this.app,
      msg,
      myPlayerId: this.freeClient!.playerId,
      isHost,
      onRestart: () => {
        this.freeClient!.restart();
        let restartUnsub: (() => void) | null = null;
        restartUnsub = this.freeClient!.onMessage((m: FreeRoomMsg) => {
          if (m.type === "game_start") {
            restartUnsub?.();
            this.showFreeGuessPlay(m.guessLimit ?? 10, m.players ?? [], isHost);
          }
        });
      },
      onExit: () => this.leaveFreeRoom(),
    });
    this.app.stage.addChild(scene);
  }

  private leaveFreeRoom(): void {
    this.freeRoomIntentionalLeave = true;
    this.freeClient?.close();
    this.freeClient = null;
    this.app.stage.removeChildren();
    window.history.replaceState({}, "", window.location.pathname || "/");
    this.showHome();
  }
}
