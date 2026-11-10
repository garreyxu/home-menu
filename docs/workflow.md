# Team workflow (generic template)

How a small multi-agent software team ships changes: from story to production and acceptance. No personal info and no secret values; replace `<repo>`, `<prod-url>`, `<neon-project-id>` for a new project.

- Part A: Team relay and acceptance (PM)
- Part B: Dispatch, review, merge (tech lead)
- Part C: CI, deploy, database, backups, cost (ops)
- Part D: QA verification (QA)

---

## Part A — Team relay and acceptance (PM)

Generic template. No personal info, no secrets. Pairs with the pipeline half (CI, previews, deploy, migrations, backups, announcer).

### Roles
- Owner: makes decisions, writes no code. Gets private messages only at milestones.
- PM: specs (user stories + acceptance criteria), priorities, task board, acceptance, the single contact for the owner.
- Tech lead: technical plan, splits work into small PRs, dispatches coding agents, reviews, merges.
- Designer: design specs, reviews preview screenshots before merge, reviews live pages.
- QA: test plans, tests every merge on production at phone / desktop / ultra-wide widths.
- Ops: hosting, CI/CD, DB, backups, cost watch, status announcer.

### Lifecycle of one change
1. PM writes the story and acceptance criteria into the spec; adds a board row (status: 待开始).
2. Tech lead dispatches a coding agent; row -> 进行中.
3. PR opened -> tech lead attaches a per-PR event listener (CI passed, CI failed, merged/closed).
4. CI green (unit + build + preview e2e) -> tech lead reviews code and e2e, @designer with the screenshot artifact names.
5. Designer approves or lists fixes, then @tech lead.
6. If the PR touches the DB schema or data: take a DB snapshot branch first.
7. Tech lead merges -> ops announces deploy -> tech lead runs read-only data checks if relevant -> @QA.
8. QA tests on production (test data only in a future week, cleaned up after; never touch real current data). Reports pass/fail with steps, expected vs actual, screenshots.
9. PM updates the board: merged but not QA-verified = 待验收; QA passed = 已完成; bugs -> new fix PR ahead of new features on the same surface.
10. Anything only a human can verify (real phone gestures, real mouse) is batched into one owner message.

### Relay rules
- Every finished step ends with an @ to the next person and the exact next action. Silence never means "someone is on it".
- Event-driven wake-ups first (per-PR listeners); a periodic CI check is the fallback until listeners are proven.
- Immediate alerts (PR opened, merged/deployed, main failing) always stay on.
- No progress chatter in the group; speak only with a conclusion, a blocker, or a handoff.

### Talking to the owner
- Private messages start with [Need Action] + exact steps, or [No Action].
- Only at milestones: feature live, QA accepted on production, or blocked on a decision.
- Batch everything the owner must do into one message.
- Decisions come as 2–3 clear options with a recommendation.
- Never claim unverified results; say plainly what was not tested.

### Guardrails
- Free tiers by default; anything that costs money needs owner approval with the amount.
- Secrets only in platform env vars / CI secrets; never in chat or Git. Docs list variable names and locations only.
- Once a plan is set, execute it; don't re-plan.

### Tracking
- One board (e.g. Notion database): task, status (待开始/进行中/待验收/已完成/卡住/已取消), PR link, notes, owner, milestone, priority, date.
- Source control is the source of truth; the board mirrors it.

---

## Part B — Dispatch, review, merge (tech lead)


### Splitting work
- One PR = one user-visible change or one infra change. Aim for a diff a reviewer can read in one sitting.
- At most 2 coding-agent tasks in parallel, each on its own branch (e.g. `codex/<topic>`). If two tasks touch the same file, say so in both prompts: keep edits minimal there and rebase on main before finishing.
- Merge one PR at a time; the second one syncs with main before it merges.

