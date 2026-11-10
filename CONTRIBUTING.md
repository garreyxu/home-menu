# Contributing

Use Node.js 22.23.4 and pnpm 10.33.4. Run `pnpm install`, copy `.env.example` to `.env.local`, and configure the auth variables as described in [README.md](README.md). Run `pnpm dev`; local development uses sample data when no database is configured.

Create a focused branch from the latest `main`, make your change, and open one pull request to `main`. Describe the problem, resulting behavior, and validation. Add user-visible changes under `[Unreleased]` in `CHANGELOG.md`.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Install Chromium with `pnpm exec playwright install chromium` and run `pnpm test:e2e`. The `checks` workflow and `preview-e2e` are merge gates; preview tests require the configured Vercel preview and test credentials. Repository owners must configure `NEON_PROJECT_ID` for Neon operations.

Use a GitHub noreply commit email (for this maintainer, `garreyxu@users.noreply.github.com`), not a personal email. Never commit secrets, personal configuration, connection strings, or private account identifiers. Keep local values in ignored `.env.local` files and deployment values in the provider settings.

See [the team workflow](docs/workflow.md) and [design docs](docs/design/README.md) for reference. Design documents describe product work; follow the scope of the issue you are implementing.
