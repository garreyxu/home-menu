# home-menu

家庭菜单 is a small web app for planning a family's weekly meals, with a Chinese interface. The repository is public (MIT). It is hosted on Vercel Hobby with a Neon Postgres database. Sign-in will be a single shared family username and password; there is no users table yet. The home page is still a placeholder.

## Local setup

- Node.js 22.23.4 (see `.nvmrc`). `package.json` `engines` requires Node.js `>=22.23.4`.
- pnpm 10.33.4 (see the `packageManager` field in `package.json`).

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL when you have a database; leave it empty otherwise
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The home page is a placeholder (`家庭菜单 · 建设中`).

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

## Data model

Postgres tables live in `src/server/db/schema.ts`. Ids are UUIDs (`gen_random_uuid()`).

| Table          | Columns                                                                                                            | Rules                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`   | `id`, `name`, `sort_order`, `created_at`                                                                           | `name` is unique                                                                                                                                                            |
| `dishes`       | `id`, `notion_page_id`, `name`, `category_id`, `description`, `photo_key`, `is_active`, `created_at`, `updated_at` | `notion_page_id` is unique and nullable (later Notion import). `photo_key` is a private storage key, never a public URL. `is_active` defaults to true                       |
| `weekly_menus` | `id`, `week_start`, `created_at`                                                                                   | `week_start` is a unique `date` and must be a Sunday (`extract(dow from week_start) = 0`)                                                                                   |
| `menu_items`   | `id`, `weekly_menu_id`, `day_of_week`, `meal`, `dish_id`, `created_at`                                             | `day_of_week` is 0–6 (0 = Sunday). `meal` is `breakfast`, `lunch`, or `dinner`. Unique on `(weekly_menu_id, day_of_week, meal, dish_id)`. Deleting a week deletes its items |

Two phones can add the same dish at once: the insert uses `ON CONFLICT DO NOTHING`, so the row is kept once. Removing a dish from a slot deletes that row.

The server client is `getDb()` in `src/server/db/index.ts`. It reads `DATABASE_URL` (the Neon pooled URL) and is marked `server-only`. Query helpers in `src/server/menu.ts`:

- `listCategoriesWithDishes()` — categories by `sort_order`, each with its dishes (including inactive) by name. `photo_key` is returned as stored.
- `getOrCreateWeek(weekStart)` — `weekStart` is a `YYYY-MM-DD` Sunday.
- `addMenuItem({ weekStart, dayOfWeek, meal, dishId })` — creates the week if needed, then inserts. A conflicting row is left in place.
- `removeMenuItem({ weekStart, dayOfWeek, meal, dishId })` — deletes that row.
- `getWeek(weekStart)` — the week and its items, or `null` if that Sunday has no menu yet.
- `toWeekStart(date)` — the Sunday of that instant in `America/Los_Angeles`, as `YYYY-MM-DD`.

Migrations are generated with `pnpm exec drizzle-kit generate` and committed under `drizzle/`. `pnpm db:migrate` runs `drizzle-kit migrate`.

`pnpm build` is the command Vercel should run. `vercel.json` sets `buildCommand` to `pnpm build` because the Next.js preset would otherwise run `next build` and skip migrations. When neither `DATABASE_URL_UNPOOLED` nor `DATABASE_URL` is set, the build logs `[db] Skipping migrations: ...` and continues, so CI can build without a database. When a URL is set, the build applies migrations. It then seeds only if `VERCEL_ENV` is `preview`. Production builds migrate and do not seed.

Scripts read `.env*` files the same way Next.js does and never print connection strings. On Vercel, the Neon integration's environment variables are already set and take precedence.

## CI

- `ci` (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`. Its job `checks` is the required status check: lint, typecheck, unit tests, the production build, and Playwright against the local dev server.
- `preview-e2e` (`.github/workflows/preview-e2e.yml`) runs after a successful Vercel Preview deployment and is not a required check. It runs Playwright against that preview URL. It does not run until the Vercel Git integration is connected.

`preview-e2e` reads these GitHub Actions secret names when they are set: `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, and `E2E_PASSWORD`. Missing secrets do not affect `checks`.

## License

MIT. See [LICENSE](./LICENSE).
