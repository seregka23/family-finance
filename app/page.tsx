"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReservesPanel, { AccountReserveSummary } from "./reserves-panel";
import type { GoalsData } from "./reserve-model";
import ExpensesDashboard from "./expenses-dashboard";
import { accountActivity, countLabel, currentMonthStart, operationDate, operationDay, periodBounds, validPeriod, type PeriodPreset } from "./finance-ui-model";

type Tab = "overview" | "operations" | "plan" | "accounts" | "dashboards";
type AccountSummary = {
  id: string;
  name: string;
  balance: number | null;
  reserved: number | null;
  available: number | null;
  reserveNames: string[];
  currency: string;
  active: boolean;
  includeInCapital: boolean;
  owner: string;
  kind: string;
  bank: string;
  mask: string;
};
type MonthlyPlanItem = { id: string; title: string; section: string; category: string; amount: number; actual: number; currency: string; notionUrl: string };
type MonthlyPlan = { month: string; items: MonthlyPlanItem[]; unavailable?: boolean };
type ReceiptSummary = { operationId: string; title: string; itemCount: number; total: number; currency: string; notionUrl: string; categories: Array<{ name: string; amount: number; percent: number }> };
type ReceiptData = { items: ReceiptSummary[]; unavailable?: boolean };
type ViewerData = { accountOwner: string | null };
type Operation = {
  id: string;
  operationType: "Расход" | "Доход";
  title: string;
  merchant: string;
  amount: number;
  currency: "RSD" | "EUR" | "USD" | "RUB";
  date: string;
  time: string;
  category: string;
  account: string;
  shortAccount: string;
  plan: string;
  source: "SMS" | "Чек";
  status: "Готово" | "Нужна проверка";
  participant: "Я" | "Семья";
  note: string;
  notionUrl: string;
  isoDate: string;
  reserveName?: string;
  reserveAmount?: number;
  items?: number;
};

const operations: Operation[] = [];

const notionOperations = "https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7";
const notionPlan = "https://app.notion.com/p/56f21d527b044920a7b513902c777b48";
const notionReceiptItems = "https://app.notion.com/p/b0d2c33e97fc4735bde63018a7789a64";
const notionGoals = "https://app.notion.com/p/6f5e3d2ff27f4e4792ca9989dbce0632";

function money(value: number, currency = "RSD") {
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function groupedMoney(items: Operation[]) {
  const totals = items.reduce<Record<string, number>>((result, item) => {
    result[item.currency] = (result[item.currency] ?? 0) + item.amount;
    return result;
  }, {});
  return Object.entries(totals).map(([currency, amount]) => money(amount, currency)).join(" · ") || money(0);
}

function groupedAverage(items: Operation[]) {
  const totals = items.reduce<Record<string, { amount: number; count: number }>>((result, item) => {
    result[item.currency] ??= { amount: 0, count: 0 };
    result[item.currency].amount += item.amount;
    result[item.currency].count += 1;
    return result;
  }, {});
  return Object.entries(totals).map(([currency, total]) => money(total.count ? total.amount / total.count : 0, currency)).join(" · ") || money(0);
}

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    family: <><circle cx="8" cy="7" r="3" /><circle cx="17" cy="8" r="2.5" /><path d="M2.5 20v-2a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v2M14 14a4.5 4.5 0 0 1 7.5 3.4V20" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13" /><path d="m3 8 14-4v4M15 13h6v4h-6a2 2 0 0 1 0-4Z" /></>,
    card: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6 15h4" /></>,
    down: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10m-4-4 4 4 4-4" /></>,
    up: <><circle cx="12" cy="12" r="9" /><path d="M12 17V7m-4 4 4-4 4 4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    chart: <><path d="M12 3v9h9" /><path d="M20 16a9 9 0 1 1-12-12" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14" /><path d="M21 19v-5h-5" /></>,
    database: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3 3 7 3s7-1.3 7-3v-6" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    alert: <><path d="M10.3 4 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function AccountMark({ bank, size = "normal" }: { bank: string; size?: "normal" | "large" }) {
  const normalized = bank.toLocaleLowerCase("ru");
  if (normalized.includes("raiffeisen")) return <span className={`bank-mark raiffeisen ${size}`} aria-label={bank}>R</span>;
  if (normalized.includes("налич")) return <span className={`bank-mark cash ${size}`} aria-label={bank}><Icon name="wallet" size={size === "large" ? 24 : 19} /></span>;
  return <span className={`bank-mark generic ${size}`} aria-label={bank || "Банк не указан"}>{bank.trim().charAt(0).toLocaleUpperCase("ru") || <Icon name="card" size={19} />}</span>;
}

function monthName(value: string) {
  const label = new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shortPlanTitle(value: string) {
  return value.includes(" — ") ? value.split(" — ").slice(1).join(" — ") : value;
}

function accountCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "счетов" : mod10 === 1 ? "счёт" : mod10 >= 2 && mod10 <= 4 ? "счёта" : "счетов";
  return `${count} ${word}`;
}

function receiptItemCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "позиций" : mod10 === 1 ? "позиция" : mod10 >= 2 && mod10 <= 4 ? "позиции" : "позиций";
  return `${count} ${word}`;
}

function goalStatusLabel(status: string) {
  if (status === "Done") return "выполнено";
  if (status === "In progress") return "в процессе";
  return "не начато";
}

function Status({ value }: { value: Operation["status"] }) {
  return <span className={`status ${value === "Готово" ? "ready" : "review"}`}><Icon name={value === "Готово" ? "check" : "alert"} size={14} />{value}</span>;
}

