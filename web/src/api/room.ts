const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface CreateRoomRes {
  roomId: string;
  joinUrl: string;
  wsPath: string;
}

export async function createRoom(): Promise<CreateRoomRes> {
  const res = await fetch(`${API_BASE}/api/v1/room/create`, { method: "POST" });
  if (!res.ok) throw new Error("创建房间失败");
  const data = await res.json();
  if (!data?.data) throw new Error(data?.error ?? "创建房间失败");
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname || "/"}?room=${data.data.roomId}`
      : data.data.joinUrl;
  return { ...data.data, joinUrl };
}

export async function getRoom(roomId: string): Promise<{ roomId: string; state: string; hasHost: boolean; hasGuest: boolean; joinUrl: string; wsPath: string }> {
  const res = await fetch(`${API_BASE}/api/v1/room/${roomId}`);
  if (!res.ok) throw new Error("房间不存在");
  const data = await res.json();
  if (!data?.data) throw new Error(data?.error ?? "获取房间失败");
  return data.data;
}

export function getWsUrl(roomId: string, role: "host" | "guest"): string {
  const base = import.meta.env.VITE_WS_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${wsProto}://${host}/ws/room/${roomId}?role=${role}`;
}
