# Notion data contract

Updated for the category-centered Family Budget structure on 2026-09-14.

## Sources

- Operations: `d67250ad-1388-41bf-a0bb-4d7b588aea66`
- Categories: `8d8dd025-16f8-424b-9386-ee16b1aa3095`
- Category budgets: `0e6a8ec5-32cd-4634-847c-43bc8902d27e`
- Accounts: `46e0c2f3-b40c-4330-855a-6fc7ec0a4530`
- Receipt items: `db5f05fe-7e45-45cf-9d2a-a3a80edafe64`
- Financial goals: `79f3cb73-44ae-4e53-9958-06c7f850d6c6`

## Category resolution

`Operations.Category` and `Category budgets.Category` point to `Categories`.
The displayed category is `Categories.Name`; its section comes from `Section`,
planning behavior from `Planning Mode`, and dashboard eligibility from
`Include in Reports`. The legacy select property `Категория` remains a fallback
while old operations are migrated. A populated relation always takes priority.

The plan column is derived from the current month's category-budget row. A
direct `Строка бюджета` relation remains a legacy fallback. Plan actuals are
calculated from all expense operations in the plan month, matched by category
and currency. This supports both relation-backed and legacy category records;
`Факт вручную` still takes priority when its checkbox is enabled.

English category section values are displayed with the existing Russian UI
labels: Mandatory, Flexible, Savings & Goals, and Income.
