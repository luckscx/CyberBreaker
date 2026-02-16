import { getFreeWsUrl } from "@/api/freeRoom";

export interface FreePlayerInfo {
  playerId: string;
  nickname: string;
  submitCount: number;
  bestScore: number;
  isHost: boolean;
  eliminated: boolean;
}

export interface FreeGuessResult {
  guess: string;
  a: number;
  b: number;
  submitCount: number;
  bestScore: number;
  remaining: number;
}

export interface FreeRanking {
  playerId: string;
  nickname: string;
  submitCount: number;
  bestScore: number;
  rank: number;
}

export interface FreeRoomMsg {
  type: string;
  message?: string;
  playerId?: string;
  roomCode?: string;
  roomName?: string;
  guessLimit?: number;
  hostId?: string;
  players?: FreePlayerInfo[];
  ranking?: FreeRanking[];
  inventory?: { [itemId: string]: number };
  itemId?: string;
  effectData?: any;
  /** guess_result */
  guess?: string;
  a?: number;
  b?: number;
  submitCount?: number;
  bestScore?: number;
  remaining?: number;
  /** game_over */
  reason?: string;
  winnerId?: string | null;
  secret?: string;
  /** game_over player details */
  history?: { guess: string; a: number; b: number }[];
}

export class FreeRoomClient {
  private ws: WebSocket | null = null;
  private _playerId: string = "";
  private listeners: ((msg: FreeRoomMsg) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  get playerId(): string { return this._playerId; }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(roomCode: string, nickname: string, playerId: string, password?: string): Promise<void> {
    this._playerId = playerId;
    return new Promise((resolve, reject) => {
      const url = getFreeWsUrl(roomCode, nickname, playerId, password);
      console.log("[FreeRoomClient] connecting", url);
      this.ws = new WebSocket(url);

      let resolved = false;

      this.ws.onopen = () => {
        console.log("[FreeRoomClient] connected");
        resolved = true;
        resolve();
      };

      this.ws.onerror = (event) => {
        console.error("[FreeRoomClient] connection error:", event);
        if (!resolved) {
          reject(new Error("连接失败"));
        }
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as FreeRoomMsg;
          this.listeners.forEach((fn) => fn(msg));
        } catch (err) {
          console.error("[FreeRoomClient] message parse error:", err);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[FreeRoomClient] connection closed, code:", event.code, "reason:", event.reason);
        this.ws = null;

        // Notify all close listeners
        this.closeListeners.forEach((fn) => fn());

        // If connection closed unexpectedly during connection phase
        if (!resolved) {
          reject(new Error("连接被关闭"));
        }
      };
    });
  }

  onMessage(fn: (msg: FreeRoomMsg) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((x) => x !== fn); };
  }

  onClose(fn: () => void): () => void {
    this.closeListeners.push(fn);
    return () => { this.closeListeners = this.closeListeners.filter((x) => x !== fn); };
  }

  start(): void {
    this._send({ type: "start" });
  }

  submitGuess(guess: string): void {
    this._send({ type: "submit_guess", guess });
  }

  useItem(itemId: string): void {
    this._send({ type: "use_item", itemId });
  }

  restart(): void {
    this._send({ type: "restart" });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners = [];
    this.closeListeners = [];
  }

  private _send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
