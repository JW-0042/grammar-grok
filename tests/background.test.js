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
  let connectListener = null;
  const context = {
    AbortController,
    TextDecoder,
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
        onConnect: {
          addListener(fn) {
            connectListener = fn;
          },
        },
        getURL(path = "") {
          return `chrome-extension://grammar-grok-test/${path}`;
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
  return { context, listener, connect: (...args) => connectListener(...args) };
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
  assert.equal(requestBody.model, "grok-4.20-0309-non-reasoning");
  assert.equal(requestBody.reasoning_effort, undefined);
});

test("grok-4.5, grok-4.6, and grok-4.7 request low reasoning effort", async () => {
  const seen = [];
  const { listener } = loadBackground(async (_url, options) => {
    seen.push(JSON.parse(options.body));
    return validModelResponse("fixed");
  });

  for (const model of ["grok-4.5", "grok-4.6", "grok-4.7"]) {
    const result = await send(listener, {
      type: "CHECK_TEXT",
      mode: "grammar",
      text: "ahoj",
      model,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.model, model);
  }

  assert.deepEqual(
    seen.map((body) => ({ model: body.model, reasoning_effort: body.reasoning_effort })),
    [
      { model: "grok-4.5", reasoning_effort: "low" },
      { model: "grok-4.6", reasoning_effort: "low" },
      { model: "grok-4.7", reasoning_effort: "low" },
    ]
  );
});

test("grok-4.7-fast is not sent to the API", async () => {
  let requestBody = null;
  const { listener } = loadBackground(async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return validModelResponse("fixed");
  });

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "grammar",
    text: "ahoj",
    model: "grok-4.7-fast",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.model, "grok-4.5");
  assert.equal(requestBody.model, "grok-4.5");
  assert.equal(requestBody.reasoning_effort, "low");
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


function modelResponse(fields) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "en",
              languageName: "English",
              hasChanges: true,
              issues: [],
              summary: "Fixed.",
              ...fields,
            }),
          },
        },
      ],
    }),
  };
}

