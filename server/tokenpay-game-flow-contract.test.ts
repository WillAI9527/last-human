import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");
const characterSource = readFileSync("src/lib/character-generator.ts", "utf8");
const llmSource = readFileSync("src/lib/llm.ts", "utf8");
const tokenPayClientSource = readFileSync("src/lib/tokenpay-client.ts", "utf8");
const recoveryHostSource = readFileSync(
  "src/components/game/TokenPayRecoveryHost.tsx",
  "utf8",
);

test("a disconnected TokenPay selection cannot start a game", () => {
  assert.match(
    welcomeSource,
    /getModelSource\(\) === "tokenpay"[\s\S]*await refreshTokenPayConnection\(\)[\s\S]*if \(!connected\)[\s\S]*openTokenPayConnection\(false\)/,
  );
  assert.match(tokenPayClientSource, /loadTokenPayConnectionWithRetry/);
  assert.match(welcomeSource, /handleCreditFailure\(result\)/);
  assert.match(welcomeSource, /result\?\.recoveryAction === "reauthorize_api_key"/);
});

test("character generation draws the fixed village cast and does not call a model", () => {
  assert.match(characterSource, /drawVillagers\(count,/);
  assert.match(characterSource, /characterFromVillager\(villager\)/);
  assert.doesNotMatch(characterSource, /response_format/);
  assert.doesNotMatch(characterSource, /generateJSON|fetch\(/);
  assert.doesNotMatch(characterSource, /cachedBaseProfiles|cachedPersonaBatches/);
  assert.doesNotMatch(characterSource, /CharacterBatchSchemaError/);
});

test("village personas come from the cast table, not JSON batches", () => {
  const castSource = readFileSync("src/lib/village-cast.ts", "utf8");
  assert.match(castSource, /export const VILLAGERS/);
  assert.match(castSource, /voiceId: villager\.voiceId/);
  assert.doesNotMatch(characterSource, /CHARACTER_PERSONA_BATCH_SIZE/);
  assert.doesNotMatch(characterSource, /Promise\.allSettled\(batchTasks\)/);
});

test("TokenPay character generation never starts a paid stream", () => {
  assert.doesNotMatch(characterSource, /response_format: buildPersonaBatchResponseFormat/);
  assert.doesNotMatch(characterSource, /lastEmittedCharacters/);
  assert.doesNotMatch(characterSource, /CharacterBatchSchemaError/);
  assert.match(llmSource, /export async function generateJSON</);
  assert.doesNotMatch(llmSource, /const retryMessages: LLMMessage\[\]/);
});

test("TokenPay avoids ambiguous automatic request replay", () => {
  assert.match(llmSource, /TOKENPAY_RETRYABLE_STATUS = new Set\(\[429\]\)/);
  assert.match(llmSource, /if \(modelSource === "tokenpay" \|\| attempt === maxAttempts\) break/);
  assert.match(llmSource, /STREAM_IDLE_TIMEOUT_MS = 45_000/);
  assert.match(llmSource, /finally \{[\s\S]*await reader\.cancel\(\)/);
});

test("recharge recovery settles when its UI disappears", () => {
  assert.match(
    recoveryHostSource,
    /settleTokenPayTopUp\(requestId, false\)/,
  );
});
