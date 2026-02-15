import { Application, Container, Graphics, Text } from "pixi.js";
import { Button } from "../components/Button";
import { Background } from "../components/Background";
import { MusicToggle } from "../components/MusicToggle";
import { BackButton } from "../components/BackButton";
import { getCampaignLeaderboard, LeaderboardEntry } from "../api/leaderboard";
import { getLevelById } from "../data/levels";

export interface LeaderboardSceneOptions {
  onBack: () => void;
}

export class LeaderboardScene extends Container {
  private bg!: Background;
  private currentLevelId: number = 1;
  private currentPage: number = 1;
  private leaderboardData: LeaderboardEntry[] = [];
  private totalPages: number = 1;
  private contentContainer!: Container;

  constructor(
    private app: Application,
    private opts: LeaderboardSceneOptions
  ) {
    super();

    this._buildUI();
    this._loadLeaderboard();
  }

  private _buildUI(): void {
    const { width, height } = this.app.screen;

    // 背景
    this.bg = new Background({ width, height });
    this.addChild(this.bg);

    // 标题
    const title = new Text({
      text: "🏆 排行榜",
      style: {
        fontFamily: "Arial",
        fontSize: 24,
        fill: 0x00ff88,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, 60);
    this.addChild(title);

    // 返回按钮
    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => {
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

    // 关卡选择器
    this._buildLevelSelector();

    // 内容容器
    this.contentContainer = new Container();
    this.contentContainer.position.set(0, 140);
    this.addChild(this.contentContainer);
  }

  private _buildLevelSelector(): void {
    const { width } = this.app.screen;
    const y = 100;

    // 上一关按钮
    const prevBtn = new Button({
      label: "◀",
      width: 45,
      fontSize: 16,
      onClick: () => {
        if (this.currentLevelId > 1) {
          this.currentLevelId--;
          this.currentPage = 1;
          this._loadLeaderboard();
        }
      },
    });
    prevBtn.position.set(width / 2 - 120, y);
    this.addChild(prevBtn);

    // 关卡显示（将在 _updateLevelDisplay 中更新）
    const levelText = new Text({
      text: `关卡 ${this.currentLevelId}`,
      style: {
        fontFamily: "Arial",
        fontSize: 18,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    levelText.anchor.set(0.5, 0);
    levelText.position.set(width / 2, y + 8);
    this.addChild(levelText);
    (this as any)._levelText = levelText; // 存储引用

    // 下一关按钮
    const nextBtn = new Button({
      label: "▶",
      width: 45,
      fontSize: 16,
      onClick: () => {
        this.currentLevelId++;
        this.currentPage = 1;
        this._loadLeaderboard();
      },
    });
    nextBtn.position.set(width / 2 + 75, y);
    this.addChild(nextBtn);
  }

  private _updateLevelDisplay(): void {
    const levelText = (this as any)._levelText as Text;
    if (levelText) {
      const level = getLevelById(this.currentLevelId);
      const levelName = level ? level.name : `关卡 ${this.currentLevelId}`;
      levelText.text = levelName;
    }
  }

  private async _loadLeaderboard(): Promise<void> {
    this._updateLevelDisplay();
    this._showLoading();

    try {
      const result = await getCampaignLeaderboard(
        this.currentLevelId,
        this.currentPage,
        20
      );
      this.leaderboardData = result.list;
      this.totalPages = Math.ceil(result.total / result.limit);
      this._renderLeaderboard();
    } catch (error) {
      console.error("加载排行榜失败:", error);
      this._showError("加载失败，请稍后重试");
    }
  }

  private _showLoading(): void {
    this.contentContainer.removeChildren();

    const { width } = this.app.screen;
    const loadingText = new Text({
      text: "加载中...",
      style: {
        fontFamily: "Arial",
        fontSize: 20,
        fill: 0xffaa00,
      },
    });
    loadingText.anchor.set(0.5, 0);
    loadingText.position.set(width / 2, 100);
    this.contentContainer.addChild(loadingText);
  }

  private _showError(message: string): void {
    this.contentContainer.removeChildren();

    const { width } = this.app.screen;
    const errorText = new Text({
      text: message,
      style: {
        fontFamily: "Arial",
        fontSize: 20,
        fill: 0xff4444,
      },
    });
    errorText.anchor.set(0.5, 0);
    errorText.position.set(width / 2, 100);
    this.contentContainer.addChild(errorText);
  }

  private _renderLeaderboard(): void {
    this.contentContainer.removeChildren();

    const { width } = this.app.screen;

    if (this.leaderboardData.length === 0) {
      const emptyText = new Text({
        text: "暂无排行榜数据",
        style: {
          fontFamily: "Arial",
          fontSize: 20,
          fill: 0x888888,
        },
      });
      emptyText.anchor.set(0.5, 0);
      emptyText.position.set(width / 2, 100);
      this.contentContainer.addChild(emptyText);
      return;
    }

    // 表头
    this._renderTableHeader();

    // 表格行
    this.leaderboardData.forEach((entry, index) => {
      this._renderTableRow(entry, index);
    });

    // 分页控制
    if (this.totalPages > 1) {
      this._renderPagination();
    }
  }

  private _renderTableHeader(): void {
    const { width } = this.app.screen;
    const y = 20;

    const headerBg = new Graphics();
    headerBg.roundRect(0, 0, width - 40, 35, 4);
    headerBg.fill({ color: 0x2a3a4a, alpha: 0.8 });
    headerBg.position.set(20, y);
    this.contentContainer.addChild(headerBg);

    const columns = [
      { text: "排名", x: 40, width: 0.15 },
      { text: "昵称", x: 0, width: 0.35 },
      { text: "次数", x: 0, width: 0.25 },
      { text: "时间", x: 0, width: 0.25 },
    ];

    let currentX = 40;
    columns.forEach((col, idx) => {
      if (idx > 0) {
        currentX += (width - 80) * columns[idx - 1].width;
      }

      const text = new Text({
        text: col.text,
        style: {
          fontFamily: "Arial",
          fontSize: 14,
          fill: 0x00aaff,
          fontWeight: "bold",
        },
      });
      text.anchor.set(0, 0.5);
      text.position.set(currentX, y + 17);
      this.contentContainer.addChild(text);
    });
  }

  private _renderTableRow(entry: LeaderboardEntry, index: number): void {
    const { width } = this.app.screen;
    const y = 60 + index * 32;

    // 交替背景色
    if (index % 2 === 0) {
      const rowBg = new Graphics();
      rowBg.roundRect(0, 0, width - 40, 32, 4);
      rowBg.fill({ color: 0x1a2a3a, alpha: 0.3 });
      rowBg.position.set(20, y);
      this.contentContainer.addChild(rowBg);
    }

    let currentX = 40;
    const colWidths = [0.15, 0.35, 0.25, 0.25];

    // 排名（前三名特殊显示）
    const rankText = new Text({
      text: entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `${entry.rank}`,
      style: {
        fontFamily: "Arial",
        fontSize: entry.rank <= 3 ? 20 : 14,
        fill: 0xffffff,
      },
    });
    rankText.anchor.set(0, 0.5);
    rankText.position.set(currentX, y + 16);
    this.contentContainer.addChild(rankText);

    // 昵称
    currentX += (width - 80) * colWidths[0];
    const nameText = new Text({
      text: entry.playerName.length > 10 ? entry.playerName.substring(0, 10) + '...' : entry.playerName,
      style: {
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      },
    });
    nameText.anchor.set(0, 0.5);
    nameText.position.set(currentX, y + 16);
    this.contentContainer.addChild(nameText);

    // 猜测次数
    currentX += (width - 80) * colWidths[1];
    const guessText = new Text({
      text: `${entry.guessCount}`,
      style: {
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0x00ff88,
      },
    });
    guessText.anchor.set(0, 0.5);
    guessText.position.set(currentX, y + 16);
    this.contentContainer.addChild(guessText);

    // 用时
    currentX += (width - 80) * colWidths[2];
    const timeText = new Text({
      text: `${(entry.timeMs / 1000).toFixed(1)}s`,
      style: {
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffaa00,
      },
    });
    timeText.anchor.set(0, 0.5);
    timeText.position.set(currentX, y + 16);
    this.contentContainer.addChild(timeText);
  }

  private _renderPagination(): void {
    const { width } = this.app.screen;
    const y = 75 + this.leaderboardData.length * 32;

    // 上一页按钮
    if (this.currentPage > 1) {
      const prevBtn = new Button({
        label: "上一页",
        width: 90,
        fontSize: 14,
        onClick: () => {
          this.currentPage--;
          this._loadLeaderboard();
        },
      });
      prevBtn.position.set(width / 2 - 100, y);
      this.contentContainer.addChild(prevBtn);
    }

    // 页码显示
    const pageText = new Text({
      text: `${this.currentPage} / ${this.totalPages}`,
      style: {
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      },
    });
    pageText.anchor.set(0.5, 0);
    pageText.position.set(width / 2, y + 10);
    this.contentContainer.addChild(pageText);

    // 下一页按钮
    if (this.currentPage < this.totalPages) {
      const nextBtn = new Button({
        label: "下一页",
        width: 90,
        fontSize: 14,
        onClick: () => {
          this.currentPage++;
          this._loadLeaderboard();
        },
      });
      nextBtn.position.set(width / 2 + 10, y);
      this.contentContainer.addChild(nextBtn);
    }
  }

  animate(): void {
    this.bg.animate();
  }
}