async function waitFor(predicate, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("every mode asks for plain human writing without em dashes or semicolons", async () => {
  const prompts = {};
  const { listener } = loadBackground(async (_url, options) => {
    const body = JSON.parse(options.body);
    prompts[body.messages[1].content] = body.messages[0].content;
    return validModelResponse("hello");
  });

  for (const mode of ["grammar", "style", "translate"]) {
    const result = await send(listener, { type: "CHECK_TEXT", mode, text: mode });
    assert.equal(result.ok, true);
  }

  for (const mode of ["grammar", "style", "translate"]) {
    const prompt = prompts[mode];
    assert.match(prompt, /Avoid stereotypical AI wording/);
    assert.match(prompt, /common everyday, conversational words/);
    assert.match(prompt, /Never introduce a word, phrase, or construction that is more complex/);
    assert.match(prompt, /do not use em dashes \(U\+2014\) or semicolons/);
    assert.match(prompt, /Preserve literal code, URLs, and verbatim quotations/);
    assert.match(prompt, /Do not add characters the original does not use/);
  }
  assert.match(prompts.grammar, /GRAMMAR ONLY/);
  assert.match(prompts.grammar, /beyond the shared wording and punctuation requirements/);
  assert.match(prompts.grammar, /already satisfies all correction and wording rules/);
  assert.match(prompts.style, /never fancier/);
});

test("text check fixes added typography but keeps the author's own", () => {
  const { context } = loadBackground(async () => validModelResponse());

  const added = context.reviewText(
    "Don’t say “hi”… ok – fine now​ **bold**",
    "dont say \"hi\"... ok - fine now bold"
  );
  assert.equal(added.text, "Don't say \"hi\"... ok - fine now bold");
  assert.equal(added.problems.length, 0);
  assert.ok(added.fixed.includes("typographic quotes replaced"));
  assert.ok(added.fixed.includes("invisible characters removed"));

  const slovak = context.reviewText(
    "Povedal „ahoj“.",
    "povedal „ahoj“",
    "grammar",
    "sk"
  );
  assert.equal(slovak.text, "Povedal „ahoj“.");
  assert.equal(slovak.fixed.length, 0);
});

test("text check flags em dashes, semicolons, symbols and added stock phrases", () => {
  const { context } = loadBackground(async () => validModelResponse());

  const review = context.reviewText(
    "Furthermore, we leverage tools — fast; done ✅",
    "we use tools, fast, done"
  );
  const ids = review.problems.map((p) => p.id);
  assert.deepEqual([...ids], ["em-dash", "semicolon", "symbols", "phrases"]);
  const phrases = review.problems.find((p) => p.id === "phrases").samples;
  assert.ok(phrases.includes("furthermore"));
  assert.ok(phrases.includes("leverage"));

  // The author's own wording may stay.
  const own = context.reviewText("Furthermore, it works.", "furthermore it works");
  assert.equal(own.problems.length, 0);

  // Slovak inflected stock phrase.
  const sk = context.reviewText(
    "To zohráva kľúčovú úlohu prostredníctvom aplikácie.",
    "To ma dolezitu ulohu cez aplikaciu.",
    "style",
    "sk"
  );
  assert.ok(sk.problems.find((p) => p.id === "phrases"));

  // Translation results are not checked for stock phrases (the original is another language).
  const translated = context.reviewText("Furthermore, it works.", "Navyše to funguje.", "translate");
  assert.equal(translated.problems.length, 0);

  // Code, URLs and Greek question marks are not touched.
  const code = context.reviewText(
    "Run `a; b — c` at https://x.test/a;b",
    "run `a; b — c` at https://x.test/a;b"
  );
  assert.equal(code.problems.length, 0);
  const greek = context.reviewText(
    "Τι κάνεις;",
    "τι κανεις;",
    "grammar",
    "el"
  );
  assert.equal(greek.problems.length, 0);
});

test("punctuation fallback removes em dashes and semicolons from prose only", () => {
  const { context } = loadBackground(async () => validModelResponse());
  const out = context.applyPunctuationFallback(
    "It works — mostly; we tested it.\n— Yes, done. `a;b`",
    "en"
  );
  assert.equal(out.text, "It works, mostly. We tested it.\n- Yes, done. `a;b`");
  assert.deepEqual([...out.fixed], ["em dashes replaced", "semicolons replaced"]);
});

test("a result with AI tells gets one repair request", async () => {
  const bodies = [];
  const { listener } = loadBackground(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length === 1
      ? modelResponse({ corrected: "Furthermore, it works — mostly." })
      : modelResponse({ corrected: "Also, it works, mostly." });
  });

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "style",
    text: "also it works mostly",
  });

  assert.equal(result.ok, true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].messages.length, 4);
  assert.equal(bodies[1].messages[2].role, "assistant");
  assert.match(bodies[1].messages[3].content, /em dashes/);
  assert.match(bodies[1].messages[3].content, /"furthermore"/);
  assert.equal(result.data.corrected, "Also, it works, mostly.");
  assert.equal(result.data.textCheck.repaired, true);
  assert.equal(result.data.textCheck.remaining.length, 0);
});

