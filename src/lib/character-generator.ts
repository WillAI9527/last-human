import {
  ALL_MODELS,
  GENERATOR_MODEL,
  PLAYER_MODELS,
  PROJECT_MODELS,
  filterPlayerModels,
  type GameScenario,
  type ModelRef,
  type Persona,
  type PlayerMind,
} from "@/types/game";
import {
  getSelectedModels,
  hasDashscopeKey,
  hasTokendanceKey,
  hasZenmuxKey,
  isCustomKeyEnabled,
} from "@/lib/api-keys";
import { VOICE_PRESETS } from "./voice-constants";
import { characterFromVillager, drawVillagers } from "./village-cast";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
  playerMind?: PlayerMind;
  avatarSeed?: string;
}

export interface GeneratedCharacters {
  characters: GeneratedCharacter[];
}

export type Gender = "male" | "female" | "nonbinary";

const MODEL_DISPLAY_NAME_MAP: Array<{ match: RegExp; label: string }> = [
  { match: /gemini/i, label: "Gemini" },
  { match: /deepseek/i, label: "DeepSeek" },
  { match: /claude/i, label: "Claude" },
  { match: /qwen/i, label: "Qwen" },
  { match: /doubao/i, label: "Doubao" },
  { match: /bytedance|seed/i, label: "ByteDance" },
  { match: /openai|gpt/i, label: "OpenAI" },
  { match: /kimi|moonshot/i, label: "Kimi" },
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getModelRefForModel(model: string): ModelRef {
  return (
    PROJECT_MODELS.find((ref) => ref.model === model) ??
    ALL_MODELS.find((ref) => ref.model === model) ??
    { provider: "zenmux" as const, model }
  );
}

export const sampleModelRefs = (count: number): ModelRef[] => {
  // Default pool when custom key is not enabled
  const defaultPool =
    PLAYER_MODELS.length > 0
      ? PLAYER_MODELS
      : [getModelRefForModel(GENERATOR_MODEL)];

  const pool = (() => {
    if (!isCustomKeyEnabled()) return defaultPool;

    // When custom key is enabled, use ALL_MODELS as the full available pool
    const fullPool = ALL_MODELS.length > 0 ? ALL_MODELS : defaultPool;

    const allowedProviders = new Set<ModelRef["provider"]>();
    if (hasZenmuxKey()) allowedProviders.add("zenmux");
    if (hasDashscopeKey()) allowedProviders.add("dashscope");
    if (hasTokendanceKey()) allowedProviders.add("tokendance");
    if (allowedProviders.size === 0) return defaultPool;

    // Filter by allowed providers, then exclude non-player models
    const allowedPool = filterPlayerModels(
      fullPool.filter((ref) => allowedProviders.has(ref.provider))
    );
    if (allowedPool.length === 0) return defaultPool;

    // Filter by user's selected models - STRICTLY respect user selection
    const selectedModels = getSelectedModels();
    if (selectedModels.length === 0) return allowedPool;
    
    // Only use models the user explicitly selected
    const selectedPool = allowedPool.filter((ref) => selectedModels.includes(ref.model));
    
    // If user selected models but none are in allowedPool, try to find them in fullPool
    // This handles cases where user selected models from a different provider
    if (selectedPool.length === 0) {
      const fullSelectedPool = filterPlayerModels(
        fullPool.filter((ref) => selectedModels.includes(ref.model) && allowedProviders.has(ref.provider))
      );
      if (fullSelectedPool.length > 0) return fullSelectedPool;
      
      // Last resort: only return models that user actually selected, even if empty
      // This prevents using models the user didn't choose
      console.warn("[sampleModelRefs] User selected models not found in allowed pool:", selectedModels);
    }
    
    // Return only user-selected models, never fall back to all models
    return selectedPool.length > 0 ? selectedPool : allowedPool.slice(0, 1);
  })();

  if (!Number.isFinite(count) || count <= 0) return [];

  if (count <= pool.length) {
    return shuffleArray(pool).slice(0, count);
  }

  const out = shuffleArray(pool);
  while (out.length < count) {
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return out;
};

const getModelDisplayName = (modelRef: ModelRef): string => {
  const raw = modelRef.model ?? "";
  const mapped = MODEL_DISPLAY_NAME_MAP.find((entry) => entry.match.test(raw))?.label;
  if (mapped) return mapped;
  const fallback = raw.split("/").pop() ?? raw;
  return fallback.split("-")[0] || fallback || "AI";
};

const createGenshinPersona = (voiceId?: string): Persona => {
  return {
    styleLabel: "neutral",
    voiceRules: ["concise"],
    mbti: "NA",
    gender: "nonbinary",
    age: 0,
    voiceId,
  };
};

export const buildGenshinModelRefs = (count: number): ModelRef[] => {
  return sampleModelRefs(count);
};

export const generateGenshinModeCharacters = async (
  count: number,
  modelRefs: ModelRef[]
): Promise<GeneratedCharacter[]> => {
  const modelUsageCounts = new Map<string, number>();
  const modelVoiceMap = new Map<string, string>();
  const resolvedRefs = modelRefs.length >= count ? modelRefs : buildGenshinModelRefs(count);

  return resolvedRefs.slice(0, count).map((modelRef) => {
    const modelLabel = getModelDisplayName(modelRef);
    const usageCount = modelUsageCounts.get(modelLabel) ?? 0;
    modelUsageCounts.set(modelLabel, usageCount + 1);
    const preferredName = usageCount === 0 ? modelLabel : `${modelLabel} ${usageCount + 1}`;

    let voiceId = modelVoiceMap.get(modelLabel);
    if (!voiceId) {
      const preset = VOICE_PRESETS[Math.floor(Math.random() * VOICE_PRESETS.length)];
      voiceId = preset?.id;
      if (voiceId) {
        modelVoiceMap.set(modelLabel, voiceId);
      }
    }

    return {
      displayName: preferredName,
      persona: createGenshinPersona(voiceId),
    };
  });
};


export interface BaseProfile {
  displayName: string;
  gender: Gender;
  age: number;
  mbti: string;
  basicInfo: string;
}

/**
 * Draw this game's villagers from the fixed table.
 * Name, occupation, age band, and voice are copied from the table and are not invented.
 * Speaking style for this game is the villager's temperament; there is no model call
 * that could rename them or change occupation, age, or voice.
 * Role is assigned later and must not change this persona.
 */
export async function generateCharacters(
  count: number,
  _scenario?: GameScenario,
  options?: {
    onBaseProfiles?: (profiles: BaseProfile[]) => void;
    onCharacter?: (index: number, character: GeneratedCharacter) => void;
  }
): Promise<GeneratedCharacter[]> {
  const villagers = drawVillagers(count);
  const characters: GeneratedCharacter[] = villagers.map((villager) => characterFromVillager(villager));
  const profiles: BaseProfile[] = characters.map((character) => ({
    displayName: character.displayName,
    gender: character.persona.gender,
    age: character.persona.age,
    mbti: character.persona.mbti,
    basicInfo: character.persona.basicInfo ?? "",
  }));
  options?.onBaseProfiles?.(profiles);
  characters.forEach((character, index) => {
    options?.onCharacter?.(index, character);
    console.log(`[character-gen] emitted villager ${index}: ${character.displayName}`);
  });
  return characters;
}
