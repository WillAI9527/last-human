import assert from "node:assert/strict";
import test from "node:test";

test("固定村民表生成角色时不调用模型，也不会产生 TokenPay 请求", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("should not be called", { status: 500 });
  };
  try {
    const { generateCharacters } = await import("./character-generator");
    const { VILLAGERS } = await import("./village-cast");
    const characters = await generateCharacters(8);
    assert.equal(calls, 0);
    assert.equal(characters.length, 8);
    assert.equal(new Set(characters.map((character) => character.displayName)).size, 8);
    for (const character of characters) {
      const villager = VILLAGERS.find((entry) => entry.id === character.avatarSeed);
      assert.ok(villager, character.avatarSeed);
      assert.equal(character.displayName, villager.name);
      assert.equal(character.persona.occupation, villager.occupation);
      assert.equal(character.persona.ageBand, villager.ageBand);
      assert.equal(character.persona.voiceId, villager.voiceId);
      assert.equal(character.persona.temperament, villager.temperament);
      assert.equal(character.persona.basicInfo, `${villager.occupation}。${villager.temperament}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
