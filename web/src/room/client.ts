import { getWsUrl } from "@/api/room";
import { getUserUUID } from "@/utils/uuid";

export type RoomRole = "host" | "guest";

/** standard: 4 位不重复 1A2B；position_only: 数字可重复，只反馈位置正确个数；guess_person: 猜人名 */
export type RoomRule = "standard" | "position_only" | "guess_person";

/** 猜人名候选问题 */
export interface GpCandidateQuestion {
  id: number;
  question: string;
}

export interface RoomMsg {
  type: string;
  roomId?: string;
  role?: RoomRole;
  state?: string;
  rule?: RoomRule;
  message?: string;
  turn?: RoomRole;
  nextTurn?: RoomRole;
  guess?: string;
  result?: string;
  winner?: RoomRole;
  error?: string;
  hostCodeSet?: boolean;
  guestCodeSet?: boolean;
  /** 服务器下发的本回合开始时间戳（毫秒），用于双方统一倒计时 */
  turnStartAt?: number;
  /** 道具背包 */
  inventory?: { [itemId: string]: number };
  /** 道具 ID */
  itemId?: string;
  /** 道具效果数据 */
  effectData?: any;
  /** 是否为重连 */
  isReconnect?: boolean;
  /** 游戏历史记录 */
  history?: {
    role: RoomRole;
    guess: string;
    result: string;
    timestamp: number;
  }[];

  /* ── guess_person 模式字段 ── */
  /** 候选问题列表 */
  candidateQuestions?: GpCandidateQuestion[];
  /** 总问题数 */
  totalQuestions?: number;
  /** 已提问数 */
  askedCount?: number;
  /** 是否所有问题已用完 */
  allAsked?: boolean;
  /** 提问的问题文本 */
  question?: string;
  /** 问题答案 */
  answer?: string;
  /** 由谁提问 */
  askedBy?: RoomRole;
  /** 猜测的人名 */
  name?: string;
  /** 答案人名（game_over 时） */
  personName?: string;
  /** 重连用：问答历史 */
  gpQAHistory?: { question: string; answer: string; askedBy: RoomRole }[];
  /** 重连用：错误猜测 */
  gpWrongGuesses?: { role: RoomRole; name: string }[];
  /** 猜错后冷却时间（毫秒） */
  cooldownMs?: number;
  gpAskedCount?: number;
  gpTotalQuestions?: number;
  gpAllAsked?: boolean;
  gpCandidateQuestions?: GpCandidateQuestion[];
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private _role: RoomRole | null = null;
  private listeners: ((msg: RoomMsg) => void)[] = [];

  get role(): RoomRole | null {
    return this._role;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(roomId: string, role: RoomRole): Promise<void> {
    return new Promise((resolve, reject) => {
      const userUUID = getUserUUID(); // 获取用户 UUID
      const url = getWsUrl(roomId, role, userUUID);
      console.log(`[RoomClient] connecting to ${roomId} as ${role} with UUID ${userUUID}`);
      this.ws = new WebSocket(url);
      this._role = role;
      this.ws.onopen = () => {
        console.log('[RoomClient] connected');
        resolve();
      };
      this.ws.onerror = () => {
        console.log('[RoomClient] connection error');
        reject(new Error("连接失败"));
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as RoomMsg;
          if (msg.type === 'room_joined' && msg.isReconnect) {
            console.log('[RoomClient] reconnected successfully, history length:', msg.history?.length ?? 0);
          }
          this.listeners.forEach((fn) => fn(msg));
        } catch {}
      };
      this.ws.onclose = () => {
        console.log('[RoomClient] connection closed');
        this.ws = null;
        this._role = null;
      };
    });
  }

  onMessage(fn: (msg: RoomMsg) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }

  setCode(code: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "set_code", code }));
    }
  }

  guess(guess: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "guess", guess }));
    }
  }

  turnTimeout(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "turn_timeout" }));
    }
  }

  useItem(itemId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "use_item", itemId }));
    }
  }

  /** 猜人名：选择一个候选问题 */
  gpPickQuestion(questionId: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "gp_pick_question", questionId }));
    }
  }

  /** 猜人名：提交人名猜测 */
  gpGuessName(name: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "gp_guess_name", name }));
    }
  }

  /** 猜人名：回合超时 */
  gpTurnTimeout(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "gp_turn_timeout" }));
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this._role = null;
    }
    this.listeners = [];
  }
}
