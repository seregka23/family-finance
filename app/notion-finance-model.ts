export type NotionProperty = {
  title?: Array<{ plain_text?: string; text?: { content?: string } }>;
  rich_text?: Array<{ plain_text?: string; text?: { content?: string } }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  number?: number | null;
  formula?: { number?: number | null };
  date?: { start?: string } | null;
  checkbox?: boolean;
  relation?: Array<{ id: string }>;
  rollup?: { number?: number | null };
};

export type NotionPage = { id: string; url: string; archived?: boolean; in_trash?: boolean; properties: Record<string, NotionProperty> };

export type CategoryMeta = {
  id: string;
  name: string;
  type: string;
  section: string;
  planningMode: string;
  active: boolean;
  includeInReports: boolean;
};

export const propertyText = (property?: NotionProperty) => {
  const parts = property?.title ?? property?.rich_text;
  if (parts) return parts.map(part => part.plain_text ?? part.text?.content ?? "").join("");
  return property?.select?.name ?? property?.status?.name ?? "";
};

export const propertyNumber = (property?: NotionProperty) => property?.number ?? 0;
export const propertyDate = (property?: NotionProperty) => property?.date?.start ?? "";
export const relationIds = (property?: NotionProperty) => property?.relation?.map(item => item.id) ?? [];

export function categoryMap(pages: NotionPage[]) {
  return new Map(pages.map(page => {
    const properties = page.properties;
    return [page.id, {
      id: page.id,
      name: propertyText(properties.Name) || "Без категории",
      type: propertyText(properties.Type),
      section: propertyText(properties.Section),
      planningMode: propertyText(properties["Planning Mode"]),
      active: properties.Active?.checkbox !== false,
      includeInReports: properties["Include in Reports"]?.checkbox !== false,
    } satisfies CategoryMeta] as const;
  }));
}

export function categoryFor(properties: Record<string, NotionProperty>, categories: Map<string, CategoryMeta>) {
  const id = relationIds(properties.Category)[0] ?? "";
  const meta = categories.get(id);
  return { id, meta, name: meta?.name || propertyText(properties["Категория"]) || "Прочее" };
}

export function sectionLabel(value: string) {
  const labels: Record<string, string> = {
    Mandatory: "Обязательные расходы",
    Flexible: "Гибкие расходы",
    "Savings & Goals": "Сбережения и цели",
    Income: "Доход",
  };
  return labels[value] ?? value;
}

export const categoryKey = (id: string, name: string) => id ? `id:${id}` : `name:${name.toLocaleLowerCase("ru")}`;
