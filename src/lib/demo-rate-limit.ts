// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_DAILY_GAME_LIMIT = 3;
export const GAMES_PER_IP_PER_DAY = DEFAULT_DAILY_GAME_LIMIT;
export const LLM_CALLS_PER_GAME = 500;
export const GAME_COOKIE = "lh_game";
export const QUOTA_COOKIE = "lh_quota";
export const LLM_COOKIE = "lh_llm";
export const TESTER_TOKEN_HEADER = "x-tester-token";

export const MSG_SERVER_NOT_CONFIGURED = "服务器未配置，暂时无法开局。";
export const MSG_DAILY_LIMIT = "今天的 3 局已经用完了。请明天（新加坡时间）再来。";
export const MSG_LLM_CAP = "这一局的对话次数已经到上限，不能再继续了。请回到首页，明天再开新局。";
export const MSG_NEED_GAME = "请先从首页开始一局。";

const GAME_TTL_SECONDS = 60 * 60 * 24;
const MEMORY_SWEEP_MS = 60 * 60 * 1000;

type GameRecord = { ipHash: string; calls: number; exp: number };
type QuotaResult =
  | { ok: true; gameToken: string; remaining: number; cookies: string[] }
  | { ok: false; status: number; code: string; message: string };

type LlmResult =
  | { ok: true; cookies: string[] }
  | { ok: false; status: number; code: string; message: string };

const gamesByToken = new Map<string, GameRecord>();
const dailyCounts = new Map<string, number>();
let lastSweep = Date.now();

