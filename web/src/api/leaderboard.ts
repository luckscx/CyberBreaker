const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface SubmitScoreParams {
  levelId: number;
  playerName: string;
  guessCount: number;
  timeMs: number;
}

export interface SubmitScoreResponse {
  recordId: string;
  submittedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  guessCount: number;
  timeMs: number;
  timestamp: Date;
}

export interface LeaderboardResponse {
  list: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 提交关卡成绩
 */
export async function submitCampaignScore(
  params: SubmitScoreParams
): Promise<SubmitScoreResponse> {
  const res = await fetch(`${API_BASE}/api/v1/leaderboard/campaign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error ?? "提交成绩失败");
  }

  const data = await res.json();
  if (!data?.data) throw new Error(data?.error ?? "提交成绩失败");
  return data.data;
}

/**
 * 获取指定关卡的排行榜
 */
export async function getCampaignLeaderboard(
  levelId: number,
  page: number = 1,
  limit: number = 20
): Promise<LeaderboardResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/leaderboard/campaign/${levelId}?page=${page}&limit=${limit}`
  );

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error ?? "获取排行榜失败");
  }

  const data = await res.json();
  if (!data?.data) throw new Error(data?.error ?? "获取排行榜失败");
  return data.data;
}
