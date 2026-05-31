import assert from "node:assert/strict";
import test from "node:test";

import { parseGitCherryOutput } from "../src/committedWork";

test("parses git cherry output into equivalent and unique patch counts", () => {
  assert.deepEqual(
    parseGitCherryOutput(
      "origin/main",
      [
        "- aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "+ bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "+ cccccccccccccccccccccccccccccccccccccccc",
      ].join("\n"),
    ),
    {
      base: "origin/main",
      uniquePatchCount: 2,
      equivalentPatchCount: 1,
      uniqueCommits: [
        { hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        { hash: "cccccccccccccccccccccccccccccccccccccccc" },
      ],
      equivalentCommits: [{ hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
    },
  );
});
