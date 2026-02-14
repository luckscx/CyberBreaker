/**
 * 客户端与服务器联调：游客登录、token 存储、对局上报、幽灵拉取。
 * 服务端约定：/api/v1，响应 { code, message, data? }，鉴权 Header: Authorization: Bearer <token>
 */

const STORAGE_TOKEN = 'cb_token';
const STORAGE_PLAYER_ID = 'cb_playerId';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface GuestResult {
  playerId: string;
  token: string;
}

export interface ActionTimelineItem {
  timestamp: number;
  guessCode: string;
  result: string;
  usedSkill?: string;
}

export interface FinishMatchBody {
  targetCode: string;
  totalTimeMs: number;
  actionTimeline: ActionTimelineItem[];
  isWin?: boolean;
}

export interface GhostRecord {
  recordId: string;
  playerId: string;
  targetCode: string;
  totalTimeMs: number;
  mmrSnapshot: number;
  actionTimeline: ActionTimelineItem[];
}

function getStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  if (typeof localStorage !== 'undefined') return localStorage;
  const map: Record<string, string> = {};
  return {
    getItem: (k) => map[k] ?? null,
    setItem: (k, v) => { map[k] = v; },
  };
}

export class Network {
  static baseUrl = 'http://localhost:3000';

  static getToken(): string | null {
    return getStorage().getItem(STORAGE_TOKEN);
  }

  static getPlayerId(): string | null {
    return getStorage().getItem(STORAGE_PLAYER_ID);
  }

  static setAuth(playerId: string, token: string) {
    const s = getStorage();
    s.setItem(STORAGE_PLAYER_ID, playerId);
    s.setItem(STORAGE_TOKEN, token);
  }

  static clearAuth() {
    const s = getStorage();
    s.setItem(STORAGE_PLAYER_ID, '');
    s.setItem(STORAGE_TOKEN, '');
  }

  static async request<T>(path: string, options: RequestInit & { body?: object } = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const init: RequestInit = {
      ...options,
      headers,
    };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      init.body = JSON.stringify(options.body);
    }
    try {
      const res = await fetch(url, init);
      const json = (await res.json()) as ApiResponse<T>;
      if (res.status >= 400) return { code: res.status, message: json.message ?? res.statusText };
      return json;
    } catch (e) {
      return { code: -1, message: (e as Error).message };
    }
  }

  /** 游客登录 */
  static async guestLogin(deviceId?: string): Promise<ApiResponse<GuestResult>> {
    const res = await this.request<GuestResult>('/api/v1/auth/guest', {
      method: 'POST',
      body: deviceId ? { deviceId } : {},
    });
    if (res.code === 0 && res.data) {
      this.setAuth(res.data.playerId, res.data.token);
    }
    return res;
  }

  /** 对局结束上报 */
  static async finishMatch(body: FinishMatchBody): Promise<ApiResponse<{ recordId: string }>> {
    return this.request<{ recordId: string }>('/api/v1/match/finish', {
      method: 'POST',
      body,
    });
  }

  /** 拉取幽灵对局记录（用于幽灵模式） */
  static async getGhost(): Promise<ApiResponse<GhostRecord>> {
    return this.request<GhostRecord>('/api/v1/match/ghost', { method: 'GET' });
  }
}
