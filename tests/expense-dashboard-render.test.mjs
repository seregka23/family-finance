import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const transpile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const modelUrl = moduleUrl(transpile(readFileSync(new URL("../app/expense-model.ts", import.meta.url), "utf8")));
const { aggregateExpenses } = await import(modelUrl);
const source = readFileSync(new URL("../app/expenses-dashboard.tsx", import.meta.url), "utf8")
  .replace('import { useEffect, useState } from "react";', 'const useEffect = () => {}; const useState = () => [globalThis.expenseRenderStates.shift(), () => {}];')
  .replace('"./expense-model"', JSON.stringify(modelUrl));
const js = transpile(source).replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const { default: Dashboard } = await import(moduleUrl(js));

test("ready dashboard renders merchant ranks, largest records and both chart modes", () => {
  const data = aggregateExpenses(Array.from({ length: 12 }, (_, i) => ({ id: String(i), date: "2026-08-05", amount: i + 1, currency: "RSD", category: "Продукты", merchant: `Shop ${i}`, title: i === 11 ? "<script>alert(1)</script>" : `Purchase ${i}`, review: false })), "2026-08", new Date("2026-09-05"));
  try {
    for (const chart of ["daily", "cumulative"]) {
      globalThis.expenseRenderStates = ["2026-08", "RSD", data, "ready", 0, null, chart, "amount", false];
      const html = renderToStaticMarkup(Dashboard());
      assert.match(html, /Магазины и получатели/);
      assert.match(html, /Показать все \(12\)/);
      assert.match(html, /Крупнейшие расходы месяца/);
      assert.match(html, /средняя сумма/);
      assert.match(html, chart === "daily" ? /Расходы по дням/ : /Расходы нарастающим итогом/);
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script>alert|NaN|Infinity/);
      assert.equal((html.match(/class="expense-rank"/g) ?? []).length, 10);
    }
  } finally { delete globalThis.expenseRenderStates; }
});
