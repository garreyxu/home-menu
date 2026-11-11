# home-menu

御膳房 is a small web app for planning a family's weekly meals, with a Chinese interface. The repository is public (MIT). It is hosted on Vercel Hobby with a Neon Postgres database. Sign-in is one shared family username and password from environment variables; there is no users table. The home page is the dish wall: active dishes, filtered by category.

Changes are listed in [CHANGELOG.md](CHANGELOG.md). Design notes are in [docs/](docs/).

## Screenshots

Screenshots will be added here; no screenshots are included in this cleanup.

## Quick start with sample data

- Node.js 22.23.4 (see `.nvmrc`). `package.json` `engines` requires Node.js `>=22.23.4`.
- pnpm 10.33.4 (see the `packageManager` field in `package.json`).

```bash
pnpm install
cp .env.example .env.local   # set the auth variables below; set DATABASE_URL when you have a database
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Until you sign in, pages redirect to `/login`. The home page lists dishes by category. If `SESSION_SECRET` is missing or shorter than 32 characters, the server refuses every request with a generic 500 instead of signing a session. The server log says whether the secret is missing or too short and records its length only.

End-to-end tests need the Chromium browser that Playwright downloads:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` starts the dev server itself. To point Playwright at an already running site, set `PLAYWRIGHT_BASE_URL`. When that variable is set, Playwright does not start a local server. The `preview-e2e` workflow sets it to the Vercel preview URL.

## Scripts

| Script       | Command           | Purpose                                                                                                                                                     |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`        | `pnpm dev`        | Start the Next.js dev server                                                                                                                                |
| `build`      | `pnpm build`      | Migrate when a database URL is set, seed on Vercel preview only, then `next build`                                                                          |
| `start`      | `pnpm start`      | Serve the production build                                                                                                                                  |
| `db:migrate` | `pnpm db:migrate` | Apply `drizzle/` migrations with `DATABASE_URL_UNPOOLED`, or `DATABASE_URL` if that is unset                                                                |
| `db:seed`    | `pnpm db:seed`    | Insert sample categories and dishes without duplicating names. Uses `DATABASE_URL`, then `DATABASE_URL_UNPOOLED`. Refuses when `VERCEL_ENV` is `production` |
| `lint`       | `pnpm lint`       | ESLint                                                                                                                                                      |
| `typecheck`  | `pnpm typecheck`  | Generate Next.js route types, then `tsc --noEmit`                                                                                                           |
| `format`     | `pnpm format`     | Format the repo with Prettier                                                                                                                               |
| `test`       | `pnpm test`       | Unit tests (Vitest). They do not connect to a database                                                                                                      |
| `test:e2e`   | `pnpm test:e2e`   | End-to-end smoke test (Playwright, Chromium)                                                                                                                |
| `auth:hash`  | `pnpm auth:hash`  | Read a password from stdin (no echo, never from argv) and print a bcrypt hash for `AUTH_PASSWORD_HASH`                                                      |

## Workflow and design documentation

See [the reusable team workflow](docs/workflow.md) and [design documentation](docs/design/README.md).

## Timezone

Calendar weeks use `WEEK_TIME_ZONE` in `src/server/week.ts`, currently `America/Los_Angeles`. There is no timezone environment variable. Sync timestamps use the same zone in `src/lib/sync-note.ts`; seasonal display defaults to it in `src/lib/season.ts`. Configure these constants together if adapting the app to another timezone.

## Deploy (Vercel + Neon free tier)

Import your fork into Vercel Hobby and connect a Neon free-tier Postgres project. Set `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct), plus the auth variables below, for Production and Preview. Use `pnpm build`; it runs migrations when a database is configured and seeds only preview deployments. Production is never seeded automatically. Configure your Neon project id (repo variable `NEON_PROJECT_ID`) in GitHub Actions, and `NEON_API_KEY` as a repository secret for Neon operations. Keep preview and production credentials separate.

## Tests

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Run `pnpm build` to verify a production build. For browser tests, install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. Authenticated tests need the environment described under Family login; database-backed tests also require an isolated test database. CI gates are `checks` and `preview-e2e`.

