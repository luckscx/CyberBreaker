/**
 * Item Configuration System
 * Centralized item definitions and mode-specific distributions
 */

export enum PowerUpType {
  REVEAL_ONE = 'reveal_one',
  ELIMINATE_TWO = 'eliminate_two',
  HINT = 'hint',
  EXTRA_TIME = 'extra_time',
  REDUCE_OPPONENT_TIME = 'reduce_opponent_time',
  LIMIT_OPPONENT_GUESSES = 'limit_opponent_guesses',
}

export interface ItemConfig {
  id: PowerUpType;
  name: string;
  description: string;
  icon: string;
  category: 'buff' | 'debuff';
  effect: string;
}

export const ITEM_CONFIGS: Record<PowerUpType, ItemConfig> = {
  [PowerUpType.REVEAL_ONE]: {
    id: PowerUpType.REVEAL_ONE,
    name: '揭示',
    description: '揭示一个数字的位置',
    icon: '🔍',
    category: 'buff',
    effect: 'reveal_one_digit',
  },
  [PowerUpType.ELIMINATE_TWO]: {
    id: PowerUpType.ELIMINATE_TWO,
    name: '排除',
    description: '排除两个不在答案中的数字',
    icon: '❌',
    category: 'buff',
    effect: 'eliminate_two_digits',
  },
  [PowerUpType.HINT]: {
    id: PowerUpType.HINT,
    name: '提示',
    description: '显示答案中包含的数字（不含位置）',
    icon: '💡',
    category: 'buff',
    effect: 'show_digits_in_secret',
  },
  [PowerUpType.EXTRA_TIME]: {
    id: PowerUpType.EXTRA_TIME,
    name: '加时',
    description: '为自己的回合增加30秒',
    icon: '⏰',
    category: 'buff',
    effect: 'add_time_30s',
  },
  [PowerUpType.REDUCE_OPPONENT_TIME]: {
    id: PowerUpType.REDUCE_OPPONENT_TIME,
    name: '减时',
    description: '减少对手下回合10秒时间',
    icon: '⏳',
    category: 'debuff',
    effect: 'reduce_opponent_time_10s',
  },
  [PowerUpType.LIMIT_OPPONENT_GUESSES]: {
    id: PowerUpType.LIMIT_OPPONENT_GUESSES,
    name: '限制',
    description: '限制对手下回合只能猜测1次',
    icon: '🚫',
    category: 'debuff',
    effect: 'limit_opponent_guesses',
  },
};

export interface ModeItemDistribution {
  [rule: string]: {
    items: Array<{ id: PowerUpType; quantity: number }>;
  };
}

export const MODE_ITEM_DISTRIBUTIONS: ModeItemDistribution = {
  standard: {
    items: [
      { id: PowerUpType.REVEAL_ONE, quantity: 2 },
      { id: PowerUpType.ELIMINATE_TWO, quantity: 2 },
      { id: PowerUpType.HINT, quantity: 1 },
      { id: PowerUpType.REDUCE_OPPONENT_TIME, quantity: 2 },
    ],
  },
  position_only: {
    items: [
      { id: PowerUpType.REVEAL_ONE, quantity: 3 },
      { id: PowerUpType.EXTRA_TIME, quantity: 2 },
      { id: PowerUpType.REDUCE_OPPONENT_TIME, quantity: 2 },
      { id: PowerUpType.LIMIT_OPPONENT_GUESSES, quantity: 1 },
    ],
  },
  guess_person: {
    items: [
      { id: PowerUpType.ELIMINATE_TWO, quantity: 3 },
      { id: PowerUpType.HINT, quantity: 2 },
      { id: PowerUpType.EXTRA_TIME, quantity: 1 },
      { id: PowerUpType.LIMIT_OPPONENT_GUESSES, quantity: 2 },
    ],
  },
};

/**
 * Get initial inventory for a given room rule
 */
export function getInitialInventory(rule: string): { [itemId: string]: number } {
  const distribution = MODE_ITEM_DISTRIBUTIONS[rule];
  if (!distribution) {
    // Default to standard mode if rule not found
    return getInitialInventory('standard');
  }

  const inventory: { [itemId: string]: number } = {};
  for (const item of distribution.items) {
    inventory[item.id] = item.quantity;
  }
  return inventory;
}

/**
 * Validate if an item ID is valid
 */
export function isValidItemId(itemId: string): itemId is PowerUpType {
  return Object.values(PowerUpType).includes(itemId as PowerUpType);
}
