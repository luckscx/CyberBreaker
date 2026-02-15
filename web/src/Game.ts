import type { Application } from "pixi.js";
import { Text } from "pixi.js";
import { Button } from "@/components/Button";
import { createRoom } from "@/api/room";
import { startBgm } from "@/audio/bgm";
import { HomeScene } from "@/scenes/HomeScene";
import { GuessScene } from "@/scenes/GuessScene";
import { RoomWaitScene } from "@/scenes/RoomWaitScene";
import { RoomPlayScene } from "@/scenes/RoomPlayScene";
import { RoomClient } from "@/room/client";
import type { GameMode } from "@/types";
import type { RoomRole } from "@/room/client";

export class Game {
  private homeScene: HomeScene | null = null;
  private roomClient: RoomClient | null = null;

  constructor(private app: Application) {}

  start(): void {
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
    if (mode === "room") {
      createRoom()
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
      return;
    }
    this.app.stage.removeChildren();
    const guessScene = new GuessScene(this.app, { onBack: () => this.showHome() });
    this.app.stage.addChild(guessScene);
  }

  private enterRoom(roomId: string, role: RoomRole, joinUrl?: string): void {
    const shareUrl = joinUrl ?? (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname || "/"}?room=${roomId}` : undefined);
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
          onGameStart: (turn, turnStartAt) => this.startRoomPlay(role, turn, turnStartAt),
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

  private startRoomPlay(myRole: RoomRole, initialTurn: RoomRole, turnStartAt: number): void {
    if (!this.roomClient) return;
    this.app.stage.removeChildren();
    const scene = new RoomPlayScene({
      app: this.app,
      client: this.roomClient,
      myRole,
      initialTurn,
      turnStartAt,
      onBack: () => this.leaveRoom(),
    });
    this.app.stage.addChild(scene);
  }

  private leaveRoom(): void {
    this.roomClient?.close();
    this.roomClient = null;
    this.app.stage.removeChildren();
    window.history.replaceState({}, "", window.location.pathname || "/");
    this.showHome();
  }
}