## Design

The UI source of truth is [docs/design/design-spec-izakaya.md](docs/design/design-spec-izakaya.md). It replaces the visual part of [docs/design/design-spec-pixel-seaside.md](docs/design/design-spec-pixel-seaside.md). Information architecture is [docs/design/ia-and-flows.md](docs/design/ia-and-flows.md). When a concept mockup disagrees with the design spec, follow the spec.

Frames, seals, and the paper texture are CSS and small SVG files in `public/frames`. Colors are Tailwind theme tokens (`washi`, `paper`, `paper-shade`, `rule`, `sumi`, `sumi-soft`, `shu`, `shu-deep`, `ai`, `matcha`, `shu-orange`, `kaki`, `sakura`). `shu-orange`, `kaki`, and `sakura` are decoration only.

## Fonts

Dish names, page titles, category names, and week headers use Ma Shan Zheng (OFL) through `next/font/google`, weight 400, `preload: false`. Google serves the Chinese slices by unicode-range. Body text, numbers, and buttons use Noto Sans SC at 400, 500, and 700. Buttons are weight 700. The brush face is not used below 18px.

## Family login

The whole site is private behind one shared username and password. Credentials are read from the environment only:

| Variable             | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `AUTH_USERNAME`      | Shared username. It is matched exactly.                                                             |
| `AUTH_PASSWORD_HASH` | bcrypt hash of the shared password. Do not put the plaintext password here.                         |
| `SESSION_SECRET`     | Signs the session cookie. Must be at least 32 characters. A missing or shorter secret fails closed. |

Generate the password hash with `pnpm auth:hash`. The password is read from stdin and is not echoed. Do not pass it as an argument. A trailing newline on a piped password is removed. The command prints only the hash:

```bash
pnpm auth:hash
```

Generate a session secret:

```bash
openssl rand -base64 48
```

The session cookie is httpOnly, `SameSite=Lax`, `Secure` in production, and expires after 30 days. Signing uses an HS256 JWT (`jose`); the proxy checks that signature and does not run bcrypt. Logout is POST `/logout` only, so an image tag cannot clear the cookie.

The proxy runs for every path except `/_next/static`, `/_next/image`, `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/icon-512.png`, `/assets/`, `/frames/`, and `/illustrations/`. Dish illustrations, ink frames, and the site icons are public files. `/api/*` is always included, including paths that end in an image or script extension.

The proxy is the outer gate, not the only one. Every Server Action, route handler, and server component that reads data must call `requireSession()` from `src/lib/auth/require-session.ts`. Route handlers that respond with JSON use `requireApiSession()` and return that 401 response when it is not null. Do not rely on the proxy alone. The login action and POST `/logout` are the exceptions, because they run before a session exists. The home page calls `requireSession()`.

Five failed logins from one IP inside a 15-minute window lock that IP for 15 minutes, counted from the fifth failure. A failure stops counting once it is 15 minutes old, and a successful login clears the counter. The counter is in memory on that server instance only. It resets on restart and is not shared across instances.

End-to-end tests that sign in read `E2E_USERNAME` and `E2E_PASSWORD`. They are skipped when either variable is unset. The dev server still needs `AUTH_USERNAME` (the same username), `AUTH_PASSWORD_HASH` (the hash of `E2E_PASSWORD`), and `SESSION_SECRET`. The `ci` job generates a throwaway password, bcrypt hash, and session secret at runtime and does not store them. `preview-e2e` passes the `E2E_USERNAME` and `E2E_PASSWORD` GitHub Actions secrets and skips login tests when they are absent. The preview deployment itself needs the three auth variables above.

## Deploying auth

