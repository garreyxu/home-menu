# home-menu

家庭菜单 is a small web app for planning a family's weekly meals, with a Chinese interface. The repository is public (MIT). It is hosted on Vercel Hobby with a Neon Postgres database. Sign-in is one shared family username and password from environment variables; there is no users table. The home page is the dish wall: active dishes, filtered by category.

## Local setup

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

## Design

The UI source of truth is [docs/design/design-spec-pixel-seaside.md](docs/design/design-spec-pixel-seaside.md). Information architecture is [docs/design/ia-and-flows.md](docs/design/ia-and-flows.md). When a concept mockup disagrees with the design spec, follow the spec.

Pixel borders and buttons are CSS (2px ink border, 2px clipped corners, 4px solid offset shadow). Scene and category slots expose `data-asset` so image files can replace that CSS later without changing the component tree. There are no bitmap assets in this version.

Colors from the spec are Tailwind theme tokens (`sea`, `sea-deep`, `sand`, `cream`, `coral`, `sun`, `ink`, `kelp`). The spec's `muted` text color is the `driftwood` token, because shadcn already uses `muted` for a surface. White on the spec coral (`#E2533B`) measures about 3.8:1, so buttons and small coral text use `coral-deep` (`#B43322`: about 6.1:1 with white, and above 4.5:1 on cream). `sand-deep` (`#E7D3AE`) is the darker sand used for the plate rim and skeletons.

## Fonts

Body text and dish names use Noto Sans SC (400 and 600) through `next/font/google`, self-hosted at build time with Google's unicode-range slices. Headings, buttons, category labels, and numeric badges use Fusion Pixel 12px proportional simplified Chinese, only at 12px, 24px, and 36px.

The pixel font is [SIL Open Font License 1.1](src/fonts/OFL.txt) (Copyright 2022 TakWolf). Upstream licenses that ship with the font are in `src/fonts/LICENSES/`. The file in the repo is a subset of release `2026.10.25`, `fusion-pixel-12px-proportional-zh_hans.otf.woff2` (701,520 bytes), reduced to the interface copy, ASCII, punctuation, and the sample category names. The committed WOFF2 is 4,388 bytes. Glyphs outside that subset fall back to Noto Sans SC. The app code stays MIT; the font stays OFL.

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

The proxy runs for every path except `/_next/static`, `/_next/image`, `/favicon.ico`, and `/assets/` (pixel art in `public/assets`). `/api/*` is always included, including paths that end in an image or script extension.

The proxy is the outer gate, not the only one. Every Server Action, route handler, and server component that reads data must call `requireSession()` from `src/lib/auth/require-session.ts`. Route handlers that respond with JSON use `requireApiSession()` and return that 401 response when it is not null. Do not rely on the proxy alone. The login action and POST `/logout` are the exceptions, because they run before a session exists. The home page calls `requireSession()`.

Five failed logins from one IP inside a 15-minute window lock that IP for 15 minutes, counted from the fifth failure. A failure stops counting once it is 15 minutes old, and a successful login clears the counter. The counter is in memory on that server instance only. It resets on restart and is not shared across instances.

End-to-end tests that sign in read `E2E_USERNAME` and `E2E_PASSWORD`. They are skipped when either variable is unset. The dev server still needs `AUTH_USERNAME` (the same username), `AUTH_PASSWORD_HASH` (the hash of `E2E_PASSWORD`), and `SESSION_SECRET`. The `ci` job generates a throwaway password, bcrypt hash, and session secret at runtime and does not store them. `preview-e2e` passes the `E2E_USERNAME` and `E2E_PASSWORD` GitHub Actions secrets and skips login tests when they are absent. The preview deployment itself needs the three auth variables above.

## Deploying auth

Set `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, and `SESSION_SECRET` on the Vercel project for both Production and Preview before merging. If any of them is missing, `SESSION_SECRET` is shorter than 32 characters, or `AUTH_PASSWORD_HASH` is not a 60-character `$2a$` / `$2b$` / `$2y$` bcrypt hash, the deployed site returns a generic 500. The server log names the failed check (missing, wrong prefix, or wrong length for the hash; missing or too short, with the length only, for the secret) and does not include the hash, the username, or the secret.

Preview must use a different username and password from production. Put that preview pair in the GitHub Actions secrets `E2E_USERNAME` and `E2E_PASSWORD`. Do not reuse the production password there.

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
- `listDishesByCategory()` — categories by `sort_order`, each with its active dishes by name. `photo_key` stays a storage key. When `DATABASE_URL` is unset and `VERCEL_ENV` is unset, this returns the sample catalog from `src/server/db/seed-data.ts` so local dev and CI can render without Neon. On Vercel (`VERCEL_ENV` set to any value), a missing `DATABASE_URL` throws and is logged. A configured database is the source of truth.
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

`preview-e2e` reads these GitHub Actions secret names when they are set: `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, and `E2E_PASSWORD`. Missing secrets do not affect `checks`. Login tests in that workflow are skipped when `E2E_USERNAME` or `E2E_PASSWORD` is absent. The `checks` job generates its own throwaway auth values when it runs Playwright and does not commit them.

## License

MIT. See [LICENSE](./LICENSE).
