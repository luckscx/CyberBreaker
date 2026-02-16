/**
 * Free Mode Item Definitions (Client)
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
 * Get item configuration by ID
 */
export function getFreeItem(id: string): FreeItemConfig | undefined {
  return FREE_ITEMS[id as FreeItemType];
}

/**
 * Convert inventory object to item data array for display
 */
export function freeInventoryToItemData(inventory: { [itemId: string]: number }): Array<{
  id: string;
  icon: string;
  name: string;
  description: string;
  count: number;
}> {
  return Object.entries(inventory)
    .filter(([_, count]) => count > 0)
    .map(([id, count]) => {
      const item = getFreeItem(id);
      return {
        id,
        icon: item?.icon ?? '❓',
        name: item?.name ?? '未知道具',
        description: item?.description ?? '',
        count,
      };
    });
}
