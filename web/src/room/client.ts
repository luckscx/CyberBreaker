import { getWsUrl } from "@/api/room";

export type RoomRole = "host" | "guest";

export interface RoomMsg {
  type: string;
  roomId?: string;
  role?: RoomRole;
  state?: string;
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
      const url = getWsUrl(roomId, role);
      this.ws = new WebSocket(url);
      this._role = role;
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("连接失败"));
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as RoomMsg;
          this.listeners.forEach((fn) => fn(msg));
        } catch {}
      };
      this.ws.onclose = () => {
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

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this._role = null;
    }
    this.listeners = [];
  }
}
