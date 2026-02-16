const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface CreateFreeRoomRes {
  roomCode: string;
  roomName: string;
  guessLimit: number;
  hasPassword: boolean;
}

export async function createFreeRoom(opts: {
  roomName?: string;
  password?: string;
  guessLimit?: number;
}): Promise<CreateFreeRoomRes> {
  const res = await fetch(`${API_BASE}/api/v1/free/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error("创建房间失败");
  const data = await res.json();
  if (data?.code !== 0) throw new Error(data?.message ?? "创建房间失败");
  return data.data;
}

export interface FreeRoomInfo {
  roomCode: string;
  roomName: string;
  state: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  guessLimit: number;
  players: { playerId: string; nickname: string; submitCount: number; bestScore: number; isHost: boolean; eliminated: boolean }[];
}

export async function getFreeRoom(roomCode: string): Promise<FreeRoomInfo> {
  const res = await fetch(`${API_BASE}/api/v1/free/${roomCode}`);
  if (!res.ok) throw new Error("房间不存在");
  const data = await res.json();
  if (data?.code !== 0) throw new Error(data?.message ?? "获取房间失败");
  return data.data;
}

export function getFreeWsUrl(roomCode: string, nickname: string, playerId: string, password?: string): string {
  const base = import.meta.env.VITE_WS_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let url = `${wsProto}://${host}/ws/free/${roomCode}?nickname=${encodeURIComponent(nickname)}&playerId=${encodeURIComponent(playerId)}`;
  if (password) url += `&password=${encodeURIComponent(password)}`;
  return url;
}
