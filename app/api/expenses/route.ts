import { NextResponse } from "next/server";
import { isEmailAllowed } from "../../access-control";
import { getChatGPTUser } from "../../chatgpt-auth";
import { aggregateExpenses, monthBounds, type ExpenseRow } from "../../expense-model";
import { categoryFor, categoryMap, type NotionPage } from "../../notion-finance-model";

const SOURCE = "d67250ad-1388-41bf-a0bb-4d7b588aea66";
const CATEGORIES_SOURCE = "8d8dd025-16f8-424b-9386-ee16b1aa3095";
type TextPart = { plain_text?: string; text?: { content: string } };
type Property = { select?: { name: string } | null; number?: number | null; date?: { start: string } | null; title?: TextPart[]; rich_text?: TextPart[]; relation?: Array<{ id: string }> };
type Page = { id: string; url: string; archived?: boolean; in_trash?: boolean; properties: Record<string, Property> };
const plainText = (parts?: TextPart[]) => parts?.map(part => part.plain_text ?? part.text?.content ?? "").join("") ?? "";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isEmailAllowed(user.email)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  let bounds;
  try { bounds = monthBounds(month); }
  catch { return NextResponse.json({ error: "Invalid month" }, { status: 400 }); }
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: "Data source unavailable" }, { status: 503 });
  try {
    // A padded window captures timestamps crossing UTC midnight; aggregation
    // then applies exact Belgrade calendar boundaries (date-only values stay as is).
    const from = new Date(`${bounds.from}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const next = new Date(`${bounds.next}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const rows: ExpenseRow[] = [];
    const sourcePages: Page[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    const timeout = AbortSignal.timeout(60000);
    do {
      const response = await fetch(`https://api.notion.com/v1/data_sources/${SOURCE}/query`, {
        method: "POST", cache: "no-store", signal: timeout,
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2025-09-03", "Content-Type": "application/json" },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
          filter: { and: [
            { property: "Тип", select: { equals: "Расход" } },
            { property: "Дата", date: { on_or_after: from.toISOString().slice(0, 10) } },
            { property: "Дата", date: { before: next.toISOString().slice(0, 10) } },
          ] }, sorts: [{ property: "Дата", direction: "ascending" }] }),
      });
      if (!response.ok) throw new Error(`Notion status ${response.status}`);
      const page = await response.json() as { results: Page[]; has_more: boolean; next_cursor: string | null };
      for (const item of page.results) {
        const p = item.properties;
        if (item.archived || item.in_trash || p["Тип"]?.select?.name !== "Расход") continue;
        sourcePages.push(item);
      }
      cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
      if (page.has_more && (!cursor || cursors.has(cursor))) throw new Error("Incomplete pagination");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const categoryResponse = await fetch(`https://api.notion.com/v1/data_sources/${CATEGORIES_SOURCE}/query`, {
      method: "POST", cache: "no-store", signal: timeout,
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2025-09-03", "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100 }),
    });
    if (!categoryResponse.ok) throw new Error(`Notion categories status ${categoryResponse.status}`);
    const categoryPayload = await categoryResponse.json() as { results: NotionPage[] };
    const categories = categoryMap(categoryPayload.results);
    for (const item of sourcePages) {
      const p = item.properties;
      const resolvedCategory = categoryFor(p, categories);
      rows.push({ id: item.id, date: p["Дата"]?.date?.start ?? "", amount: p["Сумма списания"]?.number ?? null,
        currency: p["Валюта списания"]?.select?.name ?? p["Валюта бюджета"]?.select?.name ?? "",
        category: resolvedCategory.name, includeInReports: resolvedCategory.meta?.includeInReports,
        review: p["Статус разбора"]?.select?.name !== "Готово",
        merchant: plainText(p["Магазин или получатель"]?.rich_text), title: plainText(p["Операция"]?.title) });
    }
    return NextResponse.json(aggregateExpenses(rows, month), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Never return a successful partial-month total when a later page fails.
    return NextResponse.json({ error: "Не удалось загрузить весь месяц. Попробуйте обновить данные." }, { status: 502 });
  }
}
