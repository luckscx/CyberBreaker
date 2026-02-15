import { Application, Container, Graphics, Text } from "pixi.js";
import { Background } from "../components/Background";
import { MusicToggle } from "../components/MusicToggle";
import { BackButton } from "../components/BackButton";
import { LEVELS, isLevelUnlocked } from "../data/levels";
import { ProgressManager } from "../services/progressManager";
import { LevelConfig, LevelDifficulty, PlayerProgress } from "../types/level";

const LEVEL_BUTTON_SIZE = 70;
const LEVEL_BUTTON_GAP = 12;
const COLUMNS = 3;

export class LevelSelectScene extends Container {
  private progress: PlayerProgress;
  private bg: Background;

  constructor(
    private app: Application,
    private opts: {
      onBack: () => void;
      onLevelSelect: (levelId: number) => void;
    }
  ) {
    super();

    this.progress = ProgressManager.load();
    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
    });
    this.addChild(this.bg);

    this._buildUI();
  }

  private _buildUI(): void {
    const { width, height } = this.app.screen;

    // 返回按钮（左上角）
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

    // 标题
    const title = new Text({
      text: "关卡选择",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 28,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5);
    title.position.set(width / 2, 60);
    this.addChild(title);

    // 星星统计
    const starsText = new Text({
      text: `⭐ ${this.progress.totalStars}  🎯 ${this.progress.levelsCompleted}/${LEVELS.length}`,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        fill: 0xffdd00,
      },
    });
    starsText.anchor.set(0.5);
    starsText.position.set(width / 2, 100);
    this.addChild(starsText);

    // 关卡网格容器
    const gridContainer = new Container();
    const totalWidth =
      COLUMNS * LEVEL_BUTTON_SIZE + (COLUMNS - 1) * LEVEL_BUTTON_GAP;
    const startX = (width - totalWidth) / 2;
    const startY = 135;

    LEVELS.forEach((level, index) => {
      const row = Math.floor(index / COLUMNS);
      const col = index % COLUMNS;
      const x = startX + col * (LEVEL_BUTTON_SIZE + LEVEL_BUTTON_GAP);
      const y = startY + row * (LEVEL_BUTTON_SIZE + LEVEL_BUTTON_GAP + 35);

      const levelButton = this._createLevelButton(level);
      levelButton.position.set(x, y);
      gridContainer.addChild(levelButton);
    });

    this.addChild(gridContainer);
  }

  private _createLevelButton(level: LevelConfig): Container {
    const container = new Container();
    const isUnlocked = isLevelUnlocked(level.id, this.progress.levels);
    const levelProgress = this.progress.levels[level.id];

    // 按钮背景
    const bg = new Graphics();
    const color = this._getDifficultyColor(level.difficulty);

    if (!isUnlocked) {
      // 锁定状态 - 灰色
      bg.rect(0, 0, LEVEL_BUTTON_SIZE, LEVEL_BUTTON_SIZE);
      bg.fill({ color: 0x333333 });
    } else if (levelProgress?.completed) {
      // 已通关 - 发光边框
      bg.rect(0, 0, LEVEL_BUTTON_SIZE, LEVEL_BUTTON_SIZE);
      bg.fill({ color: color });
      bg.stroke({ color: 0x00ff88, width: 3 });
    } else {
      // 未通关 - 普通
      bg.rect(0, 0, LEVEL_BUTTON_SIZE, LEVEL_BUTTON_SIZE);
      bg.fill({ color: color });
    }

    bg.alpha = 0.8;
    container.addChild(bg);

    // 关卡编号
    const levelText = new Text({
      text: isUnlocked ? `${level.id}` : "🔒",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: level.isBoss ? 32 : 28,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    levelText.anchor.set(0.5);
    levelText.position.set(LEVEL_BUTTON_SIZE / 2, LEVEL_BUTTON_SIZE / 2 - 5);
    container.addChild(levelText);

    // Boss标记
    if (level.isBoss && isUnlocked) {
      const bossLabel = new Text({
        text: "BOSS",
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: 10,
          fill: 0xff0000,
          fontWeight: "bold",
        },
      });
      bossLabel.anchor.set(0.5);
      bossLabel.position.set(LEVEL_BUTTON_SIZE / 2, LEVEL_BUTTON_SIZE - 12);
      container.addChild(bossLabel);
    }

    // 星星显示
    if (levelProgress?.starsEarned) {
      const starsLabel = new Text({
        text: `⭐${levelProgress.starsEarned}`,
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: 12,
          fill: 0xffdd00,
        },
      });
      starsLabel.anchor.set(0.5);
      starsLabel.position.set(LEVEL_BUTTON_SIZE / 2, LEVEL_BUTTON_SIZE + 8);
      container.addChild(starsLabel);
    }

    // 完美通关标记
    if (levelProgress?.isPerfect) {
      const perfectLabel = new Text({
        text: "★",
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: 18,
          fill: 0xffd700,
        },
      });
      perfectLabel.anchor.set(0.5);
      perfectLabel.position.set(LEVEL_BUTTON_SIZE - 8, 8);
      container.addChild(perfectLabel);
    }

    // 关卡名称
    const nameText = new Text({
      text: level.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fill: 0xcccccc,
      },
    });
    nameText.anchor.set(0.5);
    nameText.position.set(
      LEVEL_BUTTON_SIZE / 2,
      LEVEL_BUTTON_SIZE + (levelProgress?.starsEarned ? 22 : 8)
    );
    container.addChild(nameText);

    // 交互
    if (isUnlocked) {
      container.interactive = true;
      container.cursor = "pointer";

      container.on("pointerdown", () => {
        this.opts.onLevelSelect(level.id);
      });

      // 悬停效果
      container.on("pointerover", () => {
        container.scale.set(1.1);
      });
      container.on("pointerout", () => {
        container.scale.set(1);
      });
    }

    return container;
  }

  private _getDifficultyColor(difficulty: LevelDifficulty): number {
    switch (difficulty) {
      case LevelDifficulty.EASY:
        return 0x4caf50; // 绿色
      case LevelDifficulty.NORMAL:
        return 0x2196f3; // 蓝色
      case LevelDifficulty.HARD:
        return 0xff9800; // 橙色
      case LevelDifficulty.BOSS:
        return 0xf44336; // 红色
      default:
        return 0x666666;
    }
  }

  animate(): void {
    this.bg.animate();
  }
}
