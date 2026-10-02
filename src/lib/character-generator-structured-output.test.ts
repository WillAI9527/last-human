import assert from "node:assert/strict";
import test from "node:test";

test("村民人设一次发完，不依赖模型的 json_schema 流", async () => {
  const { generateCharacters } = await import("./character-generator");
  let baseProfileEmits = 0;
  let characterEmits = 0;
  const result = await generateCharacters(2, undefined, {
    onBaseProfiles: () => { baseProfileEmits += 1; },
    onCharacter: () => { characterEmits += 1; },
  });
  assert.equal(baseProfileEmits, 1);
  assert.equal(characterEmits, 2);
  assert.equal(result.length, 2);
  for (const character of result) {
    assert.equal(typeof character.persona.occupation, "string");
    assert.equal(typeof character.persona.voiceId, "string");
    assert.equal(/\d+\s*号/.test(character.persona.basicInfo || ""), false);
  }
});
