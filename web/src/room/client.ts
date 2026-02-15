import { getWsUrl } from "@/api/room";
import { getUserUUID } from "@/utils/uuid";

export type RoomRole = "host" | "guest";

/** standard: 4 位不重复 1A2B；position_only: 数字可重复，只反馈位置正确个数 */
export type RoomRule = "standard" | "position_only";

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
  hostItemUsed?: boolean;
  guestItemUsed?: boolean;
  /** 是否为重连 */
  isReconnect?: boolean;
  /** 游戏历史记录 */
  history?: {
    role: RoomRole;
    guess: string;
    result: string;
    timestamp: number;
  }[];
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

  useItem(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "use_item" }));
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
