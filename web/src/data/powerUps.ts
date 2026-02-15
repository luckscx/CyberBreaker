import { PowerUp, PowerUpType } from "../types/level";

/**
 * 道具配置数据
 */
export const POWER_UPS: Record<PowerUpType, PowerUp> = {
  [PowerUpType.ELIMINATE_TWO]: {
    type: PowerUpType.ELIMINATE_TWO,
    name: "数字排除",
    description: "排除2个不在答案中的数字",
    icon: "🚫",
    cost: 2,
  },
  [PowerUpType.REVEAL_ONE]: {
    type: PowerUpType.REVEAL_ONE,
    name: "位置揭示",
    description: "揭示答案中一个正确位置的数字",
    icon: "💡",
    cost: 3,
  },
  [PowerUpType.SHOW_DIGITS]: {
    type: PowerUpType.SHOW_DIGITS,
    name: "数字透视",
    description: "显示答案包含哪4个数字（不含位置）",
    icon: "🔍",
    cost: 4,
  },
  [PowerUpType.EXTRA_GUESSES]: {
    type: PowerUpType.EXTRA_GUESSES,
    name: "追加机会",
    description: "额外增加3次猜测机会",
    icon: "➕",
    cost: 2,
  },
  [PowerUpType.EXTRA_TIME]: {
    type: PowerUpType.EXTRA_TIME,
    name: "时间延长",
    description: "额外增加30秒时间",
    icon: "⏱️",
    cost: 2,
  },
};

/**
 * 获取道具配置
 */
export function getPowerUp(type: PowerUpType): PowerUp {
  return POWER_UPS[type];
}

/**
 * 获取所有道具列表
 */
export function getAllPowerUps(): PowerUp[] {
  return Object.values(POWER_UPS);
}
