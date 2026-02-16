/**
 * Free Mode Item Definitions
 * Items for free guess mode (multi-player elimination)
 */

export enum FreeItemType {
  EXTRA_GUESS = 'extra_guess',
  REVEAL_ONE = 'reveal_one',
  ELIMINATE_TWO = 'eliminate_two',
  HINT = 'hint',
}

export interface FreeItemConfig {
  id: FreeItemType;
  name: string;
  description: string;
  icon: string;
  category: 'self' | 'global';
}

export const FREE_ITEMS: Record<FreeItemType, FreeItemConfig> = {
  [FreeItemType.EXTRA_GUESS]: {
    id: FreeItemType.EXTRA_GUESS,
    name: '追加',
    description: '额外增加2次猜测机会',
    icon: '➕',
    category: 'self',
  },
  [FreeItemType.REVEAL_ONE]: {
    id: FreeItemType.REVEAL_ONE,
    name: '揭示',
    description: '揭示答案中的一位数字',
    icon: '🔍',
    category: 'self',
  },
  [FreeItemType.ELIMINATE_TWO]: {
    id: FreeItemType.ELIMINATE_TWO,
    name: '排除',
    description: '排除两个不在答案中的数字',
    icon: '❌',
    category: 'self',
  },
  [FreeItemType.HINT]: {
    id: FreeItemType.HINT,
    name: '提示',
    description: '显示答案包含的所有数字',
    icon: '💡',
    category: 'self',
  },
};

/**
 * Default inventory for free mode players
 */
export const FREE_MODE_DEFAULT_INVENTORY: { [key in FreeItemType]: number } = {
  [FreeItemType.EXTRA_GUESS]: 2,
  [FreeItemType.REVEAL_ONE]: 1,
  [FreeItemType.ELIMINATE_TWO]: 0,
  [FreeItemType.HINT]: 0,
};

/**
 * Get item configuration by ID
 */
export function getFreeItem(id: string): FreeItemConfig | undefined {
  return FREE_ITEMS[id as FreeItemType];
}

/**
 * Validate if an item ID is valid
 */
export function isValidFreeItemId(itemId: string): itemId is FreeItemType {
  return Object.values(FreeItemType).includes(itemId as FreeItemType);
}
