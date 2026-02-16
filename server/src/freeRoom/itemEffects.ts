/**
 * Free Mode Item Effect Handlers
 */

import type { FreeRoom, FreePlayer } from './store.js';
import { FreeItemType } from './items.js';

export interface FreeItemEffect {
  apply: (room: FreeRoom, player: FreePlayer) => any;
}

/**
 * Extra Guess: Add 2 more guess attempts
 */
function extraGuess(room: FreeRoom, player: FreePlayer): any {
  // Increase guess limit by 2
  const extraAmount = 2;

  return {
    effect: 'extra_guess',
    amount: extraAmount,
    newLimit: room.guessLimit + extraAmount,
  };
}

/**
 * Reveal One: Show one digit position from the secret
 */
function revealOne(room: FreeRoom, player: FreePlayer): any {
  if (!room.secret || room.secret.length !== 4) {
    return { effect: 'reveal_one', revealed: null };
  }

  // Find a position not already revealed
  const revealed = player.itemEffects.revealedPositions || [];
  const revealedPositions = new Set(revealed.map(r => r.pos));
  const availablePositions = [0, 1, 2, 3].filter(p => !revealedPositions.has(p));

  if (availablePositions.length === 0) {
    return { effect: 'reveal_one', revealed: null, message: '已揭示所有位置' };
  }

  const position = availablePositions[Math.floor(Math.random() * availablePositions.length)];
  const digit = room.secret[position];

  // Update player's effects
  if (!player.itemEffects.revealedPositions) {
    player.itemEffects.revealedPositions = [];
  }
  player.itemEffects.revealedPositions.push({ pos: position, digit });

  return {
    effect: 'reveal_one',
    position,
    digit,
  };
}

/**
 * Eliminate Two: Show 2 digits NOT in the secret
 */
function eliminateTwo(room: FreeRoom, player: FreePlayer): any {
  if (!room.secret || room.secret.length !== 4) {
    return { effect: 'eliminate_two', eliminated: [] };
  }

  const secretDigits = new Set(room.secret.split(''));
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // Get already eliminated digits
  const alreadyEliminated = new Set(player.itemEffects.eliminatedDigits || []);

  // Find wrong digits not yet eliminated
  const wrongDigits = allDigits.filter(d => !secretDigits.has(d) && !alreadyEliminated.has(d));

  if (wrongDigits.length === 0) {
    return { effect: 'eliminate_two', eliminated: [], message: '没有更多数字可排除' };
  }

  // Pick up to 2 random wrong digits
  const shuffled = wrongDigits.sort(() => Math.random() - 0.5);
  const eliminated = shuffled.slice(0, Math.min(2, wrongDigits.length));

  // Update player's effects
  if (!player.itemEffects.eliminatedDigits) {
    player.itemEffects.eliminatedDigits = [];
  }
  player.itemEffects.eliminatedDigits.push(...eliminated);

  return {
    effect: 'eliminate_two',
    eliminated,
  };
}

/**
 * Hint: Show all digits in the secret (without positions)
 */
function showHint(room: FreeRoom, player: FreePlayer): any {
  if (!room.secret || room.secret.length !== 4) {
    return { effect: 'hint', digits: [] };
  }

  const digits = Array.from(new Set(room.secret.split(''))).sort();

  // Update player's effects
  player.itemEffects.knownDigits = digits;

  return {
    effect: 'hint',
    digits,
  };
}

/**
 * Map of item IDs to their effect handlers
 */
export const FREE_ITEM_EFFECTS: Record<FreeItemType, FreeItemEffect> = {
  [FreeItemType.EXTRA_GUESS]: {
    apply: extraGuess,
  },
  [FreeItemType.REVEAL_ONE]: {
    apply: revealOne,
  },
  [FreeItemType.ELIMINATE_TWO]: {
    apply: eliminateTwo,
  },
  [FreeItemType.HINT]: {
    apply: showHint,
  },
};

/**
 * Apply an item effect
 */
export function applyFreeItemEffect(itemId: FreeItemType, room: FreeRoom, player: FreePlayer): any {
  const effect = FREE_ITEM_EFFECTS[itemId];
  if (!effect) return null;

  return effect.apply(room, player);
}