Set `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, and `SESSION_SECRET` on the Vercel project for both Production and Preview before merging. If any of them is missing, `SESSION_SECRET` is shorter than 32 characters, or `AUTH_PASSWORD_HASH` is not a 60-character `$2a$` / `$2b$` / `$2y$` bcrypt hash, the deployed site returns a generic 500. The server log names the failed check (missing, wrong prefix, or wrong length for the hash; missing or too short, with the length only, for the secret) and does not include the hash, the username, or the secret.

Preview must use a different username and password from production. Put that preview pair in the GitHub Actions secrets `E2E_USERNAME` and `E2E_PASSWORD`. Do not reuse the production password there.

## Data model

Postgres tables live in `src/server/db/schema.ts`. Ids are UUIDs (`gen_random_uuid()`).

| Table              | Columns                                                                                                                                                                                                                               | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`       | `id`, `name`, `sort_order`, `created_at`                                                                                                                                                                                              | `name` is unique. `sort_order` is the wall order and is rewritten on each Notion sync                                                                                                                                                                                                                                                                                                                                                                                     |
| `dishes`           | `id`, `notion_page_id`, `name`, `category_id`, `description`, `photo_key`, `cook_time`, `ingredients`, `rating`, `tried`, `cuisines`, `main_ingredient`, `body`, `recipe_blocks`, `has_body`, `is_active`, `created_at`, `updated_at` | `notion_page_id` is unique and nullable, and is the stable key for a dish. `photo_key` is nullable and unused. `tried` mirrors Notion 「已尝试?」. `recipe_blocks` is the normalized page body shown in the site, and is null until a sync or seed writes it. `has_body` is true when the dish was imported with cooking steps. `is_active` is false when a previously imported dish no longer has steps, or was deleted in Notion, and a weekly menu still references it |
| `notion_sync_runs` | progress and the last sync report                                                                                                                                                                                                     | At most one row can be `running`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `weekly_menus`     | `id`, `week_start`, `created_at`                                                                                                                                                                                                      | `week_start` is a unique `date` and must be a Sunday (`extract(dow from week_start) = 0`)                                                                                                                                                                                                                                                                                                                                                                                 |
| `menu_items`       | `id`, `weekly_menu_id`, `day_of_week`, `meal`, `dish_id`, `created_at`                                                                                                                                                                | `day_of_week` is 0–6 (0 = Sunday). `meal` is `breakfast`, `lunch`, or `dinner`. Unique on `(weekly_menu_id, day_of_week, meal, dish_id)`. Deleting a week deletes its items                                                                                                                                                                                                                                                                                               |

Two phones can add the same dish at once: the insert uses `ON CONFLICT DO NOTHING`, so the row is kept once. Removing a dish from a slot deletes that row.

The server client is `getDb()` in `src/server/db/index.ts`. It reads `DATABASE_URL` (the Neon pooled URL) and is marked `server-only`. Query helpers in `src/server/menu.ts`:

- `listCategoriesWithDishes()` — categories by `sort_order`, each with its dishes (including inactive) by name.
- `listDishesByCategory()` — categories by `sort_order`, each with active dishes. A card uses `public/illustrations/<notionPageId>-<240|480|960>.webp` when `src/generated/illustrations.json` lists that id. `notionPageId` is the Notion page id with dashes removed and letters lowercased. A null id (sample seeds) or a missing file uses the brush-name fallback. The manifest is rewritten from `public/illustrations` when Next starts, so a card never requests a file that was absent at build time. When `DATABASE_URL` is unset and `VERCEL_ENV` is unset, this returns the sample catalog from `src/server/db/seed-data.ts` so local dev and CI can render without Neon. On Vercel (`VERCEL_ENV` set to any value), a missing `DATABASE_URL` throws and is logged. A configured database is the source of truth.
- `getOrCreateWeek(weekStart)` — `weekStart` is a `YYYY-MM-DD` Sunday.
- `addMenuItem({ weekStart, dayOfWeek, meal, dishId })` — creates the week if needed, then inserts. A conflicting row is left in place.
- `removeMenuItem({ weekStart, dayOfWeek, meal, dishId })` — deletes that row.
- `getWeek(weekStart)` — the week and its items, or `null` if that Sunday has no menu yet.
- `toWeekStart(date)` — the Sunday of that instant in `America/Los_Angeles`, as `YYYY-MM-DD`.

Migrations are generated with `pnpm exec drizzle-kit generate` and committed under `drizzle/`. `pnpm db:migrate` runs `drizzle-kit migrate`.

