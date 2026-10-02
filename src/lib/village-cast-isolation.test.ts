import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Player, Role } from "@/types/game";
import { buildGameContext } from "./prompt-utils";
import {
  VILLAGERS,
  characterFromVillager,
  drawVillagers,
  publicPersonaText,
  publicUiData,
} from "./village-cast";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "village-cast-test-key";
setLocale("zh");

const SEAT_NUMBER = /\d+\s*号/;

function observerState(ai: Player): GameState {
  const human: Player = {
    playerId: "human",
    seat: 0,
    displayName: "你",
    avatarSeed: "human",
    alive: true,
    role: "Villager",
    alignment: "village",
    isHuman: true,
  };
  return {
    gameId: "isolation",
    phase: "DAY_SPEECH",
    day: 1,
    difficulty: "normal",
    players: [human, ai],
    events: [],
    messages: [],
    currentSpeakerSeat: 1,
    daySpeechStartSeat: 0,
    badge: { holderSeat: null, candidates: [], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0 },
    votes: {},
    voteHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    dailySummaryVoteData: {},
    nightActions: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
      idiotRevealed: false,
      whiteWolfKingBoomUsed: false,
    },
    winner: null,
  };
}

test("同一村民换成不同身份后，别人看到的人设和界面数据不变", async () => {
  const { setupPlayers } = await import("./game-master");
  const villager = VILLAGERS.find((item) => item.id === "m-01");
  assert.ok(villager);
  const character = characterFromVillager(villager);
  const roles: Role[] = ["Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Idiot", "WhiteWolfKing"];
  const seated = roles.map((role) => setupPlayers(
    [character],
    0,
    "你",
    2,
    ["Villager", role],
  )[1]);

  const personaText = publicPersonaText(seated[0]);
  const ui = publicUiData(seated[0]);
  const prompt = buildGameContext(observerState(seated[0]), observerState(seated[0]).players[0]);
  assert.equal(SEAT_NUMBER.test(personaText), false);
  assert.equal(SEAT_NUMBER.test(ui.occupation + ui.temperament), false);
  assert.equal(ui.voiceId, villager.voiceId);
  assert.equal(ui.avatar, "/avatars/villagers/m-01.webp");

  for (const player of seated) {
    assert.equal(publicPersonaText(player), personaText);
    assert.deepEqual(publicUiData(player), ui);
    assert.deepEqual(player.agentProfile?.persona, seated[0].agentProfile?.persona);
    assert.equal(buildGameContext(observerState(player), observerState(player).players[0]), prompt);
  }
});

test("一局抽取的村民不重复，且人设不带座位号", () => {
  const drawn = drawVillagers(9, () => 0.5);
  assert.equal(drawn.length, 9);
  assert.equal(new Set(drawn.map((item) => item.id)).size, 9);
  for (const villager of VILLAGERS) {
    const persona = characterFromVillager(villager).persona;
    const text = `${villager.name} ${persona.basicInfo} ${persona.occupation} ${persona.temperament}`;
    assert.equal(SEAT_NUMBER.test(text), false);
    assert.equal(persona.voiceId, villager.voiceId);
  }
});
