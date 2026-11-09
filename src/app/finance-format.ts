import type { Operation } from './finance-types';
export const notionOperations = 'https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7';
export const notionPlan = 'https://app.notion.com/p/56f21d527b044920a7b513902c777b48';
export const notionReceiptItems = 'https://app.notion.com/p/b0d2c33e97fc4735bde63018a7789a64';
export const notionGoals = 'https://app.notion.com/p/6f5e3d2ff27f4e4792ca9989dbce0632';
export function money(value: number | null, currency = 'RSD') {
  if (value === null) return 'Нет данных';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}
export function groupedMoney(items: Operation[]) {
  const totals = items.reduce<Record<string, number>>((result, item) => {
    result[item.currency] = (result[item.currency] ?? 0) + item.amount;
    return result;
  }, {});
  return (
    Object.entries(totals)
      .map(([currency, amount]) => money(amount, currency))
      .join(' · ') || money(0)
  );
}
export function groupedAverage(items: Operation[]) {
  const totals = items.reduce<Record<string, { amount: number; count: number }>>((result, item) => {
    result[item.currency] ??= { amount: 0, count: 0 };
    result[item.currency].amount += item.amount;
    result[item.currency].count += 1;
    return result;
  }, {});
  return (
    Object.entries(totals)
      .map(([currency, total]) => money(total.count ? total.amount / total.count : 0, currency))
      .join(' · ') || money(0)
  );
}
export function monthName(value: string) {
  const label = new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function shortPlanTitle(value: string) {
  return value.includes(' — ') ? value.split(' — ').slice(1).join(' — ') : value;
}
export function accountCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'счетов'
      : mod10 === 1
        ? 'счёт'
        : mod10 >= 2 && mod10 <= 4
          ? 'счёта'
          : 'счетов';
  return `${count} ${word}`;
}
export function receiptItemCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'позиций'
      : mod10 === 1
        ? 'позиция'
        : mod10 >= 2 && mod10 <= 4
          ? 'позиции'
          : 'позиций';
  return `${count} ${word}`;
}
export function goalStatusLabel(status: string) {
  if (status === 'Done') return 'выполнено';
  if (status === 'In progress') return 'в процессе';
  return 'не начато';
}
export function categoryTone(category: string) {
  const tones = ['mint', 'violet', 'blue', 'warning'] as const;
  let hash = 0;
  for (const character of category) hash = (hash + character.charCodeAt(0)) % tones.length;
  return tones[hash];
}
export const accountCurrencyOrder = ['RSD', 'EUR', 'RUB', 'USD'];
export function compareAccountCurrencies(a: string, b: string) {
  const aIndex = accountCurrencyOrder.indexOf(a.toUpperCase());
  const bIndex = accountCurrencyOrder.indexOf(b.toUpperCase());
  const aRank = aIndex === -1 ? accountCurrencyOrder.length : aIndex;
  const bRank = bIndex === -1 ? accountCurrencyOrder.length : bIndex;
  return aRank - bRank || a.localeCompare(b);
}
export const eventValue = (event: Event) => (event.target as HTMLInputElement).value;
export const eventChecked = (event: Event) => (event.target as HTMLInputElement).checked;
