import { LevelConfig, LevelDifficulty, PowerUpType } from "../types/level";

/**
 * 关卡配置数据
 * 总共15个关卡 + 1个Boss战
 */
export const LEVELS: LevelConfig[] = [
  // ===== 第一章：新手村 (1-3关) =====
  {
    id: 1,
    name: "初次尝试",
    difficulty: LevelDifficulty.EASY,
    fixedSecret: "1234",
    maxGuesses: null, // 无限制
    timeLimit: null, // 无限制
    availablePowerUps: [PowerUpType.REVEAL_ONE],
    startingPowerUps: { [PowerUpType.REVEAL_ONE]: 1 }, // 送一个提示道具
    rewardStars: 1,
    description: "欢迎来到潜行解码！这是一个简单的入门关卡。",
  },
  {
    id: 2,
    name: "时间压力",
    difficulty: LevelDifficulty.EASY,
    fixedSecret: "5678",
    maxGuesses: null,
    timeLimit: 120, // 2分钟
    availablePowerUps: [PowerUpType.EXTRA_TIME],
    startingPowerUps: { [PowerUpType.EXTRA_TIME]: 2 },
    rewardStars: 1,
    perfectGuesses: 6,
    perfectBonus: 1,
    description: "在时间限制内完成挑战！",
  },
  {
    id: 3,
    name: "次数限制",
    difficulty: LevelDifficulty.EASY,
    fixedSecret: "2048",
    maxGuesses: 10,
    timeLimit: null,
    availablePowerUps: [PowerUpType.EXTRA_GUESSES, PowerUpType.ELIMINATE_TWO],
    startingPowerUps: {
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.ELIMINATE_TWO]: 2,
    },
    rewardStars: 2,
    perfectGuesses: 5,
    perfectBonus: 1,
    description: "只有10次机会，谨慎思考每一步！",
  },

  // ===== 第二章：逻辑训练 (4-6关) =====
  {
    id: 4,
    name: "双重考验",
    difficulty: LevelDifficulty.NORMAL,
    fixedSecret: null, // 随机生成
    maxGuesses: 8,
    timeLimit: 90,
    availablePowerUps: [
      PowerUpType.EXTRA_GUESSES,
      PowerUpType.EXTRA_TIME,
      PowerUpType.ELIMINATE_TWO,
    ],
    startingPowerUps: {
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 1,
      [PowerUpType.ELIMINATE_TWO]: 2,
    },
    rewardStars: 2,
    perfectGuesses: 5,
    perfectBonus: 1,
    description: "时间和次数双重限制，开始变难了！",
  },
  {
    id: 5,
    name: "迷雾重重",
    difficulty: LevelDifficulty.NORMAL,
    fixedSecret: null,
    maxGuesses: 7,
    timeLimit: 75,
    availablePowerUps: [PowerUpType.SHOW_DIGITS, PowerUpType.REVEAL_ONE],
    startingPowerUps: {
      [PowerUpType.SHOW_DIGITS]: 1,
      [PowerUpType.REVEAL_ONE]: 2,
    },
    rewardStars: 2,
    perfectGuesses: 4,
    perfectBonus: 2,
    description: "答案藏在迷雾中，用智慧拨开云雾！",
  },
  {
    id: 6,
    name: "精确打击",
    difficulty: LevelDifficulty.NORMAL,
    fixedSecret: "9537",
    maxGuesses: 6,
    timeLimit: 60,
    availablePowerUps: [
      PowerUpType.ELIMINATE_TWO,
      PowerUpType.REVEAL_ONE,
      PowerUpType.EXTRA_GUESSES,
    ],
    startingPowerUps: {
      [PowerUpType.ELIMINATE_TWO]: 1,
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.EXTRA_GUESSES]: 1,
    },
    rewardStars: 3,
    perfectGuesses: 4,
    perfectBonus: 2,
    description: "需要更精确的推理，每一步都要深思熟虑！",
  },

  // ===== 第三章：高手之路 (7-9关) =====
  {
    id: 7,
    name: "极限速度",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: null,
    maxGuesses: 6,
    timeLimit: 45,
    availablePowerUps: [
      PowerUpType.EXTRA_TIME,
      PowerUpType.SHOW_DIGITS,
      PowerUpType.REVEAL_ONE,
    ],
    startingPowerUps: {
      [PowerUpType.EXTRA_TIME]: 2,
      [PowerUpType.REVEAL_ONE]: 1,
    },
    rewardStars: 3,
    perfectGuesses: 4,
    perfectBonus: 2,
    description: "45秒，6次机会，你能做到吗？",
  },
  {
    id: 8,
    name: "零容错",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: null,
    maxGuesses: 5,
    timeLimit: 60,
    availablePowerUps: [
      PowerUpType.ELIMINATE_TWO,
      PowerUpType.SHOW_DIGITS,
      PowerUpType.REVEAL_ONE,
    ],
    startingPowerUps: {
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.REVEAL_ONE]: 1,
    },
    rewardStars: 3,
    perfectGuesses: 3,
    perfectBonus: 3,
    description: "只有5次机会，不允许任何失误！",
  },
  {
    id: 9,
    name: "死亡倒计时",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: "8024",
    maxGuesses: 5,
    timeLimit: 30,
    availablePowerUps: Object.values(PowerUpType), // 全部道具可用
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 1,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 4,
    perfectGuesses: 3,
    perfectBonus: 3,
    description: "30秒！这是对反应和逻辑的极限考验！",
  },

  // ===== 第四章：大师试炼 (10-12关) =====
  {
    id: 10,
    name: "黑客入侵",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: null,
    maxGuesses: 5,
    timeLimit: 50,
    availablePowerUps: [
      PowerUpType.ELIMINATE_TWO,
      PowerUpType.SHOW_DIGITS,
      PowerUpType.EXTRA_TIME,
    ],
    startingPowerUps: {
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.SHOW_DIGITS]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 4,
    perfectGuesses: 3,
    perfectBonus: 3,
    description: "模拟黑客破解过程，时间紧迫！",
  },
  {
    id: 11,
    name: "密码堡垒",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: "6391",
    maxGuesses: 4,
    timeLimit: 45,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 1,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 1,
    },
    rewardStars: 4,
    perfectGuesses: 3,
    perfectBonus: 4,
    description: "只有4次机会破解坚固的密码堡垒！",
  },
  {
    id: 12,
    name: "时空裂缝",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: null,
    maxGuesses: 4,
    timeLimit: 35,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 5,
    perfectGuesses: 3,
    perfectBonus: 5,
    description: "在时空裂缝中寻找答案，每一秒都很珍贵！",
  },

  // ===== 第五章：传奇之巅 (13-15关) =====
  {
    id: 13,
    name: "终极挑战·壹",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: "7140",
    maxGuesses: 4,
    timeLimit: 40,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 1,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 5,
    perfectGuesses: 3,
    perfectBonus: 5,
    description: "传奇之路的第一道考验！",
  },
  {
    id: 14,
    name: "终极挑战·贰",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: null,
    maxGuesses: 4,
    timeLimit: 35,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 5,
    perfectGuesses: 3,
    perfectBonus: 5,
    description: "只有真正的大师才能通过！",
  },
  {
    id: 15,
    name: "终极挑战·叁",
    difficulty: LevelDifficulty.HARD,
    fixedSecret: "5826",
    maxGuesses: 3,
    timeLimit: 30,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      [PowerUpType.REVEAL_ONE]: 2,
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.EXTRA_GUESSES]: 2,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 6,
    perfectGuesses: 3,
    perfectBonus: 6,
    description: "登顶之前的最后考验，准备好了吗？",
  },

  // ===== Boss战 =====
  {
    id: 16,
    name: "【BOSS】终极密码",
    difficulty: LevelDifficulty.BOSS,
    fixedSecret: "4096", // 特殊的Boss密码
    maxGuesses: 5,
    timeLimit: 60,
    availablePowerUps: Object.values(PowerUpType),
    startingPowerUps: {
      // Boss战开始时给予一些道具
      [PowerUpType.REVEAL_ONE]: 1,
      [PowerUpType.ELIMINATE_TWO]: 2,
      [PowerUpType.EXTRA_GUESSES]: 1,
      [PowerUpType.EXTRA_TIME]: 2,
    },
    rewardStars: 10,
    perfectGuesses: 4,
    perfectBonus: 10,
    isBoss: true,
    description:
      "最终的Boss战！破解【4096】密码，证明你是真正的解码大师！\n\n这是整个游戏最困难的挑战，需要运用你学到的所有技巧。Boss密码有特殊的逻辑规律，仔细观察数字之间的关系...",
  },
];

/**
 * 根据关卡ID获取关卡配置
 */
export function getLevelById(id: number): LevelConfig | undefined {
  return LEVELS.find((level) => level.id === id);
}

/**
 * 获取下一个关卡
 */
export function getNextLevel(currentId: number): LevelConfig | undefined {
  return LEVELS.find((level) => level.id === currentId + 1);
}

/**
 * 检查关卡是否解锁（需要通关前一关）
 */
export function isLevelUnlocked(
  levelId: number,
  progress: Record<number, { completed: boolean }>
): boolean {
  if (levelId === 1) return true;
  const prevLevel = levelId - 1;
  return progress[prevLevel]?.completed === true;
}