`pnpm build` is the command Vercel should run. `vercel.json` sets `buildCommand` to `pnpm build` because the Next.js preset would otherwise run `next build` and skip migrations. Functions run in `pdx1`, the same region as the Neon database in Oregon, so sync writes are not cross-country round trips. When neither `DATABASE_URL_UNPOOLED` nor `DATABASE_URL` is set, the build logs `[db] Skipping migrations: ...` and continues, so CI can build without a database. When a URL is set, the build applies migrations. It then seeds only if `VERCEL_ENV` is `preview`. Production builds migrate and do not seed. Migrations themselves never insert dishes. `pnpm db:seed` also refuses `VERCEL_ENV=production`, and it skips a database that already has Notion dishes so a later preview build cannot put the samples back.

Scripts read `.env*` files the same way Next.js does and never print connection strings. On Vercel, the Neon integration's environment variables are already set and take precedence.

## Notion import setup

Create a read-only Notion integration and share your recipe database with it. Set `NOTION_TOKEN`, `NOTION_DATABASE_ID`, and `NOTION_DATA_SOURCE_ID` in local or deployment environment settings. These are required when syncing, with no identifier defaults. The app can boot and build without them using local sample data. Set `CRON_SECRET` for the scheduled import. Use `pnpm notion:import` for a manual import or the authenticated sync button.

The Recipe database is read-only. The integration never writes to Notion. Every recipe page that has cooking steps is imported, whether or not 「已尝试?」 is checked. The checkbox is stored on the dish as `tried` and shown on the card as 「做过」 when it is true.

The wall category is the select 「主要食材种类」. The category name is the option name Notion returned at sync time, not a translation of 「类型」. A blank value is 其他. Known options stay in this order: 猪, 牛, 鸡, 羊, 海鲜, 米饭, 面条, 素菜, 豆制品, 蛋制品, 汤, 饼, 早餐, 酱汁, 其他. An option that is not in that list is still shown. It is placed immediately before 其他, in the select's own option order, so a new Notion option appears on the next sync without a deploy. 「其他」 stays last because it is the catch-all. The nav starts with 全部 and omits a category that has no active dishes. A category row that no dish references is deleted on sync, so a renamed option or an old 「类型」 name does not linger. A page whose body could not be read keeps its previous category until a later sync.

A page has steps when it uses a steps heading, toggle, or property whose name is or ends with 步骤 or 做法, and that section contains at least one real paragraph, list item, to-do, quote, or callout. If the page does not use that structure, any real paragraph, list item, or to-do in the body counts. Images, dividers, and headings do not count. Text that is only a placeholder (待补充, 待写, TODO, TBD, 暂无, 无, "-", "...") does not count. Ingredients do not count as steps. Pages without steps are not imported.

On a later sync, a page that gains steps is added or updated. Unchecking 「已尝试?」 updates `tried` and leaves the dish in place. A page that loses its steps, or is deleted in Notion, is removed. If a weekly menu still references that dish, the row stays and `is_active` becomes false, so the old menu still renders. If nothing references it, the row is deleted.

A page whose blocks or properties could not be fetched is left unchanged and counted as a read failure. If Notion returns no pages, or the run would delete or inactivate more than `max(3, 20%)` of the active imported dishes, that run applies adds and updates but skips every removal. The report then says 「这次要移除的菜太多，先没动，请检查 Notion」 and includes the count that was held back. `pnpm notion:import --allow-mass-removal` is the only way to apply those removals. The sync button and the daily cron never pass that flag.

`notion_page_id` is the stable key for each dish and for its illustration file. The app does not download or store photos. Cards look for `public/illustrations/<notionPageId>-<240|480|960>.webp` and otherwise paint the dish name. Those files are not added by the app.

Each imported page's blocks are stored on `dishes.recipe_blocks` as headings, paragraphs, lists, to-dos, quotes, callouts, dividers, and placeholders for images or embeds. Rich text keeps bold and italic. The site does not store links, so a recipe never points at notion.so. Child lists are paginated, and a list item keeps one level of nested children. Those reads use the same Notion request spacing and 429 retry as the rest of the import. A body is written as soon as that page is read, so a run that stops early still keeps the dishes it finished. A dish with no stored body opens in the site and says 「暂无做法」.

