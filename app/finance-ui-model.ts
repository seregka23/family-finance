export type PeriodPreset = "day" | "week" | "month" | "halfYear" | "year";
export type DateRange = { from: string; to: string };
const timeZone = "Europe/Belgrade";

export function operationDay(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validPeriod({ from, to }: DateRange) {
  return validDate(from) && validDate(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 366;
}

export function currentMonthStart(now = new Date()) { return operationDay(now).slice(0, 7) + "-01"; }

export function periodBounds(preset: PeriodPreset, now = new Date()): DateRange {
  const today = operationDay(now);
  const date = new Date(`${today}T12:00:00Z`);
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  if (preset === "day") return { from: today, to: today };
  if (preset === "week") {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1);
    const from = iso(date);
    date.setUTCDate(date.getUTCDate() + 6);
    return { from, to: iso(date) };
  }
  if (preset === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  return { from: iso(new Date(Date.UTC(year, month - (preset === "halfYear" ? 5 : 0), 1))), to: iso(new Date(Date.UTC(year, month + 1, 0))) };
}

export function operationDate(value: string) {
  const day = operationDay(value);
  if (!day) return "Дата не указана";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
}

export function countLabel(count: number, forms: [string, string, string]) {
  const mod100 = count % 100, mod10 = count % 10;
  return `${count} ${forms[mod100 >= 11 && mod100 <= 14 ? 2 : mod10 === 1 ? 0 : mod10 >= 2 && mod10 <= 4 ? 1 : 2]}`;
}

export function accountActivity<T extends { account: string; currency: string; amount: number; operationType: string }>(items: T[], account: string, currency: string) {
  return items.filter(item => item.account === account && item.currency === currency).reduce((total, item) => {
    total[item.operationType === "Доход" ? "income" : "expense"] += item.amount;
    return total;
  }, { income: 0, expense: 0 });
}
