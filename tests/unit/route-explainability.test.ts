import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-route-explain-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const callLogs = await import("../../src/lib/usage/callLogs.ts");
const routeExplain = await import("../../src/lib/usage/routeExplain.ts");
const route = await import("../../src/app/api/usage/route-explain/[id]/route.ts");

type RouteExplainabilityResponse =
  import("../../src/lib/usage/routeExplain.ts").RouteExplainabilityResponse;

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("route explainability builds a direct-route explanation from call logs", async () => {
  await callLogs.saveCallLog({
    id: "direct-route-1",
    timestamp: "2026-05-20T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    status: 200,
    model: "openai/gpt-4o-mini",
    requestedModel: "openai/gpt-4o-mini",
    provider: "openai",
    connectionId: "conn-openai-a",
    duration: 320,
    tokens: { input: 120, output: 45 },
    cacheSource: "upstream",
    requestType: "chat",
    sourceFormat: "openai",
    targetFormat: "openai",
  });

  const explanation = await routeExplain.explainRouteByRequestId("direct-route-1");

  assert.ok(explanation);
  assert.equal(explanation.routeType, "direct");
  assert.equal(explanation.providerSelected, "openai");
  assert.equal(explanation.modelUsed, "openai/gpt-4o-mini");
  assert.equal(explanation.selectedTarget.status, 200);
  assert.equal(
    explanation.decision.factors.some((factor) => factor.name === "Direct routing"),
    true
  );
  assert.equal(explanation.recommendations.length > 0, true);
});

test("route explainability surfaces nearby combo fallback evidence", async () => {
  await callLogs.saveCallLog({
    id: "combo-failed-step",
    timestamp: "2026-05-20T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    status: 503,
    model: "openai/gpt-4o-mini",
    requestedModel: "coding-combo",
    provider: "openai",
    connectionId: "conn-openai-a",
    duration: 900,
    tokens: { input: 100, output: 0 },
    comboName: "coding-combo",
    comboStepId: "step-openai",
    comboExecutionKey: "step-openai",
    error: "upstream unavailable",
  });
  await callLogs.saveCallLog({
    id: "combo-selected-step",
    timestamp: "2026-05-20T12:01:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    status: 200,
    model: "anthropic/claude-3-5-sonnet",
    requestedModel: "coding-combo",
    provider: "anthropic",
    connectionId: "conn-anthropic-a",
    duration: 450,
    tokens: { input: 100, output: 80 },
    comboName: "coding-combo",
    comboStepId: "step-anthropic",
    comboExecutionKey: "step-anthropic",
    pipelinePayloads: { clientRequest: { model: "coding-combo" } },
  });

  const explanation = await routeExplain.explainRouteByRequestId("combo-selected-step");

  assert.ok(explanation);
  assert.equal(explanation.routeType, "combo");
  assert.equal(explanation.comboUsed, "coding-combo");
  assert.equal(explanation.confidence, "high");
  assert.equal(explanation.relatedTargets.length, 2);
  assert.equal(explanation.fallbacksTriggered.length, 1);
  assert.equal(explanation.fallbacksTriggered[0].id, "combo-failed-step");
  assert.equal(explanation.targetStats.successRate, 100);
});

test("route explainability API returns a routing decision document", async () => {
  await callLogs.saveCallLog({
    id: "api-route-1",
    timestamp: "2026-05-20T12:02:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    status: 200,
    model: "openai/gpt-4o-mini",
    requestedModel: "openai/gpt-4o-mini",
    provider: "openai",
    duration: 120,
  });

  const response = await route.GET(
    new Request("http://localhost/api/usage/route-explain/api-route-1"),
    {
      params: Promise.resolve({ id: "api-route-1" }),
    }
  );
  const body = (await response.json()) as RouteExplainabilityResponse;

  assert.equal(response.status, 200);
  assert.equal(body.requestId, "api-route-1");
  assert.equal(body.decision.providerSelected, "openai");
  assert.equal(Array.isArray(body.decision.factors), true);
});
