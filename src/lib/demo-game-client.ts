// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
const STORAGE_KEY = "last_human_demo_game_token";
const TESTER_STORAGE_KEY = "last_human_tester_token";
export const TESTER_TOKEN_HEADER = "x-tester-token";

let memoryToken = "";
let memoryTesterToken = "";

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

export function captureTesterTokenFromLocation(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("tester")?.trim() ?? "";
    if (fromQuery) {
      memoryTesterToken = fromQuery;
      window.localStorage.setItem(TESTER_STORAGE_KEY, fromQuery);
      url.searchParams.delete("tester");
      const search = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
      return;
    }
    if (!memoryTesterToken) {
      memoryTesterToken = window.localStorage.getItem(TESTER_STORAGE_KEY)?.trim() ?? "";
    }
  } catch {
    // Storage or history can be blocked. The next start simply has no bypass.
  }
}

export function getTesterToken(): string {
  if (memoryTesterToken) return memoryTesterToken;
  captureTesterTokenFromLocation();
  return memoryTesterToken;
}

export async function reservePublicGame(): Promise<{ ok: true; remaining: number } | { ok: false; message: string; code: string }> {
  const testerToken = getTesterToken();
  const response = await fetch("/api/games/start", {
    method: "POST",
    credentials: "same-origin",
    headers: testerToken ? { [TESTER_TOKEN_HEADER]: testerToken } : undefined,
  });
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