`recipe_blocks` stays null until a sync reads that page's blocks. A sync does not look at `last_edited_time`. It reads bodies for dishes whose `recipe_blocks` is null first, then refreshes the others if time remains. The sync route and the daily cron both set `maxDuration` to 300 seconds. The run itself stops after 240 seconds, which is enough for the current 43 pages at about 2.8 seconds each, and marks anything left as `partial` so the next sync continues. Nothing writes those blocks back to Notion. Preview seeding also stores a short body on 番茄炒蛋, and updates that seed row when it is already present and has no Notion page id. Production builds do not seed.

The sync is one-way: Notion wins. The home page has a 「从 Notion 同步」 button. It stays disabled while a sync is running and then shows how many were imported, how many are marked tried, how many were skipped for having no steps, and the added, updated, deleted, inactivated, and on-wall counts. A daily Vercel Cron calls `GET /api/cron/notion-sync` at 12:00 UTC. That is about 4:00am Pacific Standard Time and 5:00am Pacific Daylight Time. On the Hobby plan the run can land any time during that hour, with timing controlled by the UTC schedule. Hobby cron runs once a day and the function is limited to 300 seconds.

### What to set

| Variable                | Where                                                                                 | Secret? |
| ----------------------- | ------------------------------------------------------------------------------------- | ------- |
| `NOTION_TOKEN`          | Vercel Production and Preview. Optional in `.env.local` for a local import            | Yes     |
| `NOTION_DATABASE_ID`    | Required for sync. Your recipe database id                                            | No      |
| `NOTION_DATA_SOURCE_ID` | Required for sync. Your recipe data-source id                                         | No      |
| `CRON_SECRET`           | Vercel Production. At least 16 characters. Vercel sends it as `Authorization: Bearer` | Yes     |
| `DATABASE_URL`          | Already required for the app                                                          | Yes     |

CI does not call Notion. When `DATABASE_URL` and `NOTION_TOKEN` are unset, the app keeps using the committed sample catalog.

### First import

1. Share the Recipe database with the read-only Notion integration.
2. Set the variables above and deploy, so the migration runs.
3. Sign in and click 「从 Notion 同步」, or from a machine that has the env vars run `pnpm notion:import`.
4. The command and the button print the same report: imported, tried, no steps, read failures, seeds retired, added, updated, deleted, inactivated, skipped and why, and on-wall. Pages without steps and pages that failed to read are listed by title and Notion link. The page body is not printed.

The daily cron starts after that. Clicking the button again is safe: dishes are matched by Notion page id and are not duplicated.

## CI

- `pr-status-comment` keeps one bot comment on each open same-repository PR with the current head commit, `checks`, `preview-e2e`, and `Vercel` results. It refreshes after either CI workflow completes or via a manual run with no inputs, uses only the default token, and never checks out PR code. Fork PRs are skipped; previous-head results are marked 过时, and unchanged results keep their update time. Automatic `workflow_run` activation requires the workflow on `main`; manual dispatch also requires it to be registered on the default branch. Run `node scripts/pr-status-comment-dry-run.mjs` for a local sample and behavior checks. Real bot posting is verified on the next PR after merge; the new workflow cannot run on this PR before merge.

