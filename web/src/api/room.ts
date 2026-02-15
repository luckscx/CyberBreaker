const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** standard: 4 位不重复 1A2B；position_only: 数字可重复，只反馈位置正确个数；guess_person: 猜人名 */
export type RoomRule = "standard" | "position_only" | "guess_person";

export interface CreateRoomRes {
  roomId: string;
  joinUrl: string;
  wsPath: string;
  rule: RoomRule;
}

export async function createRoom(rule: RoomRule = "standard"): Promise<CreateRoomRes> {
  const res = await fetch(`${API_BASE}/api/v1/room/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule }),
  });
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

export function getWsUrl(roomId: string, role: "host" | "guest", userUUID?: string): string {
  const base = import.meta.env.VITE_WS_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const uuidParam = userUUID ? `&uuid=${encodeURIComponent(userUUID)}` : "";
  return `${wsProto}://${host}/ws/room/${roomId}?role=${role}${uuidParam}`;
}
