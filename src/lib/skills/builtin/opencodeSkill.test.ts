import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { opencodeSkillMeta } from "./opencodeSkill.js";

describe("opencodeSkillMeta", () => {
  it("has required fields", () => {
    assert.ok(opencodeSkillMeta.id);
    assert.ok(opencodeSkillMeta.name);
    assert.ok(opencodeSkillMeta.version);
    assert.ok(opencodeSkillMeta.description);
    assert.ok(Array.isArray(opencodeSkillMeta.tags));
  });

  it("has valid schema with all actions", () => {
    const actions = opencodeSkillMeta.schema.input.action.enum;
    assert.ok(actions.includes("status"));
    assert.ok(actions.includes("install"));
    assert.ok(actions.includes("configure"));
    assert.ok(actions.includes("run"));
    assert.ok(actions.includes("list_models"));
    assert.ok(actions.includes("update"));
  });

  it("id matches expected format", () => {
    assert.match(opencodeSkillMeta.id, /^[a-z0-9-]+$/);
  });
});
