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
    const characters = await generateCharacters(3);
    assert.equal(calls, 0);
    assert.equal(characters.length, 3);
    assert.equal(new Set(characters.map((character) => character.displayName)).size, 3);
    assert.ok(characters.every((character) => /^(m|f)-\d{2}$/.test(character.avatarSeed || "")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