function secret(): string {
  return process.env.DEMO_RATE_LIMIT_SECRET || process.env.ZENMUX_API_KEY || "last-human-demo";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSigned(data: unknown): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSigned<T>(token: string): T | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function singaporeDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function hashValue(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex").slice(0, 32);
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function cookie(name: string, value: string, maxAge = GAME_TTL_SECONDS): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function sweepMemory(now = Date.now()) {
  if (now - lastSweep < MEMORY_SWEEP_MS) return;
  lastSweep = now;
  for (const [token, game] of gamesByToken) {
    if (game.exp <= now) gamesByToken.delete(token);
  }
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function upstash(command: (string | number)[]): Promise<unknown> {
  const config = upstashConfig();
  if (!config) return undefined;
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { result?: unknown };
    return payload.result;
  } catch (error) {
    console.warn("[demo-rate-limit] shared counter unavailable", error);
    return undefined;
  }
}

function readQuotaCookie(request: Request, ipHash: string, day: string): number {
  const parsed = decodeSigned<{ ipHash?: string; day?: string; count?: number }>(readCookie(request, QUOTA_COOKIE));
  if (!parsed || parsed.ipHash !== ipHash || parsed.day !== day) return 0;
  return Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0;
}

function readLlmCookie(request: Request, gameId: string): number {
  const parsed = decodeSigned<{ gameId?: string; count?: number; exp?: number }>(readCookie(request, LLM_COOKIE));
  if (!parsed || parsed.gameId !== gameId) return 0;
  if (typeof parsed.exp === "number" && parsed.exp <= Date.now()) return 0;
  return Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0;
}

async function readSharedCount(key: string): Promise<number | undefined> {
  const value = await upstash(["GET", key]);
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function writeSharedCount(key: string, count: number) {
  await upstash(["SET", key, String(count), "EX", String(GAME_TTL_SECONDS)]);
}

export function isZenmuxConfigured(): boolean {
  return Boolean(process.env.ZENMUX_API_KEY?.trim());
}

export function getDailyGameLimit(): number {
  const raw = process.env.DAILY_GAME_LIMIT?.trim();
  if (!raw) return DEFAULT_DAILY_GAME_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_DAILY_GAME_LIMIT;
  return parsed;
}

export function dailyLimitMessage(limit = getDailyGameLimit()): string {
  return `今天的 ${limit} 局已经用完了。请明天（新加坡时间）再来。`;
}

function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isDailyLimitBypassed(request: Request): boolean {
  const expected = process.env.RATE_LIMIT_BYPASS_TOKEN?.trim() ?? "";
  if (!expected) return false;
  const provided = request.headers.get(TESTER_TOKEN_HEADER)?.trim() ?? "";
  if (!provided) return false;
  return tokensMatch(expected, provided);
}

export async function startDemoGame(request: Request): Promise<QuotaResult> {
  if (!isZenmuxConfigured()) {
    return { ok: false, status: 503, code: "server_not_configured", message: MSG_SERVER_NOT_CONFIGURED };
  }
  sweepMemory();
  const ip = getClientIp(request);
  const ipHash = hashValue(ip);
  const day = singaporeDayKey();
  const memoryKey = `${day}:${ipHash}`;
  const sharedKey = `lh:games:${day}:${ipHash}`;
  const shared = await readSharedCount(sharedKey);
  const count = Math.max(dailyCounts.get(memoryKey) ?? 0, readQuotaCookie(request, ipHash, day), shared ?? 0);
  const limit = getDailyGameLimit();
  const bypass = isDailyLimitBypassed(request);
  // A tester token skips the shared IP quota and does not consume it.
  // The per-game LLM cap still applies after the game token is issued.
  if (!bypass && count >= limit) {
    return { ok: false, status: 429, code: "daily_limit", message: dailyLimitMessage(limit) };
  }
  const next = bypass ? count : count + 1;
  if (!bypass) {
    dailyCounts.set(memoryKey, next);
    await writeSharedCount(sharedKey, next);
  }

  const exp = Date.now() + GAME_TTL_SECONDS * 1000;
  const gameToken = encodeSigned({ ipHash, exp });
  gamesByToken.set(gameToken, { ipHash, calls: 0, exp });
  await upstash(["SET", `lh:game:${gameToken}`, JSON.stringify({ ipHash, calls: 0, exp }), "EX", String(GAME_TTL_SECONDS)]);

  return {
    ok: true,
    gameToken,
    remaining: bypass ? limit : limit - next,
    cookies: [
      cookie(GAME_COOKIE, gameToken),
      cookie(QUOTA_COOKIE, encodeSigned({ ipHash, day, count: next })),
      cookie(LLM_COOKIE, encodeSigned({ gameId: gameToken, count: 0, exp })),
    ],
  };
}

// The game token is HMAC-signed, so it cannot be forged. It is deliberately
// NOT re-bound to the caller's current IP: many real networks (CGNAT, mobile
// handover, VPN/relay egress pools) present a different source IP per
// connection, which used to break games mid-way with "请先从首页开始一局。".
// The daily cap is enforced when the token is issued; the per-game LLM cap
// still bounds what one token can spend.
async function loadGame(token: string): Promise<GameRecord | null> {
  const signed = decodeSigned<{ ipHash?: string; exp?: number }>(token);
  if (!signed || typeof signed.ipHash !== "string" || typeof signed.exp !== "number" || signed.exp <= Date.now()) {
    return null;
  }
  const ipHash = signed.ipHash;
  let calls = 0;
  const memory = gamesByToken.get(token);
  if (memory && memory.exp > Date.now()) calls = Math.max(calls, memory.calls);
  const raw = await upstash(["GET", `lh:game:${token}`]);
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw) as GameRecord;
      if (parsed?.ipHash === ipHash && Number.isFinite(parsed.calls)) {
        calls = Math.max(calls, parsed.calls);
      }
    } catch {
      // A missing shared counter falls back to the signed cookie.
    }
  }
  const record = { ipHash, calls, exp: signed.exp };
  gamesByToken.set(token, record);
  return record;
}

export function readDemoGameToken(request: Request): string {
  return request.headers.get("x-demo-game-token")?.trim()
    || readCookie(request, GAME_COOKIE);
}

export async function consumeDemoLlmCall(request: Request, count = 1): Promise<LlmResult> {
  const token = readDemoGameToken(request);
  if (!token) {
    return { ok: false, status: 403, code: "missing_game", message: MSG_NEED_GAME };
  }
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const game = await loadGame(token);
  if (!game) {
    return { ok: false, status: 403, code: "invalid_game", message: MSG_NEED_GAME };
  }
  const shared = await readSharedCount(`lh:llm:${token}`);
  const used = Math.max(game.calls, readLlmCookie(request, token), shared ?? 0);
  if (used + safeCount > LLM_CALLS_PER_GAME) {
    return { ok: false, status: 429, code: "llm_cap", message: MSG_LLM_CAP };
  }
  const next = used + safeCount;
  game.calls = next;
  gamesByToken.set(token, game);
  await writeSharedCount(`lh:llm:${token}`, next);
  await upstash(["SET", `lh:game:${token}`, JSON.stringify(game), "EX", String(GAME_TTL_SECONDS)]);
  return {
    ok: true,
    cookies: [cookie(LLM_COOKIE, encodeSigned({ gameId: token, count: next, exp: game.exp }))],
  };
}

export function applyRateLimitCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function resetDemoRateLimitForTests() {
  gamesByToken.clear();
  dailyCounts.clear();
}