function categoryTone(category: string) {
  const tones = ["mint", "violet", "blue", "warning"] as const;
  let hash = 0;
  for (const character of category) hash = (hash + character.charCodeAt(0)) % tones.length;
  return tones[hash];
}

const accountCurrencyOrder = ["RSD", "EUR", "RUB", "USD"];

function compareAccountCurrencies(a: string, b: string) {
  const aIndex = accountCurrencyOrder.indexOf(a.toUpperCase());
  const bIndex = accountCurrencyOrder.indexOf(b.toUpperCase());
  const aRank = aIndex === -1 ? accountCurrencyOrder.length : aIndex;
  const bRank = bIndex === -1 ? accountCurrencyOrder.length : bIndex;
  return aRank - bRank || a.localeCompare(b);
}

export default function Home() {
  const [liveOperations, setLiveOperations] = useState<Operation[]>(operations);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("Все");
  const [operationAccountFilter, setOperationAccountFilter] = useState("Все");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset | "custom">("month");
  const [period, setPeriod] = useState(() => periodBounds("month"));
  const [refreshToken, setRefreshToken] = useState(0);
  const [accountBalances, setAccountBalances] = useState<AccountSummary[]>([]);
  const [accountsView, setAccountsView] = useState<"balances" | "reserves">("balances");
  const [accountCurrencyFilter, setAccountCurrencyFilter] = useState("Все");
  const [accountOwnerFilter, setAccountOwnerFilter] = useState("Все");
  const [accountKindFilter, setAccountKindFilter] = useState("Все");
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null);
  const [receipts, setReceipts] = useState<ReceiptData | null>(null);
  const [goals, setGoals] = useState<GoalsData | null>(null);
  const [viewerOwner, setViewerOwner] = useState<string | null>(null);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [menu, setMenu] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeDrawerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const periodValid = validPeriod(period);
  const accountTones = ["mint", "violet", "blue"] as const;
  const accounts = accountBalances.map((account, index) => ({
    ...account,
    label: account.name,
    bank: account.bank || "Банк не указан",
    kind: account.kind || "Счёт",
    mask: account.mask || "Маска не указана",
    tone: accountTones[index % accountTones.length],
  }));
  const accountCurrencies = Array.from(new Set(accounts.map((account) => account.currency))).sort(compareAccountCurrencies);
  const accountOwners = Array.from(new Set(accounts.map((account) => account.owner || "Не указан"))).sort((a, b) => a.localeCompare(b, "ru"));
  const accountKinds = Array.from(new Set(accounts.map((account) => account.kind))).sort((a, b) => a.localeCompare(b, "ru"));
  const filteredAccounts = [...accounts].sort((a, b) => compareAccountCurrencies(a.currency, b.currency)).filter((account) =>
    (accountCurrencyFilter === "Все" || account.currency === accountCurrencyFilter) &&
    (accountOwnerFilter === "Все" || (account.owner || "Не указан") === accountOwnerFilter) &&
    (accountKindFilter === "Все" || account.kind === accountKindFilter));
  const accountCurrencyTotals = Object.values(filteredAccounts.reduce<Record<string, { currency: string; balance: number; known: number; total: number }>>((totals, account) => {
    totals[account.currency] ??= { currency: account.currency, balance: 0, known: 0, total: 0 };
    totals[account.currency].total += 1;
    if (account.balance !== null) {
      totals[account.currency].balance += account.balance;
      totals[account.currency].known += 1;
    }
    return totals;
  }, {})).sort((a, b) => compareAccountCurrencies(a.currency, b.currency));
  const raiffeisenRsdAccounts = accounts.filter((account) => {
    const identity = `${account.name} ${account.bank}`.toLocaleLowerCase("ru");
    return account.currency === "RSD" && (identity.includes("raiffeisen") || identity.includes("райф"));
  }).slice(0, 2);
  const viewerOwnerNormalized = viewerOwner?.toLocaleLowerCase("ru") ?? "";
  const viewerCashAccount = accounts.find((account) => {
    const identity = `${account.name} ${account.kind}`.toLocaleLowerCase("ru");
    if (!identity.includes("налич")) return false;
    if (account.owner.toLocaleLowerCase("ru") === viewerOwnerNormalized) return true;
    if (viewerOwnerNormalized === "муж") return identity.includes("сереж") || identity.includes("сергей");
    if (viewerOwnerNormalized === "жена") return identity.includes("свет");
    return false;
  });
  const overviewAccounts = [...raiffeisenRsdAccounts, ...(viewerCashAccount ? [viewerCashAccount] : [])];

  useEffect(() => {
    if (!validPeriod(period)) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    setDataState("loading");
    setLoadError("");
    const params = new URLSearchParams({ from: period.from, to: period.to, month: currentMonthStart() });
    fetch(`/api/operations?${params}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (response.ok) return response.json();
        throw new Error(response.status === 401 ? "Сессия завершилась. Войдите в аккаунт заново." : response.status === 403 ? "У аккаунта нет доступа к данным." : "Не удалось получить данные из Notion. Попробуйте ещё раз.");
      })
      .then((data: { operations: Operation[]; accounts?: AccountSummary[]; monthlyPlan?: MonthlyPlan; receipts?: ReceiptData; goals?: GoalsData; viewer?: ViewerData; updatedAt?: string }) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data.operations)) throw new Error("Ответ с данными неполный. Повторите загрузку.");
        setLiveOperations(data.operations); setAccountBalances(data.accounts ?? []); setMonthlyPlan(data.monthlyPlan ?? null); setReceipts(data.receipts ?? null); setGoals(data.goals ?? null); setViewerOwner(data.viewer?.accountOwner ?? null); setUpdatedAt(data.updatedAt ?? new Date().toISOString()); setDataState("ready");
        setFilter(previous => previous === "Все" || data.operations.some(item => item.category === previous) ? previous : "Все");
        setOperationAccountFilter(previous => previous === "Все" || data.operations.some(item => item.account === previous) ? previous : "Все");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        setLoadError(timedOut ? "Notion отвечает дольше обычного. Повторите загрузку." : error instanceof Error ? error.message : "Проверьте соединение и повторите загрузку.");
        setDataState("error");
      }).finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [period, refreshToken]);

  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    closeDrawerRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      focused?.focus();
    };
  }, [selected]);

  const filtered = useMemo(() => liveOperations.filter((item) => {
    const q = query.toLocaleLowerCase("ru").trim();
    const inPeriod = operationDay(item.isoDate) >= period.from && operationDay(item.isoDate) <= period.to;
    return inPeriod && (filter === "Все" || item.category === filter) &&
      (operationAccountFilter === "Все" || item.account === operationAccountFilter) &&
      (!q || `${item.title} ${item.merchant} ${item.account} ${item.plan}`.toLocaleLowerCase("ru").includes(q));
  }), [liveOperations, query, filter, operationAccountFilter, period]);
  const periodOperations = dataState === "ready" && periodValid ? liveOperations.filter((item) => operationDay(item.isoDate) >= period.from && operationDay(item.isoDate) <= period.to) : [];
  const expenseOperations = periodOperations.filter((item) => item.operationType === "Расход");
  const categoryOptions = ["Все", ...Array.from(new Set(liveOperations.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "ru"))];
  const operationAccountOptions = Array.from(liveOperations.reduce((options, item) => {
    if (!options.has(item.account)) options.set(item.account, item.shortAccount || item.account);
    return options;
  }, new Map<string, string>())).sort(([, first], [, second]) => first.localeCompare(second, "ru"));
  const categoryBreakdown = Object.entries(expenseOperations.reduce<Record<string, { items: Operation[]; count: number }>>((totals, item) => {
    totals[item.category] ??= { items: [], count: 0 };
    totals[item.category].items.push(item);
    totals[item.category].count += 1;
    return totals;
  }, {})).sort(([, first], [, second]) => second.count - first.count);
  const needsReview = periodOperations.filter((item) => item.status === "Нужна проверка").length;
  const latest = periodOperations[0];
  const latestReceipt = receipts?.items[0];
  const activityFor = (account: string, currency: string) => {
    const total = accountActivity(periodOperations, account, currency);
    return [total.income ? `+${money(total.income, currency)}` : "", total.expense ? `−${money(total.expense, currency)}` : ""].filter(Boolean).join(" · ") || "Нет операций";
  };
  const planItems = monthlyPlan?.items ?? [];
  const sortedPlanItems = [...planItems].sort((first, second) => {
    const firstProgress = first.amount > 0 ? first.actual / first.amount : first.actual > 0 ? Number.POSITIVE_INFINITY : 0;
    const secondProgress = second.amount > 0 ? second.actual / second.amount : second.actual > 0 ? Number.POSITIVE_INFINITY : 0;
    return secondProgress - firstProgress || second.actual - first.actual || first.title.localeCompare(second.title, "ru");
  });
  const planTotals = Object.values(planItems.reduce<Record<string, { currency: string; amount: number; actual: number }>>((totals, item) => {
    totals[item.currency] ??= { currency: item.currency, amount: 0, actual: 0 };
    totals[item.currency].amount += item.amount;
    totals[item.currency].actual += item.actual;
    return totals;
  }, {}));

  const go = (next: Tab) => {
    setTab(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>("h1")?.focus());
  };

  const openReserves = () => { setAccountsView("reserves"); go("accounts"); };

  const changePeriod = (value: PeriodPreset) => {
    setDataState("loading");
    setPeriodPreset(value);
    setPeriod(periodBounds(value));
  };

  const refreshData = () => {
    if (dataState === "loading" || !periodValid) return;
    setDataState("loading");
    setRefreshToken((value) => value + 1);
  };

  const changeDate = (field: "from" | "to", value: string) => {
    setPeriodPreset("custom");
    if (validPeriod({ ...period, [field]: value })) setDataState("loading");
    setPeriod(previous => ({ ...previous, [field]: value }));
  };

  const resetFilters = () => { setQuery(""); setFilter("Все"); setOperationAccountFilter("Все"); };

  return (
    <main className="shell">
      <a className="skip-link" href="#workspace-content">Перейти к содержимому</a>
      <div className="glow one" /><div className="glow two" />
      <div className="dashboard">
        <header>
          <button className="brand" type="button" onClick={() => go("overview")}><Icon name="family" size={28} /><b>Семейные финансы</b></button>
          <nav id="main-navigation" className={menu ? "open" : ""} aria-label="Основная навигация">
            <button type="button" aria-label="Обзор" title="Обзор" className={tab === "overview" ? "active" : ""} aria-current={tab === "overview" ? "page" : undefined} onClick={() => go("overview")}><span className="nav-icon"><Icon name="home" size={24} /></span><span className="nav-label">Обзор</span></button>
            <button type="button" aria-label="Операции" title="Операции" className={tab === "operations" ? "active" : ""} aria-current={tab === "operations" ? "page" : undefined} onClick={() => go("operations")}><span className="nav-icon"><Icon name="receipt" size={24} /></span><span className="nav-label">Операции</span></button>
            <button type="button" aria-label="План" title="План" className={tab === "plan" ? "active" : ""} aria-current={tab === "plan" ? "page" : undefined} onClick={() => go("plan")}><span className="nav-icon"><Icon name="target" size={24} /></span><span className="nav-label">План</span></button>
            <button type="button" aria-label="Счета" title="Счета" className={tab === "accounts" ? "active" : ""} aria-current={tab === "accounts" ? "page" : undefined} onClick={() => go("accounts")}><span className="nav-icon"><Icon name="wallet" size={24} /></span><span className="nav-label">Счета</span></button>
            <button type="button" aria-label="Дашборды" title="Дашборды" className={tab === "dashboards" ? "active" : ""} aria-current={tab === "dashboards" ? "page" : undefined} onClick={() => go("dashboards")}><span className="nav-icon"><Icon name="chart" size={24} /></span><span className="nav-label">Дашборды</span></button>
            <a className="mobile-signout" href="/signout-with-chatgpt?return_to=/">Выйти из аккаунта</a>
          </nav>
          <a className="profile" href="/signout-with-chatgpt?return_to=/" aria-label="Выйти из аккаунта" title="Выйти"><Icon name="external" size={19} /></a>
          <button className="menu" type="button" onClick={() => setMenu(!menu)} aria-label="Меню" aria-controls="main-navigation" aria-expanded={menu}><Icon name={menu ? "close" : "menu"} /></button>
        </header>
        <div id="workspace-content" ref={contentRef}>
        {tab !== "dashboards" && <div className="workspace-status">
          <span role="status"><Icon name="database" size={17} />{dataState === "loading" ? "Загружаем данные из Notion…" : dataState === "error" ? "Данные не обновлены" : `Notion · обновлено ${updatedAt ? new Date(updatedAt).toLocaleTimeString("ru-RU", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" }) : ""} · Белград`}</span>
          <button className="refresh-button" type="button" onClick={refreshData} disabled={dataState === "loading" || !periodValid}><Icon name="refresh" size={16} />{dataState === "loading" ? "Обновление…" : "Обновить данные"}</button>
        </div>}
        {tab !== "dashboards" && dataState === "error" && <section className="load-error global-notice" role="alert"><div><b>Не удалось обновить данные</b><p>{loadError} Старые итоги скрыты, чтобы не показывать неверные суммы.</p></div>{loadError.includes("аккаунт") && <a href="/signin-with-chatgpt?return_to=/">Войти заново</a>}</section>}
        {tab === "dashboards" && <ExpensesDashboard />}
        {tab === "overview" && <div className="content enter">
          <section className="hero">
            <div>
              <h1 tabIndex={-1}>Бюджет семьи</h1>
              <p className="subtitle">План месяца, деньги на счетах и последние расходы</p>
              <div className="hero-tools"><label className="period-select"><Icon name="calendar" size={16} /><select value={periodPreset} onChange={(e) => changePeriod(e.target.value as PeriodPreset)} aria-label="Период загрузки данных"><option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option><option value="halfYear">6 месяцев</option><option value="year">Год</option>{periodPreset === "custom" && <option value="custom">Свой период</option>}</select></label><span className="period-caption">{period.from} — {period.to}</span></div>
            </div>
            <a className="cta" href={notionOperations} target="_blank" rel="noreferrer"><b>＋</b> Добавить в Notion <Icon name="external" size={17} /></a>
          </section>

          {dataState === "ready" && !monthlyPlan?.unavailable && planTotals.length > 0 && <section className="monthly-command" aria-label="Бюджет текущего месяца">
            <div className="monthly-command-heading"><h2>{monthName(monthlyPlan?.month ?? currentMonthStart())} · бюджет месяца</h2><button onClick={() => go("plan")}>Открыть план <Icon name="chevron" size={16} /></button></div>
            {planTotals.map(total => {
              const progress = total.amount > 0 ? total.actual / total.amount * 100 : 0;
              const remaining = total.amount - total.actual;
              return <div className="monthly-budget-row" key={total.currency}>
                <span className="budget-currency">{total.currency}</span>
                <div className="budget-values"><span><small>Потрачено</small><strong>{money(total.actual, total.currency)}</strong></span><span><small>Запланировано</small><strong>{money(total.amount, total.currency)}</strong></span><span><small>{remaining < 0 ? "Перерасход" : "Осталось"}</small><strong className={remaining < 0 ? "warning" : "mint"}>{money(Math.abs(remaining), total.currency)}</strong></span></div>
                <div className="budget-progress"><div><i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div><span>{progress.toFixed(0)}% плана</span></div>
              </div>;
            })}
          </section>}
          {dataState === "ready" && periodValid && <section className="metrics">
            <article><span className="tile mint"><Icon name="down" /></span><div><small>Расходы за период</small><strong className="multi-money">{groupedMoney(expenseOperations)}</strong><em>{expenseOperations.length} операций</em></div></article>
            <article><span className="tile mint"><Icon name="calendar" /></span><div><small>Средний расход</small><strong className="multi-money">{groupedAverage(expenseOperations)}</strong><em>на одну операцию · по валютам</em></div></article>
            <article><span className="tile violet"><Icon name="chart" /></span><div><small>Операций за период</small><strong>{periodOperations.length}</strong><em className={needsReview ? "attention" : ""}>{needsReview ? `На проверке: ${needsReview}` : "Проверка не требуется"}</em></div></article>
          </section>}

          {dataState === "ready" && !goals?.unavailable && accounts.some(account => account.reserveNames?.length) && <section className="panel reserve-overview">
            <Title icon="target" text="Деньги в резерве" action="Все резервы" onClick={openReserves} />
            {accounts.filter(account => account.reserveNames?.length).map(account => <button key={account.id} onClick={openReserves}><span><b>{account.name}</b><small>{account.reserveNames.join(" · ")}</small></span><span><b>{account.reserved === null ? "Нет данных" : money(account.reserved, account.currency)}</b><small>Свободно: {account.available === null ? "нет данных" : money(account.available, account.currency)}</small></span></button>)}
          </section>}
          <section className="triple">
            <article className="panel accounts-overview overview-card">
              <Title icon="wallet" text="Счета" action="Все счета" onClick={() => go("accounts")} />
              {dataState === "ready" && overviewAccounts.map((account) => <button className="account-row" onClick={() => go("accounts")} key={account.id}>
                <span className={`symbol ${account.tone}`}><AccountMark bank={account.bank} /></span>
                <span><b>{account.name}</b><small>{account.kind} · {account.owner || "Владелец не указан"}</small></span>
                <span className="activity"><small>Остаток</small><b>{account.balance === null ? "не указан" : money(account.balance, account.currency)}</b></span>
                <Icon name="chevron" size={17} />
              </button>)}
              {(dataState !== "ready" || !overviewAccounts.length) && <p className="note">{dataState === "loading" ? "Загружаем счета из Notion…" : dataState === "error" ? "Не удалось загрузить счета." : "Подходящие счета не найдены."}</p>}
            </article>

            <article className="panel categories-panel overview-card">
              <Title icon="chart" text="Категории" badge={dataState === "ready" ? countLabel(categoryBreakdown.length, ["категория", "категории", "категорий"]) : undefined} />
              <div className="categories-scroll">
                {categoryBreakdown.map(([category, details]) => <Category key={category} name={category} amount={groupedMoney(details.items)} percent={expenseOperations.length ? details.count / expenseOperations.length * 100 : 0} count={details.count} tone={categoryTone(category)} />)}
                {!categoryBreakdown.length && <p className="note">{dataState === "loading" ? "Загружаем категории…" : dataState === "error" ? "Не удалось загрузить категории." : "Нет расходов за выбранный период."}</p>}
              </div>
            </article>

            <article className="panel overview-card">
              <Title icon="receipt" text="Последняя операция" />
              <button className="latest" disabled={!latest} onClick={() => latest && setSelected(latest)}>
                <span className="receipt-orb"><Icon name={latest?.operationType === "Доход" ? "up" : latest?.source === "Чек" ? "receipt" : "card"} size={34} /></span>
                <span><small>{latest?.date ?? "За выбранный период"} {latest?.time ?? ""}</small><b>{latest?.title ?? (dataState === "loading" ? "Загружаем операции…" : dataState === "error" ? "Не удалось загрузить операции" : "Операций пока нет")}</b>{latest && <><strong className={latest.operationType === "Доход" ? "income-amount" : ""}>{latest.operationType === "Доход" ? "+" : "−"}{money(latest.amount, latest.currency)}</strong><em>{latest.shortAccount}</em></>}</span>
                <Icon name="chevron" />
              </button>
            </article>
          </section>

          <section className="lower">
            <article className="panel">
              <Title icon="receipt" text="Последние операции" action="Весь журнал" onClick={() => go("operations")} />
              <div className="recent recent-scroll" tabIndex={0} role="region" aria-label="Последние 15 операций выбранного периода">{periodOperations.slice(0, 15).map((item) => <button key={item.id} onClick={() => setSelected(item)}>
                <span className={`symbol ${categoryTone(item.category)}`}><Icon name={item.operationType === "Доход" ? "up" : item.source === "Чек" ? "receipt" : "card"} /></span>
                <span><b>{item.title}</b><small>{item.date} · {item.shortAccount}</small></span>
                <Status value={item.status} /><strong className={item.operationType === "Доход" ? "income-amount" : ""}>{item.operationType === "Доход" ? "+" : "−"}{money(item.amount, item.currency)}</strong>
              </button>)}</div>
              {!periodOperations.length && <p className="note">{dataState === "loading" ? "Загружаем операции…" : dataState === "error" ? "Данные временно недоступны." : "За выбранный период операций нет."}</p>}
            </article>
            <article className="panel plan">
              <Title icon="target" text={`План на ${monthName(monthlyPlan?.month ?? currentMonthStart()).toLocaleLowerCase("ru")}`} badge={planItems.length ? `${planItems.length} статей` : undefined} />
              {dataState === "loading" ? <div className="plan-state"><span className="tile mint"><Icon name="target" /></span><section><b>Загружаем план…</b><p>Получаем статьи текущего месяца из Notion.</p></section></div>
                : dataState === "error" || monthlyPlan?.unavailable ? <div className="plan-state"><span className="tile violet"><Icon name="alert" /></span><section><b>План временно недоступен</b><p>Обновите данные, чтобы повторить загрузку.</p></section></div>
                  : planItems.length ? <div className="plan-content">
                    <div className="plan-list">{sortedPlanItems.slice(0, 6).map((item) => {
                      const progress = item.amount > 0 ? item.actual / item.amount * 100 : item.actual > 0 ? 100 : 0;
                      return <button onClick={() => go("plan")} key={item.id}><span className="plan-list-name"><b>{shortPlanTitle(item.title)}</b><small>{item.section}</small><span className="plan-progress"><i><em style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></i><small>{Math.max(0, progress).toFixed(0)}%</small></span></span><div className="plan-values"><span><small>План</small><strong>{money(item.amount, item.currency)}</strong></span><span><small>Факт</small><strong className={item.actual > item.amount ? "over" : ""}>{money(item.actual, item.currency)}</strong></span></div></button>;
                    })}</div>
                    <button className="plan-link" onClick={() => go("plan")}>Открыть весь план <Icon name="chevron" size={15} /></button>
                  </div>
                    : <div className="plan-state"><span className="tile mint"><Icon name="target" /></span><section><b>План ещё не заполнен</b><p>Добавьте статьи с суммами для текущего месяца.</p><a href={notionPlan} target="_blank" rel="noreferrer">Заполнить в Notion <Icon name="external" size={15} /></a></section></div>}
            </article>
          </section>
        </div>}

        {tab === "operations" && <div className="content enter">
          <PageHead title="Операции" text="Доходы и расходы из Notion за выбранный период." action />
          <div className="toolbar">
            <div className="date-filter"><label>С <input type="date" aria-label="Начало периода" aria-invalid={!periodValid} aria-describedby={!periodValid ? "period-error" : undefined} value={period.from} onChange={(e) => changeDate("from", e.target.value)} /></label><span>—</span><label>по <input type="date" aria-label="Конец периода" aria-invalid={!periodValid} aria-describedby={!periodValid ? "period-error" : undefined} value={period.to} onChange={(e) => changeDate("to", e.target.value)} /></label></div>
            <label className="category-select">
              <span>Категория</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Категория операции">
                {categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <Icon name="chevron" size={15} />
            </label>
            <label className="operation-select">
              <span>Счёт</span>
              <select value={operationAccountFilter} onChange={(event) => setOperationAccountFilter(event.target.value)} aria-label="Счёт операции">
                <option value="Все">Все счета</option>
                {operationAccountOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Icon name="chevron" size={15} />
            </label>
            <label><Icon name="search" /><input type="search" aria-label="Поиск операций" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти операцию или магазин" /></label>
          </div>
          {!periodValid && <p id="period-error" className="expense-warning" role="alert">Укажите обе даты: начало должно быть не позже конца, а период — не длиннее года.</p>}
          {dataState === "ready" && periodValid && <><article className="panel table">
            <div className="summary"><span>{filtered.length} из {liveOperations.length} операций</span><div className="summary-totals"><b className="income-amount">Доходы: {groupedMoney(filtered.filter((item) => item.operationType === "Доход"))}</b><b>Расходы: {groupedMoney(filtered.filter((item) => item.operationType === "Расход"))}</b></div></div>
            <div className="thead"><span>Операция</span><span>Категория</span><span>Счёт</span><span>План</span><span>Статус</span><span>Сумма</span></div>
            {filtered.map((item) => <button className="trow" key={item.id} onClick={() => setSelected(item)}>
              <span className="op"><i className={categoryTone(item.category)}><Icon name={item.operationType === "Доход" ? "up" : item.source === "Чек" ? "receipt" : "card"} /></i><span><b>{item.title}</b><small>{item.date} · {item.time} · {item.merchant}</small><small className="mobile-plan">{item.shortAccount} · {item.category}</small><small className="mobile-plan">План: {item.plan}</small>{item.reserveName && <small className="operation-reserve">Из резерва «{item.reserveName}»: {money(item.reserveAmount ?? 0, item.currency)}{item.status !== "Готово" ? " · ожидает проверки" : ""}</small>}{item.status === "Нужна проверка" && <small className="mobile-plan warning">Нужна проверка</small>}</span></span>
              <span><em className="chip">{item.category}</em></span><span className="muted">{item.shortAccount}</span><span className={`operation-plan ${item.plan === "Не привязана" ? "unlinked" : ""}`}>{item.plan}</span><Status value={item.status} /><strong className={item.operationType === "Доход" ? "income-amount" : ""}>{item.operationType === "Доход" ? "+" : "−"}{money(item.amount, item.currency)}</strong>
            </button>)}
            {!filtered.length && <div className="empty"><Icon name="search" size={30} /><b>Ничего не найдено</b><span>Измените запрос или фильтр.</span><button className="refresh-button" onClick={resetFilters}>Сбросить фильтры</button></div>}
          </article>
          <section className="insights">
            <article className="panel receipt-card">
              <Title icon="receipt" text={latestReceipt ? `Чек · ${latestReceipt.title}` : "Позиции чеков"} badge={latestReceipt ? receiptItemCountLabel(latestReceipt.itemCount) : undefined} />
              {receipts?.unavailable ? <div className="receipt-state"><span className="tile violet"><Icon name="alert" /></span><section><b>Позиции временно недоступны</b><p>Notion не вернул базу позиций чеков.</p></section></div>
                  : latestReceipt ? <><p>Разбивка чека на {money(latestReceipt.total, latestReceipt.currency)}</p>{latestReceipt.categories.map((category) => <ReceiptLine key={category.name} name={category.name} amount={category.amount} percent={category.percent} currency={latestReceipt.currency} />)}<a className="notion-section-link" href={latestReceipt.notionUrl} target="_blank" rel="noreferrer">Открыть операцию в Notion <Icon name="external" size={15} /></a></>
                    : <div className="receipt-state"><span className="tile mint"><Icon name="receipt" /></span><section><b>Позиции чеков ещё не добавлены</b><p>Добавьте товары и свяжите их с операцией в Notion.</p><a className="notion-section-link" href={notionReceiptItems} target="_blank" rel="noreferrer">Открыть базу в Notion <Icon name="external" size={15} /></a></section></div>}
            </article>
            <article className="panel review-card"><span><Icon name={needsReview ? "alert" : "check"} size={30} /></span><section><small>Проверка за период</small><b>{needsReview ? "Проверьте операцию" : "Проверка не требуется"}</b><p>{needsReview ? "В Notion есть операции со статусом «Нужна проверка»." : "В выбранном периоде нет операций со статусом «Нужна проверка»."}</p>{needsReview > 0 && <button onClick={() => setSelected(periodOperations.find((item) => item.status === "Нужна проверка") ?? null)}>Посмотреть</button>}</section></article>
          </section></>}
        </div>}

        {tab === "plan" && <div className="content enter">
          <section className="page-head"><div><h1 tabIndex={-1}>План на {monthName(monthlyPlan?.month ?? currentMonthStart()).toLocaleLowerCase("ru")}</h1><p>Плановые суммы, фактические расходы и остаток по каждой статье.</p></div><a className="cta" href={notionPlan} target="_blank" rel="noreferrer">Редактировать в Notion <Icon name="external" size={17} /></a></section>
          {dataState === "loading" ? <article className="panel plan-page-state"><span className="tile mint"><Icon name="target" /></span><section><b>Загружаем месячный план…</b><p>Данные появятся через несколько секунд.</p></section></article>
            : dataState === "error" || monthlyPlan?.unavailable ? <article className="panel plan-page-state"><span className="tile violet"><Icon name="alert" /></span><section><b>План временно недоступен</b><p>Обновите данные, чтобы повторить загрузку.</p></section></article>
              : planItems.length ? <>
                <section className="plan-page-metrics">{planTotals.map((total) => {
                  const progress = total.amount > 0 ? total.actual / total.amount * 100 : total.actual > 0 ? 100 : 0;
                  return <div className="plan-currency-group" key={total.currency}>
                    <article className="plan-desktop-summary"><small>Запланировано</small><strong>{money(total.amount, total.currency)}</strong></article>
                    <article className="plan-desktop-summary"><small>Потрачено</small><strong>{money(total.actual, total.currency)}</strong></article>
                    <article className="plan-desktop-summary"><small>Осталось</small><strong className={total.actual > total.amount ? "over" : ""}>{money(total.amount - total.actual, total.currency)}</strong></article>
                    <article className="plan-mobile-summary"><div className="plan-mobile-values"><span><small>Потрачено</small><strong className={total.actual > total.amount ? "over" : ""}>{money(total.actual, total.currency)}</strong></span><span><small>Запланировано</small><strong>{money(total.amount, total.currency)}</strong></span></div><div className="plan-mobile-progress"><i><em style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></i><b>{Math.max(0, progress).toFixed(0)}%</b></div></article>
                  </div>;
                })}</section>
                <article className="panel plan-page-table">
                  <div className="plan-table-head"><span>Статья</span><span>Раздел</span><span>План</span><span>Факт</span><span>Остаток</span></div>
                  {sortedPlanItems.map((item) => { const remaining = item.amount - item.actual; const percent = Math.min(100, item.amount ? item.actual / item.amount * 100 : 0); return <div className="plan-table-row" key={item.id}>
                    <span className="plan-item-name"><b>{shortPlanTitle(item.title)}</b><small>{item.category}</small><i><em style={{ width: `${percent}%` }} /></i></span>
                    <span className="muted">{item.section}</span><strong>{money(item.amount, item.currency)}</strong><strong className={item.actual > item.amount ? "over" : "actual"}>{money(item.actual, item.currency)}</strong><strong className={remaining < 0 ? "over" : "remaining"}>{money(remaining, item.currency)}</strong>
                  </div>; })}
                </article>
              </>
                : <article className="panel plan-page-state"><span className="tile mint"><Icon name="target" /></span><section><b>План ещё не заполнен</b><p>Добавьте статьи с суммами для текущего месяца в Notion.</p></section></article>}
        </div>}

        {tab === "accounts" && <div className="content enter">
          <PageHead title="Счета и резервы" text="Все деньги, отложенные суммы и свободный остаток по каждому счёту." />
          {dataState === "ready" && <>
          <div className="account-subnav" role="group" aria-label="Раздел счетов"><button aria-pressed={accountsView === "balances"} onClick={() => setAccountsView("balances")}>Счета</button><button aria-pressed={accountsView === "reserves"} onClick={() => setAccountsView("reserves")}>Цели и резервы</button></div>
          {accountsView === "reserves" ? <ReservesPanel data={goals} accounts={accounts} onRefresh={refreshData} /> : <>
          <section className="account-controls">
            <div className="account-filters" aria-label="Фильтры счетов">
              <label className="category-select">
                <span>Валюта</span>
                <select value={accountCurrencyFilter} onChange={(event) => setAccountCurrencyFilter(event.target.value)} aria-label="Фильтр счетов по валюте">
                  <option value="Все">Все валюты</option>
                  {accountCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
                <Icon name="chevron" size={15} />
              </label>
              <label className="category-select">
                <span>Владелец</span>
                <select value={accountOwnerFilter} onChange={(event) => setAccountOwnerFilter(event.target.value)} aria-label="Фильтр счетов по владельцу">
                  <option value="Все">Все владельцы</option>
                  {accountOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                </select>
                <Icon name="chevron" size={15} />
              </label>
              <label className="category-select">
                <span>Тип счёта</span>
                <select value={accountKindFilter} onChange={(event) => setAccountKindFilter(event.target.value)} aria-label="Фильтр счетов по типу">
                  <option value="Все">Все типы</option>
                  {accountKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
                <Icon name="chevron" size={15} />
              </label>
            </div>
            <span className="account-filter-count">Показано {filteredAccounts.length} из {accounts.length}</span>
          </section>
          <section className="account-summary" aria-label="Остатки по валютам">
            {accountCurrencyTotals.map((total) => <article key={total.currency}>
              <span className="tile mint"><Icon name="wallet" /></span>
              <div><small>Остаток · {total.currency}</small><strong>{total.known ? money(total.balance, total.currency) : "Не указан"}</strong><em>{total.known === total.total ? accountCountLabel(total.total) : `Учтено ${total.known} из ${total.total}`}</em></div>
            </article>)}
          </section>
          <section className="account-grid">{filteredAccounts.map((account) => <article className="account-card" key={account.id}>
            <div className="account-top"><span className={`symbol large ${account.tone}`}><AccountMark bank={account.bank} size="large" /></span><i>{account.currency}</i></div>
            <h2>{account.label}</h2><p>{account.kind} · {account.owner || "Владелец не указан"}</p>
            <div className="account-meta"><span>{account.bank}</span><span>{account.mask}</span></div>
            <div className="account-balance"><small>Текущий остаток</small><b>{account.balance === null ? "Баланс не указан" : money(account.balance, account.currency)}</b></div>
            <AccountReserveSummary account={account} />
            {account.reserveNames?.length > 0 && <button className="account-reserve-link" onClick={openReserves}>{account.reserveNames.join(" · ")} →</button>}
            <div className="account-bottom"><span><small>Доходы / расходы за период</small><b>{activityFor(account.name, account.currency)}</b></span><em>Активен</em></div>
          </article>)}</section>
          {!filteredAccounts.length && <article className="panel account-empty"><Icon name="wallet" size={30} /><b>Счета не найдены</b><span>Измените валюту, владельца или тип счёта в фильтрах.</span><button className="refresh-button" onClick={() => { setAccountCurrencyFilter("Все"); setAccountOwnerFilter("Все"); setAccountKindFilter("Все"); }}>Сбросить фильтры</button></article>}
          <section className="account-info">
            <article className="panel data-quality"><span className="tile mint"><Icon name="database" /></span><section><small>Качество данных</small><b>Счета синхронизированы с Notion</b><p>Список активных счетов и доступные текущие остатки обновляются вместе с операциями.</p></section></article>
<article className="panel reserve-help"><h2>Резервы внутри счёта</h2><p>Деньги остаются на счёте, но уже отложены на конкретную цель. Оплата уменьшает и баланс, и резерв.</p><button className="refresh-button" onClick={openReserves}>Открыть цели и резервы</button></article>
          </section></>}
          </>}
        </div>}
        </div>
      </div>

      {selected && <dialog ref={dialogRef} className="backdrop" onCancel={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }} aria-labelledby="operation-dialog-title">
        <aside>
          <div className="drawer-head"><span><small>Детали операции</small><h2 id="operation-dialog-title">{selected.title}</h2></span><button ref={closeDrawerRef} type="button" onClick={() => setSelected(null)} aria-label="Закрыть"><Icon name="close" /></button></div>
          <div className="drawer-amount"><span className={categoryTone(selected.category)}><Icon name={selected.operationType === "Доход" ? "up" : selected.source === "Чек" ? "receipt" : "card"} size={30} /></span><section><small>{selected.operationType}</small><b className={selected.operationType === "Доход" ? "income-amount" : ""}>{selected.operationType === "Доход" ? "+" : "−"}{money(selected.amount, selected.currency)}</b></section></div>
          <Status value={selected.status} />
          <dl>
            <div><dt>Дата</dt><dd>{operationDate(selected.isoDate)}{selected.time ? ` · ${selected.time}` : ""}</dd></div><div><dt>Получатель</dt><dd>{selected.merchant || "Не указан"}</dd></div><div><dt>Категория</dt><dd>{selected.category}</dd></div><div><dt>Счёт</dt><dd>{selected.account}</dd></div><div><dt>План</dt><dd>{selected.plan}</dd></div><div><dt>Валюта</dt><dd>{selected.currency}</dd></div><div><dt>Участник</dt><dd>{selected.participant}</dd></div><div><dt>Источник</dt><dd>{selected.source}</dd></div>{selected.items ? <div><dt>Чек</dt><dd>{receiptItemCountLabel(selected.items)}</dd></div> : null}
          </dl>
          {selected.reserveName && <div className="drawer-note"><small>Из резерва «{selected.reserveName}»</small><p>{money(selected.reserveAmount ?? 0, selected.currency)}{selected.status !== "Готово" ? " · сумма ещё не списана из резерва" : ""}</p></div>}
          <div className="drawer-note"><small>Комментарий</small><p>{selected.note || "Комментария нет"}</p></div>
          <a href={selected.notionUrl} target="_blank" rel="noreferrer">Открыть в Notion <Icon name="external" size={17} /></a>
        </aside>
      </dialog>}
    </main>
  );
}

function Title({ icon, text, action, badge, onClick }: { icon: string; text: string; action?: string; badge?: string; onClick?: () => void }) {
  return <div className="title"><span><Icon name={icon} /><h2>{text}</h2></span>{action ? <button onClick={onClick}>{action} <Icon name="chevron" size={15} /></button> : badge ? <em>{badge}</em> : null}</div>;
}

function Category({ name, amount, percent, count, tone }: { name: string; amount: string; percent: number; count: number; tone: string }) {
  return <div className="category"><div><span><i className={tone} />{name}</span><b>{amount}</b></div><div className="bar"><i className={tone} style={{ width: `${percent}%` }} /></div><small>{countLabel(count, ["операция", "операции", "операций"])} · {percent.toFixed(1)}% операций</small></div>;
}

function PageHead({ title, text, action }: { title: string; text: string; action?: boolean }) {
  return <section className="page-head"><div><h1 tabIndex={-1}>{title}</h1><p>{text}</p></div>{action && <a className="cta" href={notionOperations} target="_blank" rel="noreferrer"><b>＋</b> Добавить в Notion <Icon name="external" size={17} /></a>}</section>;
}

function ReceiptLine({ name, amount, percent, currency }: { name: string; amount: number; percent: number; currency: string }) {
  return <div className="receipt-line"><span>{name}<small>{percent.toFixed(1)}%</small></span><div className="bar"><i style={{ width: `${percent}%` }} /></div><b>{money(amount, currency)}</b></div>;
}
