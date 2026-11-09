import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const transpile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = value => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const importModule = file => moduleUrl(transpile(readFileSync(new URL(file, import.meta.url), "utf8")));
const notionUrl = importModule("../app/notion-finance-model.ts");
const reserveUrl = moduleUrl(transpile(readFileSync(new URL("../app/reserve-model.ts", import.meta.url), "utf8").replace('"./notion-finance-model"', JSON.stringify(notionUrl))));
const src = readFileSync(new URL("../app/api/operations/route.ts", import.meta.url), "utf8")
  .replace('import { NextResponse } from "next/server";', 'const NextResponse = { json: (body, init) => Response.json(body, init) };')
  .replace('import { accountOwnerForEmail, isEmailAllowed } from "../../access-control";', 'const isEmailAllowed = () => globalThis.operationAllowed; const accountOwnerForEmail = () => "Муж";')
  .replace('import { getChatGPTUser } from "../../chatgpt-auth";', 'const getChatGPTUser = async () => globalThis.operationUser;')
  .replace('"../../finance-ui-model"', JSON.stringify(importModule("../app/finance-ui-model.ts")))
  .replace('"../../reserve-model"', JSON.stringify(reserveUrl))
  .replace('"../../notion-finance-model"', JSON.stringify(importModule("../app/notion-finance-model.ts")));
const { GET } = await import(moduleUrl(transpile(src)));
const text = value => ({ select: { name: value } });
const row = index => ({ id: `row-${index}`, url: "https://example.test", properties: { "Тип": text(index === 1 ? "Доход" : "Расход"), "Дата": { date: { start: "2026-08-05T23:30:00Z" } }, "Операция": text("Fixture"), "Сумма списания": { number: 10 }, "Сумма зачисления": { number: 100 }, "Валюта списания": text("RSD"), "Валюта зачисления": text("EUR") } });

test("operations: authorization, full pagination, limits, optional failures and private responses", async () => {
  const originalFetch = globalThis.fetch, token = process.env.NOTION_TOKEN, originalError = console.error;
  process.env.NOTION_TOKEN = "test-only";
  const request = new Request("https://example.test/api/operations?from=2026-08-01&to=2026-08-31&month=2026-08-01");
  try {
    globalThis.operationUser = null;
    assert.equal((await GET(request)).status, 401);
    globalThis.operationUser = { email: "fixture@example.test" };
    globalThis.operationAllowed = false;
    assert.equal((await GET(request)).status, 403);
    globalThis.operationAllowed = true;
    for (const query of ["from=&to=2026-08-31", "from=2026-08-31&to=2026-08-01", "month=2026-13-01"]) assert.equal((await GET(new Request(`https://example.test/api/operations?${query}`))).status, 400);
    let mainCalls = 0, receiptCalls = 0;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.sorts) {
        mainCalls++;
        assert.equal(body.filter.and.length, 2);
        return Response.json(body.start_cursor ? { results: [row(100)], has_more: false } : { results: Array.from({ length: 100 }, (_, i) => row(i)), has_more: true, next_cursor: "cursor-2" });
      }
      if (String(url).includes("db5f05fe")) { receiptCalls++; assert.ok(body.filter.or.length <= 100); }
      if (String(url).includes("0e6a8ec5")) return new Response("Temporary plan failure", { status: 503 });
      return Response.json({ results: [], has_more: false });
    };
    const response = await GET(request), data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(data.operations.length, 101);
    assert.equal(data.operations[1].operationType, "Доход");
    assert.equal(data.operations[1].amount, 100);
    assert.equal(data.operations[1].currency, "EUR");
    assert.equal(data.operations[0].time, "01:30");
    assert.equal(data.monthlyPlan.unavailable, true);
    assert.equal(mainCalls, 2);
    assert.equal(receiptCalls, 2);
    globalThis.fetch = async () => Response.json({ results: [row(0)], has_more: true, next_cursor: "same-cursor" });
    console.error = () => {};
    assert.equal((await GET(request)).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (token === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = token;
    delete globalThis.operationUser; delete globalThis.operationAllowed;
  }
});
