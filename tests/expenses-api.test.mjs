import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const transpile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const modelUrl = moduleUrl(transpile(readFileSync(new URL("../app/expense-model.ts", import.meta.url), "utf8")));
const notionModelUrl = moduleUrl(transpile(readFileSync(new URL("../app/notion-finance-model.ts", import.meta.url), "utf8")));
let source = readFileSync(new URL("../app/api/expenses/route.ts", import.meta.url), "utf8")
  .replace('import { NextResponse } from "next/server";', 'const NextResponse = { json: (body, init) => Response.json(body, init) };')
  .replace('import { isEmailAllowed } from "../../access-control";', 'const isEmailAllowed = () => globalThis.expenseTestAllowed;')
  .replace('import { getChatGPTUser } from "../../chatgpt-auth";', 'const getChatGPTUser = async () => globalThis.expenseTestUser;')
  .replace('"../../expense-model"', JSON.stringify(modelUrl))
  .replace('"../../notion-finance-model"', JSON.stringify(notionModelUrl));
const { GET } = await import(moduleUrl(transpile(source)));
const pageRow = i => ({ id: String(i), properties: { "Тип": { select: { name: "Расход" } }, "Дата": { date: { start: "2026-08-05" } }, "Сумма списания": { number: 1 }, "Валюта списания": { select: { name: "RSD" } }, "Категория": { select: { name: "Продукты" } } } });

test("expense endpoint authorization, complete pagination and fail-closed errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = "test-only-placeholder";
  try {
    const request = new Request("https://example.test/api/expenses?month=2026-08");
    globalThis.expenseTestUser = null;
    assert.equal((await GET(request)).status, 401);
    globalThis.expenseTestUser = { email: "fixture@example.test" };
    globalThis.expenseTestAllowed = false;
    assert.equal((await GET(request)).status, 403);
    globalThis.expenseTestAllowed = true;
    assert.equal((await GET(new Request("https://example.test/api/expenses?month=2026-99"))).status, 400);
    let calls = 0;
    const merchantRow = pageRow(0);
    merchantRow.properties["Магазин или получатель"] = { rich_text: [{ plain_text: "Univerexport " }, { text: { content: "MP142" } }] };
    merchantRow.properties["Операция"] = { title: [{ plain_text: "Продукты" }] };
    globalThis.fetch = async (_, options) => {
      const body = JSON.parse(options.body);
      calls++;
      if (calls <= 2) assert.equal(body.filter.and[0].select.equals, "Расход");
      if (calls === 1) return Response.json({ results: Array.from({ length: 100 }, (_, i) => i === 0 ? merchantRow : pageRow(i)), has_more: true, next_cursor: "next-page" });
      if (calls === 2) {
        assert.equal(body.start_cursor, "next-page");
        return Response.json({ results: Array.from({ length: 73 }, (_, i) => pageRow(i + 100)), has_more: false, next_cursor: null });
      }
      assert.equal(body.page_size, 100);
      return Response.json({ results: [], has_more: false, next_cursor: null });
    };
    const success = await GET(request);
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "private, no-store");
    const result = await success.json();
    assert.equal(result.currencies[0].total, 173);
    assert.deepEqual(result.currencies[0].merchants.find(x => x.name === "Univerexport"), { name: "Univerexport", amount: 1, count: 1 });
    assert.equal(result.currencies[0].largest.find(x => x.id === "0").title, "Продукты");
    assert.equal(result.currencies[0].days.at(-1).cumulative, 173);
    assert.equal(calls, 3);
    calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? Response.json({ results: [pageRow(0)], has_more: true, next_cursor: "next" }) : new Response("Unavailable", { status: 503 });
    assert.equal((await GET(request)).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = originalToken;
    delete globalThis.expenseTestUser;
    delete globalThis.expenseTestAllowed;
  }
});
