const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Get player's current inventory
 */
export async function getInventory(playerId: string): Promise<{ [itemId: string]: number }> {
  const res = await fetch(`${API_BASE}/api/v1/inventory?playerId=${encodeURIComponent(playerId)}`);
  if (!res.ok) throw new Error("获取背包失败");
  const data = await res.json();
  return data.inventory ?? {};
}

/**
 * Sync player's inventory after item consumption
 */
export async function syncInventory(playerId: string, inventory: { [itemId: string]: number }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/inventory/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, inventory }),
  });
  if (!res.ok) throw new Error("同步背包失败");
}
