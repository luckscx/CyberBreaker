import { PowerUpType, LevelGameState } from "../types/level";
import { generateSecret } from "./guess";

/**
 * 道具效果处理器
 */
export class PowerUpEffects {
  /**
   * 使用道具：排除2个不在答案中的数字
   */
  static eliminateTwo(state: LevelGameState): LevelGameState {
    const secretDigits = state.secret.split("");
    const allDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const wrongDigits = allDigits.filter((d) => !secretDigits.includes(d));

    // 已经排除的数字
    const alreadyEliminated = state.powerUpEffects.eliminatedDigits || [];
    const availableToEliminate = wrongDigits.filter(
      (d) => !alreadyEliminated.includes(d)
    );

    if (availableToEliminate.length < 2) {
      // 如果不足2个可排除的，尽可能排除
      const toEliminate = availableToEliminate;
      return {
        ...state,
        powerUpEffects: {
          ...state.powerUpEffects,
          eliminatedDigits: [...alreadyEliminated, ...toEliminate],
        },
      };
    }

    // 随机选择2个排除
    const shuffled = [...availableToEliminate].sort(() => Math.random() - 0.5);
    const toEliminate = shuffled.slice(0, 2);

    return {
      ...state,
      powerUpEffects: {
        ...state.powerUpEffects,
        eliminatedDigits: [...alreadyEliminated, ...toEliminate],
      },
    };
  }

  /**
   * 使用道具：揭示一个正确位置的数字
   */
  static revealOne(state: LevelGameState): LevelGameState {
    const secretDigits = state.secret.split("");
    const alreadyRevealed = state.powerUpEffects.revealedPositions || [];
    const revealedPositions = alreadyRevealed.map((r) => r.pos);

    // 找到还未揭示的位置
    const availablePositions = [0, 1, 2, 3].filter(
      (pos) => !revealedPositions.includes(pos)
    );

    if (availablePositions.length === 0) {
      return state; // 所有位置都已揭示
    }

    // 随机选择一个位置揭示
    const posToReveal =
      availablePositions[Math.floor(Math.random() * availablePositions.length)];
    const digitToReveal = secretDigits[posToReveal];

    return {
      ...state,
      powerUpEffects: {
        ...state.powerUpEffects,
        revealedPositions: [
          ...alreadyRevealed,
          { pos: posToReveal, digit: digitToReveal },
        ],
      },
    };
  }

  /**
   * 使用道具：显示答案包含哪4个数字（不含位置）
   */
  static showDigits(state: LevelGameState): LevelGameState {
    const secretDigits = state.secret.split("");
    return {
      ...state,
      powerUpEffects: {
        ...state.powerUpEffects,
        knownDigits: [...secretDigits],
      },
    };
  }

  /**
   * 使用道具：额外增加3次猜测机会
   */
  static addExtraGuesses(state: LevelGameState): LevelGameState {
    if (state.remainingGuesses === null) {
      return state; // 无限制模式，不需要增加
    }

    return {
      ...state,
      remainingGuesses: state.remainingGuesses + 3,
    };
  }

  /**
   * 使用道具：额外增加30秒时间
   */
  static addExtraTime(state: LevelGameState): LevelGameState {
    if (state.remainingSec === null) {
      return state; // 无时间限制，不需要增加
    }

    return {
      ...state,
      remainingSec: state.remainingSec + 30,
    };
  }

  /**
   * 应用道具效果
   */
  static apply(
    state: LevelGameState,
    powerUpType: PowerUpType
  ): LevelGameState {
    let newState = state;

    switch (powerUpType) {
      case PowerUpType.ELIMINATE_TWO:
        newState = PowerUpEffects.eliminateTwo(newState);
        break;
      case PowerUpType.REVEAL_ONE:
        newState = PowerUpEffects.revealOne(newState);
        break;
      case PowerUpType.SHOW_DIGITS:
        newState = PowerUpEffects.showDigits(newState);
        break;
      case PowerUpType.EXTRA_GUESSES:
        newState = PowerUpEffects.addExtraGuesses(newState);
        break;
      case PowerUpType.EXTRA_TIME:
        newState = PowerUpEffects.addExtraTime(newState);
        break;
    }

    // 记录已使用的道具
    newState = {
      ...newState,
      usedPowerUps: [...newState.usedPowerUps, powerUpType],
    };

    return newState;
  }
}
