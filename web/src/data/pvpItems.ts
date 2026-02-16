/**
 * PVP Room Item Definitions
 * Maps server-side PowerUpType to client-side display data
 */

export enum PowerUpType {
  REVEAL_ONE = 'reveal_one',
  ELIMINATE_TWO = 'eliminate_two',
  HINT = 'hint',
  EXTRA_TIME = 'extra_time',
  REDUCE_OPPONENT_TIME = 'reduce_opponent_time',
  LIMIT_OPPONENT_GUESSES = 'limit_opponent_guesses',
}

export interface PvpItemConfig {
  id: PowerUpType;
  name: string;
  description: string;
  icon: string;
  category: 'buff' | 'debuff';
}

export const PVP_ITEMS: Record<PowerUpType, PvpItemConfig> = {
  [PowerUpType.REVEAL_ONE]: {
    id: PowerUpType.REVEAL_ONE,
    name: '揭示',
    description: '揭示一个数字的位置',
    icon: '🔍',
    category: 'buff',
  },
  [PowerUpType.ELIMINATE_TWO]: {
    id: PowerUpType.ELIMINATE_TWO,
    name: '排除',
    description: '排除两个不在答案中的数字',
    icon: '❌',
    category: 'buff',
  },
  [PowerUpType.HINT]: {
    id: PowerUpType.HINT,
    name: '提示',
    description: '显示答案中包含的数字（不含位置）',
    icon: '💡',
    category: 'buff',
  },
  [PowerUpType.EXTRA_TIME]: {
    id: PowerUpType.EXTRA_TIME,
    name: '加时',
    description: '为自己的回合增加30秒',
    icon: '⏰',
    category: 'buff',
  },
  [PowerUpType.REDUCE_OPPONENT_TIME]: {
    id: PowerUpType.REDUCE_OPPONENT_TIME,
    name: '减时',
    description: '减少对手下回合10秒时间',
    icon: '⏳',
    category: 'debuff',
  },
  [PowerUpType.LIMIT_OPPONENT_GUESSES]: {
    id: PowerUpType.LIMIT_OPPONENT_GUESSES,
    name: '限制',
    description: '限制对手下回合只能猜测1次',
    icon: '🚫',
    category: 'debuff',
  },
};

/**
 * Get item configuration by ID
 */
export function getPvpItem(id: string): PvpItemConfig | undefined {
  return PVP_ITEMS[id as PowerUpType];
}

/**
 * Convert inventory object to item data array for display
 */
export function inventoryToItemData(inventory: { [itemId: string]: number }): Array<{
  id: string;
  icon: string;
  name: string;
  description: string;
  count: number;
}> {
  return Object.entries(inventory)
    .filter(([_, count]) => count > 0)
    .map(([id, count]) => {
      const item = getPvpItem(id);
      return {
        id,
        icon: item?.icon ?? '❓',
        name: item?.name ?? '未知道具',
        description: item?.description ?? '',
        count,
      };
    });
}
