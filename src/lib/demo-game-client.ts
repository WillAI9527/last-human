// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
const STORAGE_KEY = "last_human_demo_game_token";

let memoryToken = "";

export function setDemoGameToken(token: string) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Session storage can be blocked; the HttpOnly cookie is the fallback.
  }
}

export function getDemoGameToken(): string {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return "";
  try {
    memoryToken = window.sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    memoryToken = "";
  }
  return memoryToken;
}

export async function reservePublicGame(): Promise<{ ok: true; remaining: number } | { ok: false; message: string; code: string }> {
  const response = await fetch("/api/games/start", { method: "POST", credentials: "same-origin" });
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; gameToken?: string; remaining?: number };
  if (!response.ok || !payload.gameToken) {
    return {
      ok: false,
      message: payload.error || "暂时无法开局，请稍后再试。",
      code: payload.code || "start_failed",
    };
  }
  setDemoGameToken(payload.gameToken);
  return { ok: true, remaining: payload.remaining ?? 0 };
}
