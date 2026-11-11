// Local dry-run of the exact embedded workflow script; no network or token.
import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs
  .readFileSync(".github/workflows/pr-status-comment.yml", "utf8")
  .split("          script: |\n")[1]
  .split("\n")
  .map((l) => l.slice(12))
  .join("\n");
const run = new (Object.getPrototypeOf(async function () {}).constructor)(
  "github",
  "context",
  "core",
  source,
);
const sha = "a".repeat(40),
  old = "b".repeat(40);
let comments = [],
  writes = 0,
  deletes = 0,
  ref = sha,
  checkSha = sha,
  state = "success",
  fail = false;
const pulls = {
  list() {},
  get: async () => ({ data: { state: "open", head: { sha: ref } } }),
};
const checks = { listForRef() {} };
const repos = { getCombinedStatusForRef() {} };
const issues = {
  listComments() {},
  createComment: async (p) => {
    writes++;
    comments.push({
      id: 1,
      body: p.body,
      user: { login: "github-actions[bot]" },
    });
  },
  updateComment: async (p) => {
    writes++;
    comments[0].body = p.body;
  },
  deleteComment: async () => deletes++,
};
const github = {
  rest: { pulls, checks, repos, issues },
  paginate: async (method, params, map) => {
    if (method === pulls.list)
      return [
        {
          number: 1,
          head: { sha: ref, repo: { full_name: "o/r" } },
          base: { repo: { full_name: "o/r" } },
        },
        {
          number: 2,
          head: { sha: ref, repo: { full_name: "fork/r" } },
          base: { repo: { full_name: "o/r" } },
        },
      ];
    if (method === issues.listComments) {
      assert.equal(params.issue_number, 1);
      return comments;
    }
    if (method === checks.listForRef)
      return checkSha
        ? [
            {
              name: "checks",
              id: 1,
              head_sha: checkSha,
              status: "completed",
              conclusion: state,
              html_url: "https://example.com/run",
            },
          ]
        : [];
    if (method === repos.getCombinedStatusForRef)
      return map({
        data: {
          sha: ref,
          statuses: checkSha
            ? ["preview-e2e", "Vercel"].map((context) => ({
                id: 1,
                context,
                state,
                target_url: "https://example.com/status",
              }))
            : [],
        },
      });
    throw Error("unexpected method");
  },
};
(async () => {
  const invoke = () =>
    run(
      github,
      { repo: { owner: "o", repo: "r" }, serverUrl: "https://github.com" },
      {
        warning: console.error,
        setFailed: () => {
          fail = true;
        },
      },
    );
  await invoke();
  console.log("Sample rendered comment:\n" + comments[0].body + "\n");
  assert.equal(writes, 1);
  assert.match(comments[0].body, /checks: 🟢/);
  assert.match(comments[0].body, /preview-e2e: 🟢/);
  await invoke();
  assert.equal(writes, 1);
  state = "failure";
  await invoke();
  assert.equal(writes, 2);
  assert.match(comments[0].body, /checks: 🔴/);
  ref = old;
  checkSha = null;
  await invoke();
  assert.match(comments[0].body, /checks: ⚪ 过时/);
  const stale = comments[0].body;
  await invoke();
  assert.equal(comments[0].body, stale);
  checkSha = sha;
  await invoke();
  assert.match(comments[0].body, /checks: ⚪ \[过时\]/);
  comments.push({ ...comments[0], id: 2 });
  await invoke();
  assert.equal(deletes, 1);
  assert.equal(fail, false);
  console.log(
    "PASS: create, update, unchanged timestamp, fork skip, old-head results, stale persistence, duplicate cleanup",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