### Writing the coding-agent prompt (structured English)
Every prompt has these sections:
1. Goal: one paragraph, what the user sees when it's done.
2. Branch + PR title.
3. Scope: files/areas to touch, and explicitly what NOT to touch.
4. Requirements: numbered, testable; link the design spec section if UI.
5. Data/DB: whether a migration is allowed; if yes, it must be idempotent and must not touch unrelated rows.
6. Security: no secrets in code, logs, tests or PR text; test-only endpoints must be disabled (404) in production; no new env vars/secrets/workflow changes unless stated.
7. Tests: unit + e2e cases to add; e2e creates and cleans up its own data; never depends on production data.
8. Screenshots (UI changes): phone 390, desktop 1440, ultra-wide 3440, plus zoomed crops; uploaded as a CI artifact.
9. Done criteria: CI green (unit, build, preview e2e), PR description lists what changed, what was not done, and how to verify.
10. Commit author email: the account's noreply address, never a personal email.

Submitting long prompts: attach the prompt as a .txt file to the agent task rather than pasting.

### When a PR opens
- A repo-level listener fires on "PR opened"; the tech lead then attaches a per-PR listener (CI passed, CI failed, pushed, merged, closed). It removes itself on merge/close.
- A "CI passed" event can come from a single check (e.g. the host's deploy check). Always confirm every required gate on the PR head before treating it as green.

### Review checklist (before merge)
- Does the diff match the prompt scope? Anything extra gets questioned or removed.
- Security: secrets, auth on every new route, test-only routes 404 in production, input validation, no user data in logs.
- DB: migration reviewed line by line; unique indexes and write paths agree; snapshot taken first if schema or data changes.
- Consistency: naming, existing helpers reused, no new dependency without a reason.
- Tests actually assert the behaviour (not only that the page loads).
- UI: designer approved the screenshot artifact.

### Merge and after
- Squash-merge with the expected head SHA; never push to main directly.
- Confirm the production deploy succeeded, run read-only data checks if the PR touched data, then @QA with what to test.
- If QA finds bugs, the fix PR goes ahead of new features on the same surface.

### Never stall
- The moment all gates are green: review, request designer, snapshot if needed, merge. Don't wait for someone to ask.
- If blocked, post who it's blocked on and what they need to do.

---

## Part C — CI, deploy, database, backups, cost (ops)

Generic template. Replace `<repo>`, `<neon-project-id>`, `<prod-url>`. No values of any secret belong in this file.

### Stack (all free tiers)
- Hosting: Vercel Hobby, one region (`vercel.json` → `"regions": ["<region>"]`, keep it next to the DB region).
- Database: Neon Free (Postgres). Default branch = `production`. Every Vercel preview gets its own Neon branch via the Vercel–Neon integration.
- CI: GitHub Actions. `main` is protected by a ruleset that requires the `checks` job.

### Pipeline per PR
1. **`ci.yml`** (on `pull_request` and `push`): install → lint → typecheck → unit tests (Vitest) → build. Job name `checks` is the required status.
2. **Vercel preview** builds automatically. The build runs `scripts/vercel-build.ts`, which runs `pnpm db:migrate` against that preview's Neon branch. Production is never seeded.
3. **`preview-e2e.yml`**: Vercel sends `repository_dispatch` (Vercel does not create GitHub Deployments). The workflow validates the 40-char SHA and URL from `client_payload`, runs Playwright against the preview using `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, `E2E_PASSWORD`, then writes a commit status (`statuses: write`) and uploads screenshots. Can also be started by hand with `workflow_dispatch` (sha + url).
4. **Before merge**: green `checks` + green `preview-e2e` + design screenshots reviewed + a fresh DB snapshot if the PR has a migration (`neon-ops` → `snapshot`).
5. **Merge** to `main` → Vercel production build runs migrations → verify the deployment is READY (Vercel API `/v13/deployments`, or the dashboard) → run `neon-ops` → `sync-report` when data shape changed → QA on production.

### Database ops (`neon-ops.yml`, manual only)
- `sync-report` (default, read-only): reports row counts, index validity, duplicates, last Notion sync result.
- `snapshot`: creates a no-compute Neon branch `backup-YYYYMMDD-HHMM` that expires after N days (default 7). Must be picked explicitly.
- Restore = point the app (or a manual copy) at the snapshot branch; never restore over production without a fresh snapshot of current production first.
- The workflow pins `NEON_PROJECT_ID` and the script refuses to run if it drifts. For a new project, change it in one place (better: a repo variable `vars.NEON_PROJECT_ID`).

### Housekeeping
- `cleanup-neon-preview-branches.yml`: deletes Neon branches whose PRs are closed. Runs on PR close and weekly cron; manual runs default to dry run.
- Neon Free has a 10-branch limit. Previews + snapshots share it, so keep snapshots to 7-day expiry and let cleanup run.

### Secrets (names only)
- GitHub Actions secrets: `NEON_API_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_USERNAME`, `E2E_PASSWORD`.
- Vercel env vars (project level, Production + Preview): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`, `NOTION_TOKEN`, `CRON_SECRET`, optional `NOTION_DATABASE_ID`, `NOTION_DATA_SOURCE_ID`.
- Coupled pair: the preview `AUTH_PASSWORD_HASH` must match `E2E_PASSWORD`. Change both together or preview E2E breaks.
- Generate: `pnpm auth:hash` (stdin, not echoed), `openssl rand -base64 48` for `SESSION_SECRET`, `openssl rand -base64 32` for `CRON_SECRET`.

### Status broadcast and handoffs
- PR opened, merged, and live, and `main` CI failures are event-driven alerts posted to the team chat.
- CI green/red on open PRs: the tech lead's per-PR listener is primary. A 30-minute poll is the fallback until the listener is proven; each green/red post @-mentions the tech lead with the next step (green: review screenshots, snapshot, merge; red: find the failing check).
- Silent when nothing changed.

### Free-tier traps to watch
- Vercel Hobby cron: once a day, may fire anywhere in the hour; functions max 300 s. Hobby is non-commercial use only.
- Neon Free: 10 branches, storage and compute-hour caps; computes autosuspend, so the first request after idle is slow.
- GitHub Actions: free for public repos; private repos have a monthly minute quota. Keep Playwright to one browser.
- Nothing here should ever ask for a card. If a dashboard asks for one, stop and ask the owner first.

---

## Part D — QA verification (QA)

原则：没亲眼测过就不算好了。只报实际验证过的结论，没测到的写明“未测”。

### 什么时候测
- PR 的 CI（单元 + preview e2e）绿了之后，可在预览地址抽查；预览用专门的 e2e 测试账号（账号名写在密码库条目里，密码绝不写进文档、聊天或 Git）。
- 合并并上线后，在生产地址做正式复测；运维或技术负责人 @QA 后开始。
- 涉及数据库迁移的 PR：先看技术负责人贴的只读核对结果（索引是否有效、重复条数等），再测界面。

### 三档宽度
- 手机 390（开触摸模拟）、普通桌面 1440×900、带鱼屏 3440。
- 截图前先在控制台跑 `[innerWidth, innerHeight, document.documentElement.scrollWidth]`，确认视口真的是这个宽度，且 scrollWidth 不大于 innerWidth（没有横向溢出）。
- 用 DevTools 自带的截图功能；3440 用缩放适配窗口后再截。
- 没有真机时注明“只在模拟器测过，未在真手机测”。

### 生产测试数据规矩
- 不碰正在用的数据（例如本周菜单）。测试数据只放在隔离区域（例如下一周）。
- 测前记下原有数据的样子；测完删干净，并截图确认隔离区为空、原有数据原样不动。

### 每次至少检查
- 本 PR 的验收标准逐条过一遍，包括出错路径（重复、超长、必填、权限）。
- 刷新后数据是否还在（真的写进了数据库）。
- 上几个 PR 的核心功能回归。
- 登录与权限：未登录能看到什么、不同家庭成员账号是否互相影响。
- 键盘操作可用；拖拽类功能同时测鼠标、键盘和手机长按。

### Bug 怎么写（发给技术负责人）
- 标题一句话说清现象。
- 环境：生产或预览地址、提交号、视口宽度。
- 复现步骤、期望结果、实际结果。
- 截图（放共享路径，聊天里给路径）。
- 能不能稳定复现、有没有排除自己工具的问题。

### 交接
- 测完在群里发结论：通过、失败、未测各写清楚，然后 @下一个人，写明轮到谁做什么（例如“通过，@产品经理 可以给 项目负责人 发试用清单”或“两个 bug，@技术负责人 派修复”）。
- 需要 项目负责人 亲手做的（真机、真实鼠标拖拽等）交给产品经理统一转达，不直接私聊他。
