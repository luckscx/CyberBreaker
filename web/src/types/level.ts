/**
 * 关卡系统类型定义
 */

/** 道具类型 */
export enum PowerUpType {
  /** 排除2个不在答案中的数字 */
  ELIMINATE_TWO = "eliminate_two",
  /** 显示一个正确位置的数字 */
  REVEAL_ONE = "reveal_one",
  /** 显示答案中包含哪些数字（不含位置） */
  SHOW_DIGITS = "show_digits",
  /** 额外增加3次猜测机会 */
  EXTRA_GUESSES = "extra_guesses",
  /** 额外增加30秒时间 */
  EXTRA_TIME = "extra_time",
}

/** 道具配置 */
export interface PowerUp {
  type: PowerUpType;
  name: string;
  description: string;
  icon: string; // emoji
  cost: number; // 使用消耗的星星数
}

/** 关卡难度 */
export enum LevelDifficulty {
  EASY = "easy",
  NORMAL = "normal",
  HARD = "hard",
  BOSS = "boss",
}

/** 关卡配置 */
export interface LevelConfig {
  id: number;
  name: string;
  difficulty: LevelDifficulty;
  /** 固定的目标密码（4位不重复数字），null表示随机生成 */
  fixedSecret: string | null;
  /** 最大猜测次数，null表示无限制 */
  maxGuesses: number | null;
  /** 时间限制（秒），null表示无限制 */
  timeLimit: number | null;
  /** 可用的道具类型列表 */
  availablePowerUps: PowerUpType[];
  /** 初始道具（关卡开始时自动获得） */
  startingPowerUps?: Partial<Record<PowerUpType, number>>;
  /** 通关奖励星星数（基础） */
  rewardStars: number;
  /** 完美通关条件（少于X次猜测） */
  perfectGuesses?: number;
  /** 完美通关额外奖励星星 */
  perfectBonus?: number;
  /** 关卡描述/提示 */
  description?: string;
  /** 是否为Boss关卡 */
  isBoss?: boolean;
}

/** 关卡通关记录 */
export interface LevelProgress {
  levelId: number;
  /** 是否已通关 */
  completed: boolean;
  /** 最佳猜测次数 */
  bestGuesses: number | null;
  /** 最快通关时间（毫秒） */
  bestTime: number | null;
  /** 获得的星星总数 */
  starsEarned: number;
  /** 是否获得完美通关 */
  isPerfect: boolean;
}

/** 玩家进度数据 */
export interface PlayerProgress {
  /** 当前可用的星星数 */
  totalStars: number;
  /** 已通关的关卡数 */
  levelsCompleted: number;
  /** 各关卡详细进度 */
  levels: Record<number, LevelProgress>;
  /** 拥有的道具库存 */
  powerUpInventory: Partial<Record<PowerUpType, number>>;
}

/** 关卡游戏状态 */
export interface LevelGameState {
  levelConfig: LevelConfig;
  secret: string;
  currentGuess: string;
  history: Array<{ guess: string; a: number; b: number }>;
  remainingGuesses: number | null;
  remainingSec: number | null;
  usedPowerUps: PowerUpType[];
  gameEnded: boolean;
  victory: boolean;
  /** 当前可用的道具（来自库存+关卡初始） */
  availablePowerUps: Partial<Record<PowerUpType, number>>;
  /** 道具效果状态 */
  powerUpEffects: {
    eliminatedDigits?: string[]; // 被排除的数字
    revealedPositions?: Array<{ pos: number; digit: string }>; // 已揭示的位置
    knownDigits?: string[]; // 已知包含的数字（不含位置）
  };
}
