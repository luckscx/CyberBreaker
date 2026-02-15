import { PlayerProgress, LevelProgress } from "../types/level";

const STORAGE_KEY = "cyberbreaker_player_progress";

/**
 * 本地存储管理器
 * 使用 localStorage 持久化玩家进度
 */
export class ProgressManager {
  /**
   * 加载玩家进度
   */
  static load(): PlayerProgress {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as PlayerProgress;
      }
    } catch (err) {
      console.error("Failed to load progress:", err);
    }

    // 返回初始进度
    return {
      totalStars: 0,
      levelsCompleted: 0,
      levels: {},
      powerUpInventory: {},
    };
  }

  /**
   * 保存玩家进度
   */
  static save(progress: PlayerProgress): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  }

  /**
   * 更新关卡进度
   */
  static updateLevelProgress(
    progress: PlayerProgress,
    levelId: number,
    levelProgress: LevelProgress
  ): PlayerProgress {
    const newProgress = { ...progress };
    const oldLevelProgress = newProgress.levels[levelId];

    // 更新关卡记录
    newProgress.levels[levelId] = levelProgress;

    // 如果是首次通关
    if (!oldLevelProgress?.completed && levelProgress.completed) {
      newProgress.levelsCompleted++;
    }

    // 更新总星星数（增量）
    if (oldLevelProgress) {
      const starsDiff = levelProgress.starsEarned - oldLevelProgress.starsEarned;
      newProgress.totalStars += starsDiff;
    } else {
      newProgress.totalStars += levelProgress.starsEarned;
    }

    return newProgress;
  }

  /**
   * 使用道具（扣除库存）
   */
  static usePowerUp(
    progress: PlayerProgress,
    powerUpType: string
  ): PlayerProgress {
    const newProgress = { ...progress };
    const inventory = { ...newProgress.powerUpInventory };
    const current = (inventory as Record<string, number>)[powerUpType] || 0;

    if (current > 0) {
      (inventory as Record<string, number>)[powerUpType] = current - 1;
      newProgress.powerUpInventory = inventory;
    }

    return newProgress;
  }

  /**
   * 添加道具到库存
   */
  static addPowerUp(
    progress: PlayerProgress,
    powerUpType: string,
    count: number
  ): PlayerProgress {
    const newProgress = { ...progress };
    const inventory = { ...newProgress.powerUpInventory };
    const current = (inventory as Record<string, number>)[powerUpType] || 0;
    (inventory as Record<string, number>)[powerUpType] = current + count;
    newProgress.powerUpInventory = inventory;
    return newProgress;
  }

  /**
   * 消费星星（购买道具等）
   */
  static spendStars(progress: PlayerProgress, amount: number): PlayerProgress {
    const newProgress = { ...progress };
    newProgress.totalStars = Math.max(0, newProgress.totalStars - amount);
    return newProgress;
  }

  /**
   * 重置所有进度（调试用）
   */
  static reset(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * 获取关卡进度
   */
  static getLevelProgress(
    progress: PlayerProgress,
    levelId: number
  ): LevelProgress | null {
    return progress.levels[levelId] || null;
  }

  /**
   * 检查是否有足够的星星
   */
  static hasEnoughStars(progress: PlayerProgress, amount: number): boolean {
    return progress.totalStars >= amount;
  }
}
