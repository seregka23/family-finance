# Monthly expense dashboard

The public `/api/expenses?month=YYYY-MM` endpoint returns a valid empty monthly
report without consulting an external database. Invalid month inputs return 400.
Calendar dates use Europe/Belgrade; currencies remain separate.

The UI retains daily and cumulative expenses, merchant and category breakdowns,
largest expenses, and monthly highlights. With no records it shows an empty state.
Domain aggregation tests use synthetic records to verify currency isolation,
merchant grouping, calendar boundaries, and cumulative totals.
