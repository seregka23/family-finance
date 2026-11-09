import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/notion-finance-model.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { categoryFor, categoryKey, categoryMap, propertyText, sectionLabel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const text = value => ({ title: [{ plain_text: value.slice(0, 2) }, { text: { content: value.slice(2) } }] });

test("new category relations are authoritative with legacy fallback", () => {
  const categories = categoryMap([{ id: "cat-1", url: "https://notion.test/cat-1", properties: {
    Name: text("Продукты"), Type: { select: { name: "Expense" } }, Section: { select: { name: "Flexible" } },
    "Planning Mode": { select: { name: "Monthly limit" } }, Active: { checkbox: true }, "Include in Reports": { checkbox: false },
  } }]);
  const modern = categoryFor({ Category: { relation: [{ id: "cat-1" }] }, "Категория": { select: { name: "Старое значение" } } }, categories);
  assert.equal(modern.name, "Продукты");
  assert.equal(modern.meta.includeInReports, false);
  assert.equal(modern.meta.planningMode, "Monthly limit");
  assert.equal(categoryFor({ "Категория": { select: { name: "Кафе" } } }, categories).name, "Кафе");
  assert.equal(categoryFor({}, categories).name, "Прочее");
});

test("text fragments, category keys and section labels remain stable", () => {
  assert.equal(propertyText(text("Здоровье")), "Здоровье");
  assert.equal(categoryKey("id", "Name"), "id:id");
  assert.equal(categoryKey("", "Прочее"), "name:прочее");
  assert.equal(sectionLabel("Mandatory"), "Обязательные расходы");
  assert.equal(sectionLabel("Unknown"), "Unknown");
});
