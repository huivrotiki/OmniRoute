import test from "node:test";
import assert from "node:assert/strict";

const { createSseHeartbeatTransform, HEARTBEAT_SHAPES, shapeForClientFormat } =
  await import("../../open-sse/utils/sseHeartbeat.ts");

const STREAM_TS_STRIP_RE = /^event:\s*keepalive\b/i;

function decodeChunk(value) {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

function readWithTimeout(reader, timeoutMs = 200) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("timed out waiting for heartbeat")),
      timeoutMs
    );
    reader.read().then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

test("integration: anthropic-ping heartbeat reaches downstream and does NOT trigger stream.ts strip", async () => {
  // Build a fake upstream that emits one chunk then idles indefinitely
  let cancelled = false;
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: message_start\ndata: {}\n\n"));
      // never close — let heartbeat fire
    },
    cancel() {
      cancelled = true;
    },
  });

  const transform = createSseHeartbeatTransform({
    intervalMs: 20,
    shape: HEARTBEAT_SHAPES.ANTHROPIC_PING,
  });

  const piped = upstream.pipeThrough(transform);
  const reader = piped.getReader();

  // Read first (real) chunk
  const { value: first } = await reader.read();
  assert.match(decodeChunk(first), /event: message_start/);

  const { value, done } = await readWithTimeout(reader);
  assert.equal(done, false);
  const chunk = decodeChunk(value);
  assert.match(chunk, /^event: ping\b/m);
  for (const line of chunk.split("\n")) {
    assert.ok(
      !STREAM_TS_STRIP_RE.test(line.trim()),
      `heartbeat chunk produced a stream.ts-strippable line: ${line}`
    );
  }

  await reader.cancel();
});

test("integration: openai-chunk heartbeat is valid JSON parseable by SDKs", async () => {
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[]}\n\n`
        )
      );
    },
  });

  const transform = createSseHeartbeatTransform({
    intervalMs: 20,
    shape: HEARTBEAT_SHAPES.OPENAI_CHUNK,
  });

  const piped = upstream.pipeThrough(transform);
  const reader = piped.getReader();

  await reader.read(); // skip first real chunk

  const { value, done } = await readWithTimeout(reader);
  assert.equal(done, false);
  const chunk = decodeChunk(value);
  assert.match(chunk, /^data: /);
  assert.match(chunk, /omniroute-keepalive/);
  const jsonStr = chunk.slice(6, chunk.indexOf("\n\n"));
  const parsed = JSON.parse(jsonStr); // must not throw
  assert.equal(parsed.object, "chat.completion.chunk");
  assert.equal(parsed.choices[0].finish_reason, null);

  await reader.cancel();
});

test("integration: shapeForClientFormat + createSseHeartbeatTransform pipeline (claude path)", async () => {
  // Simulates what chatCore.ts does at line 4276
  const shape = shapeForClientFormat("claude");
  assert.equal(shape, HEARTBEAT_SHAPES.ANTHROPIC_PING);

  const transform = createSseHeartbeatTransform({
    intervalMs: 20,
    shape,
  });

  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: hello\ndata: {}\n\n"));
    },
  });

  const reader = upstream.pipeThrough(transform).getReader();
  await reader.read(); // first real
  const { value } = await readWithTimeout(reader);
  assert.match(decodeChunk(value), /^event: ping\ndata: \{\}\n\n$/);
  await reader.cancel();
});
