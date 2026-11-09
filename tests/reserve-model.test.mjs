import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const js = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = value => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const notion = url(js(readFileSync(new URL("../app/notion-finance-model.ts", import.meta.url), "utf8")));
const { mapReserves, reservedForAccount, reserveHistory } = await import(url(js(readFileSync(new URL("../app/reserve-model.ts", import.meta.url), "utf8").replace('"./notion-finance-model"', JSON.stringify(notion)))));
const n = number => ({ number }), s = name => ({ select: { name } }), f = number => ({ formula: { number } }), rel = id => ({ relation: [{ id }] });
const page = (id, properties) => ({ id, url: `https://example.test/${id}`, properties });
const base = { "Цель": s("ЖКХ"), "Счет": rel("cash", "RSD"), "Валюта": s("RSD"), "Вид": s("Пополняемый резерв"), "В резерве": f(15000), "Оплачено из резерва": { rollup: { number: 12000 } } };

test("rolling reserve has a real balance with no target and no fabricated percent", () => {
  const [goal] = mapReserves([page("utilities", base)], new Map([["cash", "Общие наличные"]]));
  assert.equal(goal.saved, 15000);
  assert.equal(goal.spent, 12000);
  assert.equal(goal.target, null);
  assert.equal(goal.progress, null);
  assert.equal(goal.account, "Общие наличные");
  assert.equal(reservedForAccount([goal], "cash", "RSD"), 15000);
  assert.equal(reservedForAccount([goal], "another-account", "RSD"), 0);
});
test("unknown formulas stay unknown, archives retain earmarked cash, currencies stay separate", () => {
  const goals = mapReserves([
    page("utilities", base),
    page("unknown", { ...base, "В резерве": { formula: {} } }),
    page("eur", { ...base, "Счет": rel("euros", "EUR"), "Валюта": s("EUR"), "В резерве": f(200) }),
    page("archive", { ...base, "Счет": rel("old-account", "RSD"), "Архив": { checkbox: true }, "В резерве": f(1000) }),
  ], new Map());
  assert.equal(reservedForAccount(goals, "cash", "RSD"), null);
  assert.equal(reservedForAccount(goals, "euros", "EUR"), 200);
  assert.equal(reservedForAccount(goals, "old-account", "RSD"), 1000);
  assert.equal(goals.at(-1).archived, true);
});
test("history spans months, includes partial and pending payments, and never duplicates the expense", () => {
  const goals = mapReserves([page("utilities", base)], new Map());
  const movements = [page("allocate", { "Резерв": rel("utilities"), "Тип": s("Пополнение"), "Сумма": n(20000), "Дата": { date: { start: "2026-09-01" } } }), page("release", { "Резерв": rel("utilities"), "Тип": s("Снятие резервирования"), "Сумма": n(3000), "Дата": { date: { start: "2026-10-01" } } })];
  const payment = (id, status) => page(id, { "Резерв": rel("utilities"), "Тип": s("Расход"), "Из резерва": n(5000), "Сумма списания": n(12000), "Статус разбора": s(status), "Дата": { date: { start: "2026-10-15" } } });
  const events = reserveHistory(movements, [payment("paid", "Готово"), payment("pending", "Нужна проверка"), page("transfer", { "Тип": s("Перевод"), "Резерв": rel("utilities"), "Из резерва": n(9999) })], goals);
  assert.equal(events.length, 4);
  assert.equal(events.at(-1).date, "2026-09-01");
  assert.equal(events.find(event => event.id === "paid").amount, 5000);
  assert.equal(events.find(event => event.id === "pending").type, "Ожидает проверки");
  assert.equal(events.filter(event => event.type === "Оплата").length, 1);
});

test("a mismatched reserve currency on the same account cannot reduce its available balance", () => {
  const goals = mapReserves([page("utilities", base), page("mismatch", { ...base, "Валюта": s("EUR"), "В резерве": f(200) })], new Map());
  assert.equal(reservedForAccount(goals, "cash", "RSD"), null);
});
