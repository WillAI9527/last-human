export type CouncilDecision = "adopt" | "modify" | "reject";

export type HistoryRecord = {
  id: number;
  boardId: string;
  question: string;
  decision: CouncilDecision;
  note: string;
  top: number;
  lines: { label: string; votes: number }[];
  time: string;
};

export type MemoryCard = {
  name: string;
  age: string;
  goal: string;
  pref: string;
  note: string;
};

const HIST_KEY = "wolf-council.history";
const MEM_KEY = "wolf-council.memory";
const HIST_EVENT = "wolf-council-history";
const MEM_EVENT = "wolf-council-memory";

const EMPTY_HISTORY: HistoryRecord[] = [];
const EMPTY_MEMORY: MemoryCard = { name: "", age: "", goal: "", pref: "", note: "" };

let historyCache = EMPTY_HISTORY;
let historyRaw = "";
let memoryCache = EMPTY_MEMORY;
let memoryRaw = "";

function readRaw(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

export function loadHistory(): HistoryRecord[] {
  const raw = readRaw(HIST_KEY);
  if (raw === historyRaw) return historyCache;
  historyRaw = raw;
  if (!raw) {
    historyCache = EMPTY_HISTORY;
    return historyCache;
  }
  try {
    const parsed = JSON.parse(raw) as HistoryRecord[];
    historyCache = Array.isArray(parsed) ? parsed : EMPTY_HISTORY;
  } catch {
    historyCache = EMPTY_HISTORY;
  }
  return historyCache;
}

export function saveHistory(records: HistoryRecord[]): void {
  if (typeof window === "undefined") return;
  historyCache = records;
  historyRaw = JSON.stringify(records);
  window.localStorage.setItem(HIST_KEY, historyRaw);
  window.dispatchEvent(new Event(HIST_EVENT));
}

export function appendHistory(record: Omit<HistoryRecord, "id" | "time">): void {
  const next: HistoryRecord = {
    ...record,
    id: Date.now(),
    time: new Date().toISOString(),
  };
  saveHistory([next, ...loadHistory()]);
}

export function subscribeHistory(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HIST_EVENT, onStoreChange);
  return () => window.removeEventListener(HIST_EVENT, onStoreChange);
}

export function loadMemory(): MemoryCard {
  const raw = readRaw(MEM_KEY);
  if (raw === memoryRaw) return memoryCache;
  memoryRaw = raw;
  if (!raw) {
    memoryCache = EMPTY_MEMORY;
    return memoryCache;
  }
  try {
    memoryCache = { ...EMPTY_MEMORY, ...(JSON.parse(raw) as MemoryCard) };
  } catch {
    memoryCache = EMPTY_MEMORY;
  }
  return memoryCache;
}

export function saveMemory(card: MemoryCard): void {
  if (typeof window === "undefined") return;
  memoryCache = card;
  memoryRaw = JSON.stringify(card);
  window.localStorage.setItem(MEM_KEY, memoryRaw);
  window.dispatchEvent(new Event(MEM_EVENT));
}

export function clearMemory(): void {
  if (typeof window === "undefined") return;
  memoryCache = EMPTY_MEMORY;
  memoryRaw = "";
  window.localStorage.removeItem(MEM_KEY);
  window.dispatchEvent(new Event(MEM_EVENT));
}

export function subscribeMemory(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MEM_EVENT, onStoreChange);
  return () => window.removeEventListener(MEM_EVENT, onStoreChange);
}

export function emptyHistory(): HistoryRecord[] {
  return EMPTY_HISTORY;
}

export function emptyMemory(): MemoryCard {
  return EMPTY_MEMORY;
}

export function memoryFilled(card: MemoryCard): boolean {
  return Object.values(card).some((value) => String(value).trim());
}
