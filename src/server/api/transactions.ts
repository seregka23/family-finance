import { requireAccess, tokenHash } from '../auth';
import { validDate } from '../../app/models/finance-ui-model';
import { json, MAX_REPORT_MINOR, query, unavailable, type FinanceDatabase } from '../database';
import { readWriteBody } from '../write-request';

const fields = new Set([
  'requestId',
  'operationType',
  'title',
  'amount',
  'currency',
  'operationDate',
  'operationTime',
  'accountId',
  'categoryId',
  'merchant',
  'note'
]);
const invalid = () => json({ error: 'Проверьте данные операции.' }, 400);
function boundedText(value: unknown, max: number, required = false): string | null {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= max &&
    (!required || text.length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    ? text
    : null;
}
function optionalId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  const text = boundedText(value, 128, true);
  return text === null ? undefined : text;
}
export async function POST(request: Request, database?: FinanceDatabase): Promise<Response> {
  const user = await requireAccess(request, database);
  if (user instanceof Response) return user;
  const body = await readWriteBody(request);
  if (body instanceof Response) return body;
  if (Object.keys(body).some((key) => !fields.has(key))) return invalid();
  const id = typeof body['requestId'] === 'string' ? body['requestId'].toLowerCase() : '';
  const operationType = body['operationType'];
  const currency = body['currency'];
  const title = boundedText(body['title'], 200, true),
    merchant = boundedText(body['merchant'], 200),
    note = boundedText(body['note'], 2000);
  const accountId = optionalId(body['accountId']),
    categoryId = optionalId(body['categoryId']);
  const date = body['operationDate'],
    time = body['operationTime'] === undefined ? '' : body['operationTime'];
  const amount = typeof body['amount'] === 'string' ? body['amount'].trim() : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ||
    typeof operationType !== 'string' ||
    !['Расход', 'Доход'].includes(operationType) ||
    typeof currency !== 'string' ||
    !['RSD', 'EUR', 'USD', 'RUB'].includes(currency) ||
    title === null ||
    merchant === null ||
    note === null ||
    accountId === undefined ||
    categoryId === undefined ||
    typeof date !== 'string' ||
    !validDate(date) ||
    !/^[1-9]\d{3}-/.test(date) ||
    typeof time !== 'string' ||
    (time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
    !/^\d{1,12}(?:[.,]\d{1,2})?$/.test(amount)
  )
    return invalid();
  const [whole, fraction = ''] = amount.replace(',', '.').split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(MAX_REPORT_MINOR)) return invalid();
  const normalized = {
    operationType,
    title,
    amountMinor: Number(minor),
    currency,
    operationDate: date,
    operationTime: time,
    accountId,
    categoryId,
    merchant,
    note,
    createdBy: user.id
  };
  let stage = 'idempotency_lookup';
  try {
    const fingerprint = await tokenHash(JSON.stringify(normalized));
    const existing = await query(
      database!,
      'SELECT created_by,request_fingerprint FROM operations WHERE id=?',
      [id]
    );
    const retry = (row: (typeof existing)[number]) =>
      row['created_by'] === user.id && row['request_fingerprint'] === fingerprint
        ? json({ id, created: false })
        : json({ error: 'Этот идентификатор уже использован для другой операции.' }, 409);
    if (existing[0]) return retry(existing[0]);
    stage = 'reference_validation';
    if (accountId) {
      const rows = await query(
        database!,
        'SELECT id FROM accounts WHERE id=? AND active=1 AND currency=?',
        [accountId, String(currency)]
      );
      if (!rows.length) return invalid();
    }
    if (categoryId) {
      const rows = await query(database!, 'SELECT id FROM categories WHERE id=?', [categoryId]);
      if (!rows.length) return invalid();
    }
    stage = 'insert';
    const inserted = await database!
      .prepare(
        `INSERT INTO operations(id,operation_type,title,merchant,amount_minor,currency,operation_date,operation_time,category_id,account_id,source,status,participant,note,entry_method,created_by,created_at,request_fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?,?,'SMS','Готово','Семья',?,'manual',?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id`
      )
      .bind(
        id,
        String(operationType),
        title,
        merchant,
        Number(minor),
        String(currency),
        date,
        time,
        categoryId,
        accountId,
        note,
        user.id,
        Math.floor(Date.now() / 1000),
        fingerprint
      )
      .all<{ id: string }>();
    if (!inserted.success || !Array.isArray(inserted.results)) throw new Error('Insert failed');
    if (inserted.results.length === 1) return json({ id, created: true }, 201);
    const raced = await query(
      database!,
      'SELECT created_by,request_fingerprint FROM operations WHERE id=?',
      [id]
    );
    if (!raced[0]) throw new Error('Missing transaction after conflict');
    return retry(raced[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/Manual transaction monthly total exceeds reporting limit/.test(message))
      return json({ error: 'Сумма операций за месяц выходит за допустимый диапазон.' }, 409);
    if (/Manual transaction availability exceeds reporting limit/.test(message))
      return json({ error: 'Доступный остаток счёта выходит за допустимый диапазон.' }, 409);
    if (/Manual transaction balance exceeds reporting limit/.test(message))
      return json({ error: 'Баланс счёта выходит за допустимый диапазон.' }, 409);
    if (
      /Manual transaction account invalid|Currency mismatch|FOREIGN KEY constraint failed/.test(
        message
      )
    )
      return invalid();
    console.error(
      JSON.stringify({ event: 'transaction_failure', stage, code: 'database_failure' })
    );
    return unavailable();
  }
}
