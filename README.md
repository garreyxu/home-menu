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

`pnpm test:e2e` starts the dev server itself. To point Playwright at an already running site (for example a preview URL in CI later), set `PLAYWRIGHT_BASE_URL`. When that variable is set, Playwright does not start a local server.

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

## License

MIT. See [LICENSE](./LICENSE).
