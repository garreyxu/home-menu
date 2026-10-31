# home-menu

家庭菜单 is a small web app for planning a family's weekly meals, with a Chinese interface. The repository is public (MIT). Hosting on Vercel Hobby and a Neon Postgres database come later. Sign-in will be a single shared family username and password. This repository currently contains the application scaffold only: no database, authentication, or deployment config yet.

## Local setup

- Node.js 22.23.4 (see `.nvmrc`). `package.json` `engines` requires Node.js `>=22.23.4`.
- pnpm 10.33.4 (see the `packageManager` field in `package.json`).

```bash
pnpm install
cp .env.example .env.local   # optional; the app does not read these variables yet
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

| Script      | Command          | Purpose                                           |
| ----------- | ---------------- | ------------------------------------------------- |
| `dev`       | `pnpm dev`       | Start the Next.js dev server                      |
| `build`     | `pnpm build`     | Production build                                  |
| `start`     | `pnpm start`     | Serve the production build                        |
| `lint`      | `pnpm lint`      | ESLint                                            |
| `typecheck` | `pnpm typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `format`    | `pnpm format`    | Format the repo with Prettier                     |
| `test`      | `pnpm test`      | Unit tests (Vitest)                               |
| `test:e2e`  | `pnpm test:e2e`  | End-to-end smoke test (Playwright, Chromium)      |

## CI

- `ci` (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`. Its job `checks` is the required status check: lint, typecheck, unit tests, the production build, and Playwright against the local dev server.
- `preview-e2e` (`.github/workflows/preview-e2e.yml`) runs after a successful Vercel Preview deployment and is not a required check. It runs Playwright against that preview URL. It does not run until the Vercel Git integration is connected.

`preview-e2e` reads these GitHub Actions secret names when they are set: `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, and `E2E_PASSWORD`. Missing secrets do not affect `checks`.

## License

MIT. See [LICENSE](./LICENSE).
