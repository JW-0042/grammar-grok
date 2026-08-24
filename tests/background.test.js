const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  path.join(__dirname, "..", "background.js"),
  "utf8"
);

function validModelResponse(corrected = "hello") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "sk",
              languageName: "Slovak",
              hasChanges: true,
              corrected,
              issues: [],
              summary: "Translated from Slovak.",
            }),
          },
        },
      ],
    }),
  };
}

function loadBackground(fetchImpl) {
  let listener = null;
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch: fetchImpl,
    setTimeout,
    chrome: {
      runtime: {
        id: "grammar-grok-test",
        onMessage: {
          addListener(fn) {
            listener = fn;
          },
        },
      },
      storage: {
        local: {
          async get() {
            return {
              apiKey: "xai-123456789012345",
              model: "grok-4.20-0309-non-reasoning",
            };
          },
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(backgroundSource, context, { filename: "background.js" });
  assert.equal(typeof listener, "function");
  return { context, listener };
}

function send(listener, message, sender = {}) {
  return new Promise((resolve) => {
    listener(
      message,
      {
        id: "grammar-grok-test",
        tab: { id: 1 },
        frameId: 0,
        ...sender,
      },
      resolve
    );
  });
}

test("translate preserves selected boundary whitespace and requests JSON", async () => {
  let requestBody = null;
  const { listener } = loadBackground(async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return validModelResponse("hello");
  });

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "translate",
    text: "  ahoj \n",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.corrected, "  hello \n");
  assert.equal(result.data.mode, "translate");
  assert.equal(requestBody.messages[1].content, "ahoj");
  assert.equal(requestBody.max_tokens, 16384);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
});

test("invalid model JSON is returned as an error, not Already English data", async () => {
  const { listener } = loadBackground(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: "{not complete" } }],
    }),
  }));

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "translate",
    text: "ahoj",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /incomplete or invalid/i);
  assert.equal(result.data, undefined);
});

test("an empty corrected field is rejected instead of deleting the selection", async () => {
  const { listener } = loadBackground(async () => validModelResponse(""));

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "translate",
    text: "ahoj",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /without usable corrected text/i);
});

test("translation uses a larger safe result limit without silent truncation", () => {
  const { context } = loadBackground(async () => validModelResponse());
  const corrected = "x".repeat(13000);
  const content = JSON.stringify({
    language: "ja",
    languageName: "Japanese",
    hasChanges: true,
    corrected,
    issues: [],
    summary: "Translated from Japanese.",
  });

  const translated = context.parseJsonResponse(content, "source", "translate");
  assert.equal(translated.parseError, undefined);
  assert.equal(translated.corrected.length, 13000);

  const grammar = context.parseJsonResponse(content, "source", "grammar");
  assert.match(grammar.parseError, /too long/i);
});

test("a check in another tab does not abort the first tab", async () => {
  const pending = [];
  const { listener } = loadBackground((_url, options) => {
    return new Promise((resolve) => {
      pending.push({ resolve, signal: options.signal });
    });
  });

  const first = send(
    listener,
    { type: "CHECK_TEXT", mode: "grammar", text: "first" },
    { tab: { id: 1 }, frameId: 0 }
  );
  const second = send(
    listener,
    { type: "CHECK_TEXT", mode: "grammar", text: "second" },
    { tab: { id: 2 }, frameId: 0 }
  );

  const deadline = Date.now() + 1500;
  while (pending.length < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.equal(pending.length, 2);
  assert.equal(pending[0].signal.aborted, false);
  pending[0].resolve(validModelResponse("first fixed"));
  pending[1].resolve(validModelResponse("second fixed"));

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
});
