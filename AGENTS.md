# Development orchestration

## Source of truth

The feature task supplied by the user is the source of truth. By default it is
`specs/tasks.md`. Do not replace it with a new plan. Resolve only missing
implementation details needed to complete its acceptance criteria.

## Orchestrator protocol

For every parent task and unfinished subtask:

1. Read the task, affected code, dependencies, and acceptance criteria.
2. Identify backend, frontend, testing, and review work.
3. Define or confirm the API/data contract before frontend implementation
   depends on it.
4. Delegate independent bounded work to the appropriate specialised agent.
   Do not run agents concurrently when they will edit the same files.
5. Collect concise results: changed files, checks run, failures, and open risks.
6. Ask `tester` to add or update the tests required by the acceptance criteria.
7. Run applicable project checks.
8. Ask `reviewer` to compare the task, implementation, tests, and diff.
9. Route review failures to the responsible agent and repeat validation.
10. Update the task only after acceptance criteria, checks, and review pass.

## Delegation policy

- Use `backend` for APIs, database schema/migrations, business rules, auth,
  integrations, and backend tests.
- Use `frontend` for views, components, client state, accessibility, and API
  integration in the UI.
- Use `tester` for test strategy and missing unit, integration, or end-to-end
  coverage derived from the task. It may change test fixtures and test tooling,
  but must not change product behaviour to make tests pass.
- Use `reviewer` after implementation and testing. It is read-only by default:
  it reports missing criteria, regressions, security risks, and insufficient
  coverage. The orchestrator assigns corrections to another agent.

## Completion gate

Never mark a task complete unless:

- every explicit acceptance criterion is evidenced by the implementation;
- relevant tests were added or updated and pass;
- lint, typecheck, build, and project-specific checks pass when available;
- the reviewer reports no unresolved blocking issue;
- `specs/tasks.md` records the result and remaining non-blocking risks.

## Stop conditions

Stop and ask the user when acceptance criteria conflict, a required product
decision is absent, credentials or a production action are needed, or the task
requires a destructive data migration without an approved rollback plan.

## Project commands

- Install dependencies: `npm install`
- Lint/type-check all workspace apps: `npm run lint`
- Build all workspace apps: `npm run build`
- Test all workspace apps: `npm test`
- Start the NestJS backend: `npm run start:api`
- Start the Angular frontend: `npm run start:web`

Run project commands from the repository root after dependency installation.
`npm run lint`, `npm test`, and `npm run build` cover both the NestJS backend
and Angular frontend scaffolds where applicable. The current scaffold does not
include Supabase, authentication, RLS, or other external service validation, so
these baseline commands and local start commands do not require Supabase local
services or application environment variables.
