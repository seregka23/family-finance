"use client";

import { useEffect, useState } from "react";
import { belgradeDay, type ExpenseDashboardData } from "./expense-model";

const sourceUrl = "https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7";
const amountLabel = (value: number, currency: string) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Belgrade" });

export default function ExpensesDashboard() {
  const currentMonth = belgradeDay(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState("RSD");
  const [data, setData] = useState<ExpenseDashboardData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"daily" | "cumulative">("daily");
  const [merchantSort, setMerchantSort] = useState<"amount" | "count">("amount");
  const [allMerchants, setAllMerchants] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    fetch(`/api/expenses?${new URLSearchParams({ month })}`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Load failed")))
      .then((result: ExpenseDashboardData) => {
        if (controller.signal.aborted) return;
        setData(result);
        setCurrency(previous => result.currencies.some(item => item.currency === previous) ? previous : result.currencies[0]?.currency ?? "RSD");
        setStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted || timedOut) setStatus("error"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [month, refresh]);
  const reload = () => { setStatus("loading"); setRefresh(value => value + 1); };
  const bucket = data?.currencies.find(item => item.currency === currency);
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Belgrade" });
  const dailyMax = Math.max(1, ...bucket?.days.map(day => chartMode === "daily" ? day.amount : day.cumulative) ?? []);
  const focusedDay = bucket?.days.find(day => day.date === selectedDay);
  const peakDay = bucket?.days.reduce((peak, day) => day.amount > peak.amount ? day : peak, bucket.days[0]);
  const merchants = [...bucket?.merchants ?? []].sort((a, b) => b[merchantSort] - a[merchantSort] || b.amount - a.amount || a.name.localeCompare(b.name, "ru"));
  const merchantMax = Math.max(1, merchants[0]?.[merchantSort] ?? 0);
  const shareLabel = (value: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bucket?.total ? value / bucket.total * 100 : 0)}%`;
  const periodLabel = data ? `${dateLabel(`${month}-01`)} — ${dateLabel(data.through)}` : monthLabel;

  return <div className="content enter expense-dashboard">
    <section className="expense-heading">
      <div><h1 tabIndex={-1}>Дашборды</h1></div>
      <div className="expense-controls">
        <label>Месяц<input type="month" aria-label="Месяц расходов" value={month} min="2000-01" max={currentMonth} onChange={event => {
          const value = event.target.value;
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < "2000-01" || value > currentMonth) return;
          if (value === month) return;
          setStatus("loading"); setData(null); setSelectedDay(null); setAllMerchants(false); setMonth(value);
        }} /></label>
        <label>Валюта<select aria-label="Валюта расходов" value={currency} disabled={status !== "ready" || !data?.currencies.length} onChange={event => { setCurrency(event.target.value); setSelectedDay(null); setAllMerchants(false); }}>
          {data?.currencies.length ? data.currencies.map(item => <option key={item.currency}>{item.currency}</option>) : <option value={currency}>{currency}</option>}
        </select></label>
        <button className="refresh-button" onClick={reload} disabled={status === "loading"}>{status === "loading" ? "Загружаем…" : "Обновить данные"}</button>
      </div>
    </section>
    <p className="expense-caption">{monthLabel} · Только расходы, без доходов и переводов. Валюты не суммируются.</p>
    <div aria-live="polite" aria-busy={status === "loading"}>
      {status === "loading" && <section className="panel expense-state"><h2>Загружаем расходы месяца…</h2><p>Получаем все операции из Notion.</p></section>}
      {status === "error" && <section className="panel expense-state" role="alert"><h2>Не удалось загрузить весь месяц</h2><p>Проверьте подключение и повторите загрузку. Неполные итоги не показаны.</p><button className="refresh-button" onClick={reload}>Повторить</button></section>}
      {status === "ready" && data && <>
        {data.excluded > 0 && <p className="expense-warning">Не включено операций с отсутствующей или некорректной суммой: {data.excluded}. Проверьте их в Notion.</p>}
        {data.omittedByCategory > 0 && <p className="expense-caption">Не включено по настройке категории «Include in Reports»: {data.omittedByCategory}.</p>}
        {!bucket ? <section className="panel expense-state"><h2>Расходов за этот месяц нет</h2><p>Выберите другой месяц или добавьте расходы в Notion.</p></section> : <>
          <section className="expense-metrics" aria-label={`Итоги расходов ${currency}`}>
            <article><span>Потрачено · {currency}</span><strong>{amountLabel(bucket.total, currency)}</strong><small>{periodLabel}{month === currentMonth ? " · месяц ещё идёт" : ""}</small></article>
            <article><span>Расходных операций</span><strong>{bucket.count}</strong><small>В выбранной валюте</small></article>
            <article><span>Средняя сумма операции</span><strong>{amountLabel(bucket.count ? bucket.total / bucket.count : 0, currency)}</strong><small>Расходы ÷ число операций</small></article>
          </section>
          <section className="expense-highlights" aria-label="Особенности месяца">
            <article><span>В среднем за день</span><b>{amountLabel(bucket.days.length ? bucket.total / bucket.days.length : 0, currency)}</b><small>За {bucket.days.length} календарных дней, включая дни без операций</small></article>
            <article><span>Самый затратный день</span><b>{peakDay && peakDay.amount > 0 ? dateLabel(peakDay.date) : "Нет расходов"}</b><small>{amountLabel(peakDay?.amount ?? 0, currency)} · {shareLabel(peakDay?.amount ?? 0)} расходов</small></article>
            <article><span>Дней без расходных операций</span><b>{bucket.days.filter(day => day.count === 0).length} из {bucket.days.length}</b><small>По записям Notion в выбранной валюте</small></article>
          </section>
          {(bucket.review > 0 || currency === "Без валюты") && <p className="expense-warning">{bucket.review > 0 ? `В итогах есть операции без статуса «Готово»: ${bucket.review}. ` : ""}{currency === "Без валюты" ? "У этих операций не указана валюта — их итог может быть несопоставим." : ""}</p>}
          <section className="panel expense-daily">
            <div className="expense-section-heading"><h2>{chartMode === "daily" ? "Расходы по дням" : "Расходы нарастающим итогом"}</h2><div className="expense-switch" role="group" aria-label="Вид графика"><button aria-pressed={chartMode === "daily"} onClick={() => setChartMode("daily")}>По дням</button><button aria-pressed={chartMode === "cumulative"} onClick={() => setChartMode("cumulative")}>С начала месяца</button></div></div><p className="expense-caption">{periodLabel} · {currency} · {chartMode === "daily" ? "Расходы каждого дня" : "Общая сумма с 1-го числа по выбранный день"}. Нажмите на столбец для деталей.</p>
            <div className="expense-chart-scroll">
              <div className="expense-chart" style={{ minWidth: Math.max(320, bucket.days.length * 50 + 80) }}>
                <div className="expense-axis" aria-hidden="true"><span>{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(dailyMax)}</span><span>{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(dailyMax / 2)}</span><span>0</span></div>
                <div className="expense-columns">{bucket.days.map(day => <button key={day.date} className={selectedDay === day.date ? "selected" : ""} aria-pressed={selectedDay === day.date} aria-label={`${dateLabel(day.date)}: ${chartMode === "daily" ? "за день" : "с начала месяца"} ${amountLabel(chartMode === "daily" ? day.amount : day.cumulative, currency)}`} title={`${dateLabel(day.date)}: ${amountLabel(chartMode === "daily" ? day.amount : day.cumulative, currency)}`} onClick={() => setSelectedDay(day.date)}>
                  <span className="expense-bar-slot"><i style={{ height: `${(chartMode === "daily" ? day.amount : day.cumulative) / dailyMax * 100}%` }} /></span><span className="expense-day-label">{Number(day.date.slice(-2))}</span>
                </button>)}</div>
              </div>
            </div>
            <p className="expense-day-detail" aria-live="polite">{focusedDay ? `${dateLabel(focusedDay.date)}: за день ${amountLabel(focusedDay.amount, currency)} · операций: ${focusedDay.count} · с начала месяца ${amountLabel(focusedDay.cumulative, currency)}` : `Сумма за период: ${amountLabel(bucket.total, currency)}`}</p>
          </section>
          <div className="expense-breakdowns">
          <section className="panel expense-merchants">
            <div className="expense-section-heading"><h2>Магазины и получатели</h2><div className="expense-switch" role="group" aria-label="Сортировка магазинов"><button aria-pressed={merchantSort === "amount"} onClick={() => setMerchantSort("amount")}>По сумме</button><button aria-pressed={merchantSort === "count"} onClick={() => setMerchantSort("count")}>По частоте</button></div></div>
            <p className="expense-caption">{periodLabel} · {currency} · {merchants.length} групп. Сети объединены; Wolt — по сервису, не по ресторану.</p>
            <div className="expense-category-list">{(allMerchants ? merchants : merchants.slice(0, 6)).map(item => <div key={item.name} className="expense-category">
              <div><b>{item.name}</b><strong>{merchantSort === "amount" ? amountLabel(item.amount, currency) : `${item.count} оп.`}</strong></div>
              <div className="expense-category-track" aria-hidden="true"><i style={{ width: `${item[merchantSort] / merchantMax * 100}%` }} /></div>
              <small>{merchantSort === "count" ? `${amountLabel(item.amount, currency)} · ` : `${item.count} оп. · `}{shareLabel(item.amount)} расходов · средняя сумма {amountLabel(item.amount / item.count, currency)}</small>
            </div>)}</div>
            {merchants.length > 6 && <button className="expense-more" aria-expanded={allMerchants} onClick={() => setAllMerchants(value => !value)}>{allMerchants ? "Свернуть до 6" : `Показать все (${merchants.length})`}</button>}
            {bucket.merchants.some(item => item.name === "Не указан") && <p className="expense-caption">«Не указан» — расходы без заполненного магазина в Notion; они включены в итог.</p>}
          </section>
          <section className="panel expense-categories">
            <h2>Расходы по категориям</h2><p className="expense-caption">{periodLabel} · {currency} · Доля от всех расходов в этой валюте</p>
            <div className="expense-category-list">{bucket.categories.map(item => <div key={item.name} className="expense-category">
              <div><b>{item.name}</b><strong>{amountLabel(item.amount, currency)}</strong></div>
              <div className="expense-category-track" aria-hidden="true"><i style={{ width: `${bucket.total > 0 ? item.amount / bucket.total * 100 : 0}%` }} /></div>
              <small>{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bucket.total > 0 ? item.amount / bucket.total * 100 : 0)}% · операций: {item.count}</small>
            </div>)}</div>
          </section>
          </div>
          <section className="panel expense-largest">
            <h2>Крупнейшие расходы месяца</h2><p className="expense-caption">{periodLabel} · {currency} · До 10 операций по убыванию суммы. Нажмите, чтобы открыть запись в Notion.</p>
            <ol className="expense-purchases">{bucket.largest.map((item, index) => <li key={item.id}>
              <span className="expense-rank">{index + 1}</span><div><a href={`https://www.notion.so/${encodeURIComponent(item.id.replaceAll("-", ""))}`} target="_blank" rel="noreferrer">{item.title}</a><small>{dateLabel(item.date)} · {item.merchant} · {item.category}</small></div><strong>{amountLabel(item.amount, currency)}<small>{shareLabel(item.amount)} расходов</small></strong>
            </li>)}</ol>
          </section>
        </>}
        <p className="expense-source">Источник: <a href={sourceUrl} target="_blank" rel="noreferrer">операции Notion</a> · Обновлено {new Date(data.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Belgrade", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · Время Белграда</p>
      </>}
    </div>
  </div>;
}
