// Dashboard contract: one Notion expense per id, debit amount in its own
// currency, calendar days in Europe/Belgrade. No FX conversion or netting income.
// Daily bars answer when spending happened; ranked category bars answer where.
// Both share one zero-based, integer-minor-unit model and exact amount labels.
export type ExpenseRow = { id: string; date: string; amount: number | null; currency: string; category: string; review: boolean; merchant?: string; title?: string; includeInReports?: boolean };
type RankedExpense = { id: string; date: string; amount: number; merchant: string; title: string; category: string };
export type ExpenseBucket = { currency: string; total: number; count: number; review: number; categories: { name: string; amount: number; count: number }[]; merchants: { name: string; amount: number; count: number }[]; largest: RankedExpense[]; days: { date: string; amount: number; count: number; cumulative: number }[] };
export type ExpenseDashboardData = { month: string; through: string; updatedAt: string; excluded: number; omittedByCategory: number; currencies: ExpenseBucket[] };

// Only verified bank-descriptor aliases are grouped by chain. Do not strip
// arbitrary digits/words from unknown payees or infer merchants from categories.
export function merchantName(value = "") {
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name) return "Не указан";
  const aliases: [RegExp, string][] = [
    [/^univerexport(?:\s|$)/i, "Univerexport"],
    [/^(?:213\s*-\s*)?maxi(?:\s|$)/i, "Maxi"],
    [/^lidl(?:\s|$)/i, "Lidl"],
    [/^wolt(?:\s+doo(?:\s|$)|$)/i, "Wolt"],
    [/^rsoft online(?:\s|$)/i, "RSOFT Online"],
    [/^yandex go(?:\s+\d+(?:\s+RS)?|\s+RS)?$/i, "Yandex Go"],
  ];
  return aliases.find(([pattern]) => pattern.test(name))?.[1] ?? name;
}

export function belgradeDay(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function monthBounds(month: string) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const [year, number] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10), next: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) };
}

export function aggregateExpenses(rows: ExpenseRow[], month: string, now = new Date()): ExpenseDashboardData {
  const { from, to } = monthBounds(month);
  const today = belgradeDay(now);
  const through = today < to ? today : to;
  const dates: string[] = [];
  for (let day = 1; day <= Number(to.slice(-2)); day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date <= through) dates.push(date);
  }
  const buckets = new Map<string, ExpenseBucket>();
  const seen = new Set<string>();
  let excluded = 0;
  let omittedByCategory = 0;
  for (const row of rows) {
    const date = belgradeDay(row.date);
    if (!date || date < from || date > through || seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.includeInReports === false) { omittedByCategory++; continue; }
    if (row.amount === null || !Number.isFinite(row.amount) || row.amount < 0) { excluded++; continue; }
    const currency = row.currency || "Без валюты";
    const bucket = buckets.get(currency) ?? { currency, total: 0, count: 0, review: 0, categories: [], merchants: [], largest: [], days: dates.map(date => ({ date, amount: 0, count: 0, cumulative: 0 })) };
    // Keep cents throughout aggregation to avoid floating-point drift.
    const amount = Math.round(row.amount * 100);
    bucket.total += amount;
    bucket.count++;
    if (row.review) bucket.review++;
    const name = row.category || "Без категории";
    let category = bucket.categories.find(item => item.name === name);
    if (!category) { category = { name, amount: 0, count: 0 }; bucket.categories.push(category); }
    category.amount += amount;
    category.count++;
    const storeName = merchantName(row.merchant);
    let merchant = bucket.merchants.find(item => item.name.toLocaleLowerCase("ru") === storeName.toLocaleLowerCase("ru"));
    if (!merchant) { merchant = { name: storeName, amount: 0, count: 0 }; bucket.merchants.push(merchant); }
    merchant.amount += amount;
    merchant.count++;
    bucket.largest.push({ id: row.id, date, amount, merchant: row.merchant?.trim() || "Не указан", title: row.title?.trim() || "Расход", category: name });
    const day = bucket.days.find(item => item.date === date)!;
    day.amount += amount;
    day.count++;
    buckets.set(currency, bucket);
  }
  const order = ["RSD", "EUR", "RUB", "USD"];
  const currencies = [...buckets.values()].sort((a, b) => (order.indexOf(a.currency) < 0 ? 4 : order.indexOf(a.currency)) - (order.indexOf(b.currency) < 0 ? 4 : order.indexOf(b.currency)) || a.currency.localeCompare(b.currency));
  for (const bucket of currencies) {
    bucket.total /= 100;
    bucket.categories.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ru"));
    bucket.categories.forEach(item => { item.amount /= 100; });
    bucket.merchants.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ru"));
    bucket.merchants.forEach(item => { item.amount /= 100; });
    bucket.largest.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    bucket.largest = bucket.largest.slice(0, 10).map(item => ({ ...item, amount: item.amount / 100 }));
    let cumulative = 0;
    bucket.days.forEach(item => { cumulative += item.amount; item.cumulative = cumulative / 100; item.amount /= 100; });
  }
  return { month, through, updatedAt: now.toISOString(), excluded, omittedByCategory, currencies };
}
