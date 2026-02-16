import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import type { FreeRoomMsg, FreeRanking } from "@/freeRoom/client";

export interface FreeGuessSettlementOptions {
  app: Application;
  msg: FreeRoomMsg;
  myPlayerId: string;
  isHost: boolean;
  onRestart: () => void;
  onExit: () => void;
}

export class FreeGuessSettlement extends Container {
  constructor(private opts: FreeGuessSettlementOptions) {
    super();
    const { app, msg, myPlayerId, isHost, onRestart, onExit } = opts;
    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;

    // Full overlay
    const bg = new Graphics();
    bg.rect(0, 0, w, h).fill({ color: 0x0a0e14, alpha: 0.95 });
    this.addChild(bg);
    this.eventMode = "static";

    const iWon = msg.winnerId === myPlayerId;
    const isTie = !msg.winnerId;
    const reason = msg.reason === "cracked" ? "有玩家破解成功！" : "所有人次数用尽";

    // Title
    const titleText = isTie ? "平局！" : iWon ? "你赢了！" : "游戏结束";
    const titleColor = isTie ? 0xffdd44 : iWon ? 0x00ffcc : 0xff6644;

    const title = new Text({
      text: titleText,
      style: { fontFamily: "system-ui", fontSize: 36, fill: titleColor, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx; title.y = h * 0.1;
    this.addChild(title);

    const reasonText = new Text({
      text: reason,
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x99aabb },
    });
    reasonText.anchor.set(0.5);
    reasonText.x = cx; reasonText.y = h * 0.16;
    this.addChild(reasonText);

    // Secret reveal
    const secretText = new Text({
      text: `答案：${msg.secret ?? "????"}`,
      style: { fontFamily: "system-ui", fontSize: 22, fill: 0xffdd44, fontWeight: "bold", letterSpacing: 4 },
    });
    secretText.anchor.set(0.5);
    secretText.x = cx; secretText.y = h * 0.22;
    this.addChild(secretText);

    // Ranking table
    const ranking: FreeRanking[] = msg.ranking ?? [];
    const tableY = h * 0.28;
    const tableW = Math.min(320, w - 30);
    const rowH = 28;
    const tableH = Math.min(ranking.length * rowH + 30, h * 0.45);

    const tableBg = new Graphics();
    tableBg.roundRect(cx - tableW / 2, tableY, tableW, tableH, 10).fill({ color: 0x0d1520, alpha: 0.95 });
    tableBg.roundRect(cx - tableW / 2, tableY, tableW, tableH, 10).stroke({ width: 1, color: 0x334455 });
    this.addChild(tableBg);

    // Table header
    const colX = [0, 28, 120, 180, 240];
    const headers = ["#", "玩家", "次数", "最佳", "状态"];
    headers.forEach((hdr, i) => {
      const t = new Text({
        text: hdr,
        style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
      });
      t.x = cx - tableW / 2 + 12 + colX[i];
      t.y = tableY + 8;
      this.addChild(t);
    });

    ranking.forEach((p, i) => {
      const y = tableY + 28 + i * rowH;
      const isMe = p.playerId === myPlayerId;
      const isWinner = p.playerId === msg.winnerId;
      const fill = isWinner ? 0x00ff88 : isMe ? 0x00ffcc : 0xccddee;

      const vals = [
        `${p.rank}`,
        (p.nickname.length > 5 ? p.nickname.slice(0, 5) + ".." : p.nickname) + (isMe ? "(我)" : ""),
        String(p.submitCount),
        `${p.bestScore}/4`,
        isWinner ? "🏆" : "—",
      ];

      vals.forEach((v, ci) => {
        const t = new Text({
          text: v,
          style: { fontFamily: "system-ui", fontSize: 12, fill },
        });
        t.x = cx - tableW / 2 + 12 + colX[ci];
        t.y = y;
        this.addChild(t);
      });
    });

    // Buttons at bottom
    const btnY = h - 60;

    if (isHost) {
      const restartBtn = new Button({
        label: "重新开局",
        width: 120,
        fontSize: 14,
        onClick: () => onRestart(),
      });
      restartBtn.x = cx - 70;
      restartBtn.y = btnY;
      this.addChild(restartBtn);
    }

    const exitBtn = new Button({
      label: "退出房间",
      width: 120,
      fontSize: 14,
      onClick: () => onExit(),
    });
    exitBtn.x = isHost ? cx + 70 : cx;
    exitBtn.y = btnY;
    this.addChild(exitBtn);
  }
}
