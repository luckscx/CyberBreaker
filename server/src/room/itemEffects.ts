/**
 * Item Effect Handlers
 * Server-side implementations of item effects
 */

import type { Room, RoomRole } from './store.js';
import { PowerUpType } from '../config/items.js';

export interface ItemEffect {
  /**
   * Apply the item effect to the room state
   * @returns Effect data to broadcast to clients
   */
  apply: (room: Room, role: RoomRole) => any;
}

/**
 * Reveal one digit position to the player
 */
function revealOneDigit(room: Room, role: RoomRole): any {
  const opponentRole: RoomRole = role === 'host' ? 'guest' : 'host';
  const opponentCode = opponentRole === 'host' ? room.hostCode : room.guestCode;

  if (!opponentCode || opponentCode.length !== 4) {
    return { effect: 'reveal_one', revealed: null };
  }

  // Find a random unrevealed position
  const positions = [0, 1, 2, 3];
  const randomIndex = Math.floor(Math.random() * positions.length);
  const position = positions[randomIndex];
  const digit = opponentCode[position];

  return {
    effect: 'reveal_one',
    position,
    digit,
  };
}

/**
 * Eliminate two digits that are NOT in the opponent's code
 */
function eliminateTwoDigits(room: Room, role: RoomRole): any {
  const opponentRole: RoomRole = role === 'host' ? 'guest' : 'host';
  const opponentCode = opponentRole === 'host' ? room.hostCode : room.guestCode;

  if (!opponentCode || opponentCode.length !== 4) {
    return { effect: 'eliminate_two', eliminated: [] };
  }

  const codeDigits = new Set(opponentCode.split(''));
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const wrongDigits = allDigits.filter(d => !codeDigits.has(d));

  // Pick 2 random wrong digits
  const shuffled = wrongDigits.sort(() => Math.random() - 0.5);
  const eliminated = shuffled.slice(0, 2);

  return {
    effect: 'eliminate_two',
    eliminated,
  };
}

/**
 * Show all digits in the opponent's code (without positions)
 */
function showHint(room: Room, role: RoomRole): any {
  const opponentRole: RoomRole = role === 'host' ? 'guest' : 'host';
  const opponentCode = opponentRole === 'host' ? room.hostCode : room.guestCode;

  if (!opponentCode || opponentCode.length !== 4) {
    return { effect: 'hint', digits: [] };
  }

  const digits = opponentCode.split('').sort();

  return {
    effect: 'hint',
    digits,
  };
}

/**
 * Add 30 seconds to the player's current turn time
 */
function addExtraTime(room: Room, role: RoomRole): any {
  return {
    effect: 'extra_time',
    seconds: 30,
    targetRole: role,
  };
}

/**
 * Reduce opponent's next turn time by 10 seconds
 */
function reduceOpponentTime(room: Room, role: RoomRole): any {
  const opponentRole: RoomRole = role === 'host' ? 'guest' : 'host';

  return {
    effect: 'reduce_opponent_time',
    seconds: -10,
    targetRole: opponentRole,
  };
}

/**
 * Limit opponent's next turn to only 1 guess
 */
function limitOpponentGuesses(room: Room, role: RoomRole): any {
  const opponentRole: RoomRole = role === 'host' ? 'guest' : 'host';

  return {
    effect: 'limit_opponent_guesses',
    maxGuesses: 1,
    targetRole: opponentRole,
  };
}

/**
 * Map of item IDs to their effect handlers
 */
export const ITEM_EFFECTS: Record<PowerUpType, ItemEffect> = {
  [PowerUpType.REVEAL_ONE]: {
    apply: revealOneDigit,
  },
  [PowerUpType.ELIMINATE_TWO]: {
    apply: eliminateTwoDigits,
  },
  [PowerUpType.HINT]: {
    apply: showHint,
  },
  [PowerUpType.EXTRA_TIME]: {
    apply: addExtraTime,
  },
  [PowerUpType.REDUCE_OPPONENT_TIME]: {
    apply: reduceOpponentTime,
  },
  [PowerUpType.LIMIT_OPPONENT_GUESSES]: {
    apply: limitOpponentGuesses,
  },
};

/**
 * Apply an item effect
 * @returns Effect data to broadcast, or null if item not found
 */
export function applyItemEffect(itemId: PowerUpType, room: Room, role: RoomRole): any {
  const effect = ITEM_EFFECTS[itemId];
  if (!effect) return null;

  return effect.apply(room, role);
}
