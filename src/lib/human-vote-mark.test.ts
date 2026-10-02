import assert from "node:assert/strict";
import test from "node:test";
import { humanUnrevealedVoteSeat } from "./human-vote-mark";

test("只返回真人自己尚未公布的投票目标", () => {
  const dayVotes = { human: 4, "ai-wolf": 1, "ai-seer": 4 };
  assert.equal(humanUnrevealedVoteSeat("DAY_VOTE", "human", dayVotes, {}), 4);
  assert.equal(humanUnrevealedVoteSeat("DAY_VOTE", "ai-wolf", dayVotes, {}), 1);
  assert.equal(humanUnrevealedVoteSeat("DAY_SPEECH", "human", dayVotes, {}), null);
  assert.equal(humanUnrevealedVoteSeat("DAY_RESOLVE", "human", dayVotes, {}), null);
  assert.equal(humanUnrevealedVoteSeat("DAY_VOTE", "human", { human: -1 }, {}), null);
});

test("警徽投票只看真人的警徽票，不看放逐票", () => {
  assert.equal(
    humanUnrevealedVoteSeat("DAY_BADGE_ELECTION", "human", { human: 2 }, { human: 6, "ai-wolf": 1 }),
    6,
  );
  assert.equal(
    humanUnrevealedVoteSeat("DAY_VOTE", "human", { human: 2 }, { human: 6 }),
    2,
  );
});