test("if the repair still has em dashes, the fallback removes them", async () => {
  let calls = 0;
  const { listener } = loadBackground(async () => {
    calls += 1;
    return modelResponse({ corrected: "It works — mostly." });
  });

  const result = await send(listener, {
    type: "CHECK_TEXT",
    mode: "grammar",
    text: "it works mostly",
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.data.corrected, "It works, mostly.");
  assert.ok(result.data.textCheck.autoFixed.includes("em dashes replaced"));
  assert.equal(result.data.textCheck.remaining.length, 0);
});

test("a clean result needs only one request", async () => {
  let calls = 0;
  const { listener } = loadBackground(async () => {
    calls += 1;
    return modelResponse({ corrected: "It works." });
  });
  const result = await send(listener, { type: "CHECK_TEXT", mode: "grammar", text: "it works" });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(result.data.textCheck.repaired, false);
  assert.equal(result.data.textCheck.autoFixed.length, 0);
  assert.equal(result.data.textCheck.remaining.length, 0);
});

test("partial JSON string extraction handles unfinished escapes", () => {
  const { context } = loadBackground(async () => validModelResponse());
  assert.equal(context.extractPartialJsonString('{"language":"en"', "corrected"), null);
  assert.equal(context.extractPartialJsonString('{"corrected": "Hel', "corrected"), "Hel");
  assert.equal(
    context.extractPartialJsonString('{"corrected":"a\\nb\\"c\\u00e1\\', "corrected"),
    'a\nb"cá'
  );
  assert.equal(context.extractPartialJsonString('{"corrected":"done","x":1', "corrected"), "done");
});

function sseResponse(content) {
  const chunks = [];
  for (let i = 0; i < content.length; i += 7) {
    chunks.push(
      `data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 7) } }] })}\n\n`
    );
  }
  chunks.push("data: [DONE]\n\n");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function makePort(sender) {
  const port = {
    name: "gg-check-stream",
    sender,
    sent: [],
    messageListeners: [],
    disconnectListeners: [],
    onMessage: { addListener: (fn) => port.messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => port.disconnectListeners.push(fn) },
    postMessage: (msg) => port.sent.push(msg),
    disconnect() {},
  };
  return port;
}

test("streaming port sends previews and a final result", async () => {
  let requestBody = null;
  const { connect } = loadBackground(async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return sseResponse(
      JSON.stringify({
        language: "en",
        languageName: "English",
        hasChanges: true,
        corrected: "Hello there, friend.",
        issues: [],
        summary: "Fixed.",
      })
    );
  });

  const port = makePort({ id: "grammar-grok-test", tab: { id: 3 }, frameId: 0 });
  connect(port);
  port.messageListeners[0]({ type: "CHECK_TEXT", mode: "grammar", text: "hello there friend" });
  await waitFor(() => port.sent.some((m) => m.type === "result"));

  assert.equal(requestBody.stream, true);
  const previews = port.sent.filter((m) => m.type === "preview");
  assert.ok(previews.length >= 1);
  assert.equal(previews.at(-1).text, "Hello there, friend.");
  const final = port.sent.find((m) => m.type === "result");
  assert.equal(final.res.ok, true);
  assert.equal(final.res.data.corrected, "Hello there, friend.");
});

test("a rejected stream request is retried without streaming", async () => {
  const bodies = [];
  const { connect } = loadBackground(async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.stream) {
      return { ok: false, status: 400, headers: new Headers(), json: async () => ({ error: "no stream" }) };
    }
    return modelResponse({ corrected: "Fine." });
  });

  const port = makePort({ id: "grammar-grok-test", tab: { id: 5 }, frameId: 0 });
  connect(port);
  port.messageListeners[0]({ type: "CHECK_TEXT", mode: "grammar", text: "fine" });
  await waitFor(() => port.sent.some((m) => m.type === "result"));

  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[1].stream, undefined);
  assert.equal(port.sent.find((m) => m.type === "result").res.data.corrected, "Fine.");
});

test("closing the streaming port aborts the request", async () => {
  let signal = null;
  const { connect } = loadBackground((_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const port = makePort({ id: "grammar-grok-test", tab: { id: 4 }, frameId: 0 });
  connect(port);
  port.messageListeners[0]({ type: "CHECK_TEXT", mode: "grammar", text: "hello there" });
  await waitFor(() => Boolean(signal), 1500);

  assert.ok(signal);
  port.disconnectListeners[0]();
  assert.equal(signal.aborted, true);
});

test("ports and key tests from untrusted contexts are refused", async () => {
  const { listener, connect } = loadBackground(async () => validModelResponse());

  let disconnected = false;
  const foreign = makePort({ id: "other-extension", tab: { id: 1 } });
  foreign.disconnect = () => {
    disconnected = true;
  };
  connect(foreign);
  assert.equal(disconnected, true);
  assert.equal(foreign.messageListeners.length, 0);

  const fromPage = await send(listener, { type: "TEST_KEY" });
  assert.equal(fromPage.ok, false);
  assert.match(fromPage.error, /unauthorized/i);
});