- `ci` (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`. Its job `checks` is the required status check: lint, typecheck, unit tests, the production build, and Playwright against the local dev server.
- `preview-e2e` (`.github/workflows/preview-e2e.yml`) runs when Vercel sends a `vercel.deployment.success` repository dispatch whose `client_payload.environment` is `preview`, checks out `client_payload.git.sha`, and runs Playwright against that preview URL. It posts a `preview-e2e` commit status on that sha and is not a required check. The dispatch trigger takes effect only after this workflow is merged to `main`, and only if Vercel is sending `repository_dispatch` events; `workflow_dispatch` with inputs `url` and `sha` can run it before that.

`preview-e2e` reads these GitHub Actions secret names when they are set: `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, and `E2E_PASSWORD`. Missing secrets do not affect `checks`. Login tests in that workflow are skipped when `E2E_USERNAME` or `E2E_PASSWORD` is absent. The `checks` job generates its own throwaway auth values when it runs Playwright and does not commit them.

## Neon operations

Backups and the Notion sync report run from GitHub Actions. The workflow is [`.github/workflows/neon-ops.yml`](.github/workflows/neon-ops.yml). It is manual: open Actions, choose neon-ops, and run the workflow. The default action is `sync-report`. `snapshot` creates a Neon branch and must be chosen explicitly. The run reads the `NEON_API_KEY` secret and uses your Neon project id (repo variable `NEON_PROJECT_ID`). It checks out the repo with `contents: read`. The API key, the connection string, and the database password are masked and are not printed.

`snapshot` finds the project's default/primary branch through the Neon API and creates a child branch named `backup-YYYYMMDD-HHMM` (UTC). It does not create a compute endpoint. `expires_days` is used only by this action. The default is 7. `0` omits `expires_at`, so the branch does not expire. An integer from 1 to 30 sends `expires_at` as UTC now plus that many days. Any other value fails before the script calls Neon. The job summary still prints the `expires_at` value from the create response.

The Free plan allows 10 branches per project, and preview databases share that limit. A backup that never expires keeps one of those 10, so the default is 7 days. `0` is the explicit choice to keep a branch.

The preview cleanup workflow deletes a Neon branch only when its name starts with `preview/`, and the delete path refuses every other name. `backup-YYYYMMDD-HHMM` does not start with `preview/`, so cleanup leaves it in place. The neon-ops self-test checks that by grepping the refusal text in `.github/scripts/neon-preview-cleanup.sh` (`refusing to delete non-preview Neon branch` and `name does not start with preview/`). Changing that message on purpose breaks neon-ops until both scripts are updated. This workflow creates a branch. It does not call Neon's snapshot API, so it does not use the Free plan's single manual snapshot.

`sync-report` requests the production connection URI from the Neon API and runs two fixed queries inside a read-only transaction. The job summary lists the last 10 `notion_sync_runs` rows and the count of imported dishes (`notion_page_id` is not null) grouped by `is_active`. There is no SQL input. Booleans are printed as psql's `t` and `f`.

The workflow is available from the Actions tab after it is on `main`.

## License

MIT. See [LICENSE](./LICENSE).

### E2E data

Playwright assigns one `E2E_RUN_ID` before workers start (GitHub run/attempt,
otherwise a random eight-hex ID). Each test claims its own pair of Sundays in
2090-01-01 through 2099-12-27. There are 522 Sundays in this reserved window.
Hashed allocation retries collisions up to five times; week UUIDs persist proof
of run ownership and distinguish test labels. No real calendar weeks are used.

The session-protected `/api/e2e` POST route is enabled only in Vercel previews
or recognized local development/test environments. It returns 404 in production,
on Vercel development deployments, and for unknown environments. It validates the
run header and all scopes before storage access. Database fixtures use an
`e2e-<runId>` category and `e2e:<runId>:<n>` dish identifiers, including a recipe.
Without a database, fixtures use the committed sample catalog and reserve weeks
in the existing in-memory menu map.

Existing test `finally` blocks remove their items and await the server mutation
response before asserting persistence or reloading. Fixtures drain queued menu
requests before releasing their weeks. Cleanup explicitly deletes scoped menu
items before weeks, dishes, and category; run-tagged dish references are followed
only inside the reserved window, and unowned week rows are never deleted.
The `e2e-cleanup` teardown project runs after Chromium, including failed tests,
removes all remaining run-owned weeks, dishes and category, and fails if any
leftover count is nonzero. Credentials being unset skips authenticated tests and
cleanup. Seed also sweeps other runs older than six hours, preserving young runs
and any old run with young rows. No new environment variables or secrets are
needed in CI or Vercel. Screenshots remain in gitignored `preview-screenshots/`.

## License

[MIT](LICENSE), copyright (c) 2026 garreyxu.
