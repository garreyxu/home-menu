#!/usr/bin/env bash
# Delete Neon preview branches created by the Vercel integration.
#
# Vercel names each preview database branch preview/<git branch>, where
# <git branch> is the pull request head ref (github.event.pull_request.head.ref),
# not refs/heads/<name>.
#
# Modes, from CLEANUP_MODE or EVENT_NAME:
#   delete-one  Delete preview/$PR_HEAD_REF. Missing branch exits 0.
#   sweep       Delete preview/* branches that have no open GitHub pull request.
#   self-test   Check name construction, the allowlist, and sweep selection.
#
# Reads NEON_API_KEY, NEON_PROJECT_ID, NEON_API_BASE, NEON_BRANCH_ALLOWLIST.
# Never prints NEON_API_KEY. Refuses to delete the hardcoded keep-names
# production and vercel-dev, anything in NEON_BRANCH_ALLOWLIST, a Neon
# default/primary/protected branch, or any name that does not start with preview/.

set -euo pipefail

NEON_API_BASE="${NEON_API_BASE:-https://console.neon.tech/api/v2}"
# Floor applied even if the workflow allowlist is edited. The workflow env
# NEON_BRANCH_ALLOWLIST repeats these names so they stay visible in the YAML.
REQUIRED_ALLOWLIST="production,vercel-dev"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

list_has_exact() {
  local name="$1"
  local csv="$2"
  local item
  while [ -n "$csv" ]; do
    item="${csv%%,*}"
    item="${item#"${item%%[![:space:]]*}"}"
    item="${item%"${item##*[![:space:]]}"}"
    if [ -n "$item" ] && [ "$item" = "$name" ]; then
      return 0
    fi
    if [ "$csv" = "${csv#*,}" ]; then
      break
    fi
    csv="${csv#*,}"
  done
  return 1
}

is_allowlisted() {
  local name="$1"
  if list_has_exact "$name" "$REQUIRED_ALLOWLIST"; then
    return 0
  fi
  if list_has_exact "$name" "${NEON_BRANCH_ALLOWLIST:-}"; then
    return 0
  fi
  return 1
}

# Reject refs that are not the bare head branch name GitHub puts in
# pull_request.head.ref. The accepted value is concatenated as preview/<ref>.
validate_head_ref() {
  local ref="$1"
  if [ -z "$ref" ]; then
    printf 'pull request head ref is empty\n' >&2
    return 1
  fi
  if [ "${#ref}" -gt 248 ]; then
    printf 'pull request head ref is longer than 248 characters\n' >&2
    return 1
  fi
  if [[ "$ref" =~ [[:cntrl:]] || "$ref" =~ [[:space:]] ]]; then
    printf 'pull request head ref contains whitespace or a control character\n' >&2
    return 1
  fi
  if [[ "$ref" == refs/* || "$ref" == refs ]]; then
    printf 'pull request head ref must be the branch name, without refs/heads/\n' >&2
    return 1
  fi
  if [[ "$ref" == @ || "$ref" == */ || "$ref" == /* || "$ref" == *. || "$ref" == *.lock ]]; then
    printf 'pull request head ref is not a usable git branch name\n' >&2
    return 1
  fi
  if [[ "$ref" == *".."* || "$ref" == *"//"* || "$ref" == *"@{"* || "$ref" == *'~'* || "$ref" == *'^'* || "$ref" == *':'* || "$ref" == *'?'* || "$ref" == *'*'* || "$ref" == *'['* || "$ref" == *\\* ]]; then
    printf 'pull request head ref is not a usable git branch name\n' >&2
    return 1
  fi
  return 0
}

preview_branch_name() {
  local ref="$1"
  validate_head_ref "$ref" || return 1
  printf 'preview/%s' "$ref"
}

# Prints the git ref for a Neon preview branch. Status 2 means "not preview/*".
# Status 1 means the preview/ prefix is present but the rest is not a branch name.
git_ref_from_preview_name() {
  local name="$1"
  local ref
  case "$name" in
    preview/*) ;;
    *) return 2 ;;
  esac
  ref="${name#preview/}"
  if [ -z "$ref" ] || [ "$ref" = "$name" ] || [[ "$ref" == */ ]]; then
    return 1
  fi
  printf '%s' "$ref"
}

# Prints one reason token. Delete reasons are closed-pr and no-open-pr.
# check_open_prs is "yes" or "no". When "yes", open_prs_file must exist.
classify_reason() {
  local name="$1"
  local is_default="$2"
  local is_primary="$3"
  local is_protected="$4"
  local check_open_prs="$5"
  local open_prs_file="${6:-}"
  local git_ref=""
  local status=0

  if [ -z "$name" ]; then
    printf 'bad-name'
    return 0
  fi
  if is_allowlisted "$name"; then
    printf 'allowlist'
    return 0
  fi
  if [ "$is_default" = "true" ]; then
    printf 'default'
    return 0
  fi
  if [ "$is_primary" = "true" ]; then
    printf 'primary'
    return 0
  fi
  if [ "$is_protected" = "true" ]; then
    printf 'protected'
    return 0
  fi

  git_ref="$(git_ref_from_preview_name "$name")" || status=$?
  if [ "$status" -eq 2 ]; then
    printf 'non-preview'
    return 0
  fi
  if [ "$status" -ne 0 ] || [ -z "$git_ref" ]; then
    printf 'bad-name'
    return 0
  fi

  if [ "$check_open_prs" = "yes" ]; then
    if [ ! -f "$open_prs_file" ]; then
      fail "open pull request list is missing; refusing to delete any Neon branch"
    fi
    if grep -Fxq -- "$git_ref" "$open_prs_file"; then
      printf 'open-pr'
      return 0
    fi
    printf 'no-open-pr'
    return 0
  fi

  printf 'closed-pr'
}

row_field() {
  local row="$1"
  local field="$2"
  jq -r --arg field "$field" '.[$field] // empty' <<<"$row"
}

classify_all() {
  local branches_json="$1"
  local check_open_prs="$2"
  local open_prs_file="$3"
  local keep_out="$4"
  local delete_out="$5"
  local count=0
  local index=0
  local row name id parent_id is_default is_primary is_protected reason action git_ref="" status=0 dest

  : >"$keep_out"
  : >"$delete_out"
  count="$(jq 'length' "$branches_json")"
  while [ "$index" -lt "$count" ]; do
    row="$(jq -c --argjson index "$index" '.[$index] | {id, name, default: (.default // false), primary: (.primary // false), protected: (.protected // false), parent_id: (.parent_id // "")}' "$branches_json")"
    name="$(row_field "$row" name)"
    id="$(row_field "$row" id)"
    parent_id="$(row_field "$row" parent_id)"
    is_default="$(jq -r 'if .default == true then "true" else "false" end' <<<"$row")"
    is_primary="$(jq -r 'if .primary == true then "true" else "false" end' <<<"$row")"
    is_protected="$(jq -r 'if .protected == true then "true" else "false" end' <<<"$row")"
    reason="$(classify_reason "$name" "$is_default" "$is_primary" "$is_protected" "$check_open_prs" "$open_prs_file")"
    git_ref=""
    status=0
    git_ref="$(git_ref_from_preview_name "$name")" || status=$?
    if [ "$status" -ne 0 ]; then
      git_ref=""
    fi
    case "$reason" in
      closed-pr | no-open-pr)
        action="delete"
        dest="$delete_out"
        ;;
      *)
        action="keep"
        dest="$keep_out"
        ;;
    esac
    jq -nc \
      --arg action "$action" \
      --arg reason "$reason" \
      --arg id "$id" \
      --arg name "$name" \
      --arg parent_id "$parent_id" \
      --arg git_ref "$git_ref" \
      --argjson is_default "$(jq '.default' <<<"$row")" \
      --argjson is_primary "$(jq '.primary' <<<"$row")" \
      --argjson is_protected "$(jq '.protected' <<<"$row")" \
      '{action:$action, reason:$reason, id:$id, name:$name, parent_id:$parent_id, git_ref:$git_ref, default:$is_default, primary:$is_primary, protected:$is_protected}' \
      >>"$dest"
    index=$((index + 1))
  done
}

# Children before parents so a preview branch that parents another preview
# branch is not deleted first (Neon rejects that delete).
order_deletions() {
  local input="$1"
  local output="$2"
  local remaining leaves blocked parent_ids guard=0 row id

  : >"$output"
  remaining="$(mktemp)"
  cp "$input" "$remaining"
  while [ -s "$remaining" ]; do
    guard=$((guard + 1))
    if [ "$guard" -gt 1000 ]; then
      rm -f "$remaining"
      fail "could not order Neon branches for deletion"
    fi
    leaves="$(mktemp)"
    blocked="$(mktemp)"
    parent_ids="$(mktemp)"
    jq -r 'select((.parent_id // "") != "") | .parent_id' "$remaining" | sort -u >"$parent_ids"
    while IFS= read -r row || [ -n "${row:-}" ]; do
      [ -n "$row" ] || continue
      id="$(jq -r '.id // empty' <<<"$row")"
      if [ -n "$id" ] && grep -Fxq -- "$id" "$parent_ids"; then
        printf '%s\n' "$row" >>"$blocked"
      else
        printf '%s\n' "$row" >>"$leaves"
      fi
    done <"$remaining"
    rm -f "$parent_ids"
    if [ ! -s "$leaves" ] && [ ! -s "$blocked" ]; then
      rm -f "$leaves" "$blocked" "$remaining"
      fail "could not partition Neon branches for deletion"
    fi
    if [ ! -s "$leaves" ]; then
      head -n 1 "$blocked" >"$leaves"
      tail -n +2 "$blocked" >"$remaining"
    else
      cat "$blocked" >"$remaining"
    fi
    cat "$leaves" >>"$output"
    rm -f "$leaves" "$blocked"
  done
  rm -f "$remaining"
}

assert_safe_delete_row() {
  local row="$1"
  local name id flag value
  name="$(jq -r '.name // empty' <<<"$row")"
  id="$(jq -r '.id // empty' <<<"$row")"
  if is_allowlisted "$name"; then
    fail "refusing to delete allowlisted Neon branch ${name}"
  fi
  case "$name" in
    preview/*) ;;
    *) fail "refusing to delete non-preview Neon branch ${name}" ;;
  esac
  for flag in default primary protected; do
    value="$(jq -r --arg flag "$flag" '.[$flag] // false' <<<"$row")"
    if [ "$value" = "true" ]; then
      fail "refusing to delete ${flag} Neon branch ${name}"
    fi
  done
  if [[ ! "$id" =~ ^br-[A-Za-z0-9_-]+$ ]]; then
    fail "refusing to delete ${name}; branch id is not a Neon branch id"
  fi
  if [ -z "$(jq -r '.git_ref // empty' <<<"$row")" ]; then
    fail "refusing to delete ${name}; preview git ref is empty"
  fi
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "${command_name} is required"
}

mask_secret() {
  local value="$1"
  if [ -n "$value" ]; then
    printf '%s\n' "::add-mask::${value}"
  fi
}

require_neon_auth() {
  require_command curl
  [ -n "${NEON_API_KEY:-}" ] || fail "NEON_API_KEY is not set for this run"
  mask_secret "$NEON_API_KEY"
  [[ "${NEON_PROJECT_ID:-}" =~ ^[a-z0-9-]+$ ]] || fail "NEON_PROJECT_ID is not set to a Neon project id"
  case "$NEON_API_BASE" in
    https://console.neon.tech/api/v2) ;;
    *) fail "unexpected Neon API base" ;;
  esac
}

neon_request() {
  local method="$1"
  local url="$2"
  local outfile="$3"
  local status
  local -a retry=()
  if [ "$method" = "GET" ]; then
    retry=(--retry 2 --retry-delay 2)
  fi
  status="$(
    curl --proto '=https' --tlsv1.2 --max-redirs 0 --max-time 60 -sS \
      -o "$outfile" \
      -w '%{http_code}' \
      -X "$method" \
      -A "home-menu-neon-preview-cleanup" \
      -H "Authorization: Bearer ${NEON_API_KEY}" \
      -H "Accept: application/json" \
      "${retry[@]}" \
      "$url"
  )" || fail "Neon API ${method} did not complete"
  printf '%s' "$status"
}

fetch_neon_branches() {
  local outfile="$1"
  local jsonl body page=0 cursor="" status path_only
  jsonl="$(mktemp)"
  body="$(mktemp)"
  : >"$jsonl"
  while [ "$page" -lt 50 ]; do
    local url="${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches?limit=100"
    page=$((page + 1))
    if [ -n "$cursor" ]; then
      local encoded
      encoded="$(jq -rn --arg cursor "$cursor" '$cursor | @uri')"
      url="${url}&cursor=${encoded}"
    fi
    status="$(neon_request GET "$url" "$body")"
    if [ "$status" != "200" ]; then
      path_only="${url%%\?*}"
      log "Listing Neon branches failed with HTTP ${status} for ${path_only}"
      jq -r '.message // empty' "$body" 2>/dev/null || true
      rm -f "$jsonl" "$body"
      fail "could not list Neon branches"
    fi
    jq -c '.branches // [] | .[] | {id, name, default: (.default // false), primary: (.primary // false), protected: (.protected // false), parent_id: (.parent_id // "")}' "$body" >>"$jsonl"
    cursor="$(jq -r '.pagination.next // empty' "$body")"
    if [ -z "$cursor" ] || [ "$cursor" = "null" ]; then
      cursor=""
      break
    fi
  done
  if [ -n "$cursor" ]; then
    rm -f "$jsonl" "$body"
    fail "Neon branch list did not finish within 50 pages"
  fi
  if [ -s "$jsonl" ]; then
    jq -s '.' "$jsonl" >"$outfile"
  else
    printf '[]\n' >"$outfile"
  fi
  rm -f "$jsonl" "$body"
}

fetch_open_pr_refs() {
  local dest="$1"
  local page=1 body status count
  [ -n "${GH_TOKEN:-}" ] || fail "GH_TOKEN is not set; refusing to delete any Neon branch"
  mask_secret "$GH_TOKEN"
  [[ "${GITHUB_REPOSITORY:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "unexpected GITHUB_REPOSITORY"
  : >"$dest"
  body="$(mktemp)"
  while [ "$page" -le 30 ]; do
    status="$(
      curl --proto '=https' --tlsv1.2 --max-redirs 0 --max-time 60 -sS \
        --retry 2 --retry-delay 2 \
        -o "$body" \
        -w '%{http_code}' \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -H "Authorization: Bearer ${GH_TOKEN}" \
        -A "home-menu-neon-preview-cleanup" \
        "https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100&page=${page}"
    )" || fail "GitHub pull request list did not complete; refusing to delete any Neon branch"
    if [ "$status" != "200" ]; then
      log "Listing open pull requests failed with HTTP ${status}"
      jq -r '.message // empty' "$body" 2>/dev/null || true
      rm -f "$body"
      fail "could not list open pull requests; refusing to delete any Neon branch"
    fi
    count="$(jq 'if type == "array" then length else -1 end' "$body")"
    if [ "$count" -lt 0 ]; then
      rm -f "$body"
      fail "GitHub pull request response was not a list; refusing to delete any Neon branch"
    fi
    jq -r '.[] | .head.ref | select(type == "string" and test("^[^\n\r\t ]+$"))' "$body" >>"$dest"
    if [ "$count" -lt 100 ]; then
      break
    fi
    page=$((page + 1))
  done
  if [ "$page" -gt 30 ]; then
    rm -f "$body"
    fail "open pull request list exceeded 30 pages; refusing to delete any Neon branch"
  fi
  rm -f "$body"
}

delete_neon_branch() {
  local branch_id="$1"
  local name="$2"
  local body status attempt=1
  [[ "$branch_id" =~ ^br-[A-Za-z0-9_-]+$ ]] || fail "refusing to delete unexpected branch id"
  if is_allowlisted "$name"; then
    fail "refusing to delete allowlisted Neon branch ${name}"
  fi
  case "$name" in
    preview/*) ;;
    *) fail "refusing to delete non-preview Neon branch ${name}" ;;
  esac
  body="$(mktemp)"
  while [ "$attempt" -le 3 ]; do
    status="$(neon_request DELETE "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches/${branch_id}" "$body")"
    case "$status" in
      200 | 202 | 204)
        log "Deleted Neon branch ${name} (${branch_id})"
        rm -f "$body"
        return 0
        ;;
      404)
        log "Neon branch ${name} (${branch_id}) is already gone"
        rm -f "$body"
        return 0
        ;;
      423 | 429 | 503)
        log "Neon returned HTTP ${status} for ${name}; retry ${attempt} of 3"
        sleep $((attempt * 2))
        ;;
      *)
        log "Failed to delete Neon branch ${name} (${branch_id}): HTTP ${status}"
        jq -r '.message // empty' "$body" 2>/dev/null || true
        rm -f "$body"
        return 1
        ;;
    esac
    attempt=$((attempt + 1))
  done
  log "Failed to delete Neon branch ${name} (${branch_id}) after retries"
  jq -r '.message // empty' "$body" 2>/dev/null || true
  rm -f "$body"
  return 1
}

append_summary() {
  local line="$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY"
  fi
}

display_text() {
  local value="$1"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  value="${value//\`/}"
  printf '%s' "$value"
}

log_plan_row() {
  local row="$1"
  local verb="$2"
  local name id reason git_ref message
  name="$(jq -r '.name // empty' <<<"$row")"
  id="$(jq -r '.id // empty' <<<"$row")"
  reason="$(jq -r '.reason // empty' <<<"$row")"
  git_ref="$(jq -r '.git_ref // empty' <<<"$row")"
  case "$reason" in
    open-pr) message="open pull request for ${git_ref}" ;;
    no-open-pr) message="no open pull request for ${git_ref}" ;;
    closed-pr) message="pull request closed for ${git_ref}" ;;
    allowlist) message="allowlist" ;;
    default) message="Neon default branch" ;;
    primary) message="Neon primary branch" ;;
    protected) message="Neon protected branch" ;;
    non-preview) message="name does not start with preview/" ;;
    bad-name) message="name is not a preview/<git branch>" ;;
    *) message="$reason" ;;
  esac
  log "${verb} ${name} (${id}) — ${message}"
  append_summary "- ${verb} \`$(display_text "$name")\` (\`$(display_text "$id")\`) — $(display_text "$message")"
}

delete_one() {
  local target composed branches matches count keep_out delete_out row
  if ! target="$(preview_branch_name "${PR_HEAD_REF:-}")"; then
    fail "refusing to derive a Neon branch name from the pull request head ref"
  fi
  composed="preview/${PR_HEAD_REF}"
  [ "$target" = "$composed" ] || fail "internal error building the Neon preview branch name"
  log "Pull request head ref: ${PR_HEAD_REF}"
  log "Neon branch name: ${target}"
  require_neon_auth
  log "Neon project: ${NEON_PROJECT_ID}"
  log "Keep names: ${REQUIRED_ALLOWLIST}"
  log "Workflow allowlist: ${NEON_BRANCH_ALLOWLIST:-<unset>}"
  append_summary "## Neon preview cleanup"
  append_summary ""
  append_summary "Closed pull request head ref \`$(display_text "$PR_HEAD_REF")\` maps to Neon branch \`$(display_text "$target")\`."
  append_summary ""

  branches="$(mktemp)"
  matches="$(mktemp)"
  keep_out="$(mktemp)"
  delete_out="$(mktemp)"
  fetch_neon_branches "$branches"
  jq -c --arg name "$target" '[.[] | select(.name == $name)]' "$branches" >"$matches"
  count="$(jq 'length' "$matches")"
  if [ "$count" -eq 0 ]; then
    log "Neon branch ${target} does not exist. Nothing to delete."
    append_summary "Neon branch \`$(display_text "$target")\` does not exist. Nothing to delete."
    rm -f "$branches" "$matches" "$keep_out" "$delete_out"
    return 0
  fi
  [ "$count" -eq 1 ] || fail "expected one Neon branch named ${target}, found ${count}"
  classify_all "$matches" no "" "$keep_out" "$delete_out"
  if [ -s "$keep_out" ]; then
    row="$(head -n 1 "$keep_out")"
    log_plan_row "$row" "KEEP"
    fail "refusing to delete ${target} ($(jq -r '.reason' <<<"$row"))"
  fi
  [ -s "$delete_out" ] || fail "no delete plan for ${target}"
  row="$(head -n 1 "$delete_out")"
  assert_safe_delete_row "$row"
  log_plan_row "$row" "DELETE"
  delete_neon_branch "$(jq -r '.id' <<<"$row")" "$(jq -r '.name' <<<"$row")"
  rm -f "$branches" "$matches" "$keep_out" "$delete_out"
}

sweep() {
  local branches open_prs keep_out delete_out ordered row failures=0 verb
  case "${DRY_RUN:-}" in
    true | false) ;;
    *) fail "DRY_RUN must be true or false" ;;
  esac
  require_neon_auth
  log "Neon project: ${NEON_PROJECT_ID}"
  log "Keep names: ${REQUIRED_ALLOWLIST}"
  log "Workflow allowlist: ${NEON_BRANCH_ALLOWLIST:-<unset>}"
  if [ "$DRY_RUN" = "true" ]; then
    log "Dry run: listing Neon preview branches that would be deleted. Nothing will be deleted."
  else
    log "Deleting stale Neon preview branches."
  fi
  append_summary "## Neon preview cleanup"
  append_summary ""
  append_summary "- Project: \`$(display_text "$NEON_PROJECT_ID")\`"
  append_summary "- Dry run: \`${DRY_RUN}\`"
  append_summary "- Allowlist: \`$(display_text "${REQUIRED_ALLOWLIST},${NEON_BRANCH_ALLOWLIST:-}")\`"
  append_summary "- Also kept: Neon \`default\`, \`primary\`, and \`protected\` branches, and every name that does not start with \`preview/\`."
  append_summary ""

  branches="$(mktemp)"
  open_prs="$(mktemp)"
  keep_out="$(mktemp)"
  delete_out="$(mktemp)"
  ordered="$(mktemp)"
  fetch_open_pr_refs "$open_prs"
  fetch_neon_branches "$branches"
  classify_all "$branches" yes "$open_prs" "$keep_out" "$delete_out"
  log "Keeping $(grep -c . "$keep_out" || true) Neon branch(es)."
  while IFS= read -r row || [ -n "${row:-}" ]; do
    [ -n "$row" ] || continue
    log_plan_row "$row" "KEEP"
  done <"$keep_out"

  if [ -s "$delete_out" ]; then
    order_deletions "$delete_out" "$ordered"
  else
    : >"$ordered"
  fi
  while IFS= read -r row || [ -n "${row:-}" ]; do
    [ -n "$row" ] || continue
    assert_safe_delete_row "$row"
  done <"$ordered"

  if [ "$DRY_RUN" = "true" ]; then
    verb="WOULD DELETE"
  else
    verb="DELETE"
  fi
  if [ ! -s "$ordered" ]; then
    log "No stale preview branches to delete."
    append_summary "No stale preview branches to delete."
  fi
  while IFS= read -r row || [ -n "${row:-}" ]; do
    [ -n "$row" ] || continue
    log_plan_row "$row" "$verb"
    if [ "$DRY_RUN" = "true" ]; then
      continue
    fi
    if ! delete_neon_branch "$(jq -r '.id' <<<"$row")" "$(jq -r '.name' <<<"$row")"; then
      failures=$((failures + 1))
    fi
  done <"$ordered"
  rm -f "$branches" "$open_prs" "$keep_out" "$delete_out" "$ordered"
  if [ "$failures" -ne 0 ]; then
    fail "${failures} Neon branch delete(s) failed"
  fi
}

self_test() (
  local ref got keep_out delete_out ordered fixture prs reason child_line parent_line

  assert_eq() {
    local label="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" != "$actual" ]; then
      printf 'self-test %s: expected [%s] got [%s]\n' "$label" "$expected" "$actual" >&2
      exit 1
    fi
  }

  NEON_BRANCH_ALLOWLIST="production,vercel-dev"

  # Same concatenation the workflow applies to github.event.pull_request.head.ref.
  ref="cursor/neon-preview-cleanup-6589"
  got="$(preview_branch_name "$ref")"
  assert_eq "slashed head ref" "preview/${ref}" "$got"
  assert_eq "slashed literal" "preview/cursor/neon-preview-cleanup-6589" "$got"

  ref="feature-auth"
  got="$(preview_branch_name "$ref")"
  assert_eq "simple head ref" "preview/feature-auth" "$got"
  assert_eq "simple composed" "preview/${ref}" "$got"

  ref="cursor/weekly-menu-3f20"
  assert_eq "existing branch style" "preview/cursor/weekly-menu-3f20" "$(preview_branch_name "$ref")"

  ref="feat(menu)"
  assert_eq "parentheses" "preview/feat(menu)" "$(preview_branch_name "$ref")"

  ref="dependabot/npm_and_yarn/left-pad"
  assert_eq "underscores" "preview/dependabot/npm_and_yarn/left-pad" "$(preview_branch_name "$ref")"

  for ref in "" "refs/heads/foo" "refs" "../secret" "foo/../bar" "foo//bar" "/foo" "foo/" "foo bar" $'foo\nbar' "@" "foo.lock" "branch@{1}" "wild*card"; do
    if preview_branch_name "$ref" >/dev/null 2>&1; then
      printf 'self-test: expected head ref to be rejected: %q\n' "$ref" >&2
      exit 1
    fi
  done

  is_allowlisted "production" || exit 1
  is_allowlisted "vercel-dev" || exit 1
  if is_allowlisted "main" || is_allowlisted "preview/production" || is_allowlisted "production-copy"; then
    printf 'self-test: allowlist matched a name it should not\n' >&2
    exit 1
  fi

  NEON_BRANCH_ALLOWLIST="preview/pinned"
  assert_eq "extra allowlist wins over preview prefix" "allowlist" \
    "$(classify_reason "preview/pinned" false false false no "")"
  # Required names stay kept even when the env allowlist is replaced.
  assert_eq "required production" "allowlist" \
    "$(classify_reason "production" false false false no "")"
  assert_eq "required vercel-dev" "allowlist" \
    "$(classify_reason "vercel-dev" false false false no "")"
  NEON_BRANCH_ALLOWLIST="production,vercel-dev"

  if (classify_reason "preview/foo" false false false yes "/no/such/open-prs" >/dev/null 2>&1); then
    printf 'self-test: missing open pull request list should fail closed\n' >&2
    exit 1
  fi

  fixture="$(mktemp)"
  prs="$(mktemp)"
  keep_out="$(mktemp)"
  delete_out="$(mktemp)"
  ordered="$(mktemp)"
  cat >"$fixture" <<'EOF'
[
  {"id":"br-production","name":"production","default":true,"primary":true,"protected":false,"parent_id":""},
  {"id":"br-vercel-dev","name":"vercel-dev","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-development","name":"development","default":true,"primary":false,"protected":false,"parent_id":""},
  {"id":"br-main","name":"main","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-staging","name":"staging","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-primary-only","name":"primary-only","default":false,"primary":true,"protected":false,"parent_id":"br-production"},
  {"id":"br-protected-custom","name":"protected-custom","default":false,"primary":false,"protected":true,"parent_id":"br-production"},
  {"id":"br-open","name":"preview/cursor/open-pr","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-stale","name":"preview/cursor/stale-pr","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-simple","name":"preview/feature-auth","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-prefix","name":"preview/feature-auth-extra","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-prot","name":"preview/do-not-touch","default":false,"primary":false,"protected":true,"parent_id":"br-production"},
  {"id":"br-defpreview","name":"preview/marked-default","default":true,"primary":false,"protected":false,"parent_id":""},
  {"id":"br-primary","name":"preview/marked-primary","default":false,"primary":true,"protected":false,"parent_id":"br-production"},
  {"id":"br-child","name":"preview/parent/child","default":false,"primary":false,"protected":false,"parent_id":"br-parent"},
  {"id":"br-parent","name":"preview/parent","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-blank","name":"preview/","default":false,"primary":false,"protected":false,"parent_id":"br-production"},
  {"id":"br-bare","name":"preview","default":false,"primary":false,"protected":false,"parent_id":"br-production"}
]
EOF
  printf '%s\n' "cursor/open-pr" >"$prs"
  classify_all "$fixture" yes "$prs" "$keep_out" "$delete_out"

  reason_for() {
    jq -r --arg name "$1" 'select(.name == $name) | .reason' "$2"
  }
  assert_eq "production" "allowlist" "$(reason_for production "$keep_out")"
  assert_eq "vercel-dev" "allowlist" "$(reason_for vercel-dev "$keep_out")"
  assert_eq "development default" "default" "$(reason_for development "$keep_out")"
  assert_eq "main" "non-preview" "$(reason_for main "$keep_out")"
  assert_eq "staging" "non-preview" "$(reason_for staging "$keep_out")"
  assert_eq "primary-only" "primary" "$(reason_for primary-only "$keep_out")"
  assert_eq "protected-custom" "protected" "$(reason_for protected-custom "$keep_out")"
  assert_eq "open pr" "open-pr" "$(reason_for "preview/cursor/open-pr" "$keep_out")"
  assert_eq "protected preview" "protected" "$(reason_for "preview/do-not-touch" "$keep_out")"
  assert_eq "default preview" "default" "$(reason_for "preview/marked-default" "$keep_out")"
  assert_eq "primary preview" "primary" "$(reason_for "preview/marked-primary" "$keep_out")"
  assert_eq "blank preview" "bad-name" "$(reason_for "preview/" "$keep_out")"
  assert_eq "bare preview" "non-preview" "$(reason_for "preview" "$keep_out")"

  got="$(jq -r '.name' "$delete_out" | sort | paste -sd, -)"
  assert_eq "delete set" "preview/cursor/stale-pr,preview/feature-auth,preview/feature-auth-extra,preview/parent,preview/parent/child" "$got"

  if jq -e 'select(.name == "production" or .name == "vercel-dev" or .name == "main" or .name == "development" or .name == "staging" or .name == "preview/cursor/open-pr")' "$delete_out" >/dev/null; then
    printf 'self-test: delete plan included a kept branch\n' >&2
    exit 1
  fi

  order_deletions "$delete_out" "$ordered"
  child_line="$(jq -r '.name' "$ordered" | grep -n -Fx 'preview/parent/child' | cut -d: -f1)"
  parent_line="$(jq -r '.name' "$ordered" | grep -n -Fx 'preview/parent' | cut -d: -f1)"
  if [ -z "$child_line" ] || [ -z "$parent_line" ] || [ "$child_line" -ge "$parent_line" ]; then
    printf 'self-test: child preview branch should be deleted before its parent\n' >&2
    exit 1
  fi

  # delete-one does not consult open PRs: a closed PR's branch is still selected.
  classify_all "$fixture" no "" "$keep_out" "$delete_out"
  assert_eq "closed pr still selects open-named preview" "closed-pr" \
    "$(reason_for "preview/cursor/open-pr" "$delete_out")"
  assert_eq "closed pr still keeps production" "allowlist" \
    "$(reason_for production "$keep_out")"

  rm -f "$fixture" "$prs" "$keep_out" "$delete_out" "$ordered"
  printf 'self-test: head ref cursor/neon-preview-cleanup-6589 -> preview/cursor/neon-preview-cleanup-6589\n'
  printf 'self-test: head ref feature-auth -> preview/feature-auth\n'
)

resolve_mode() {
  case "${CLEANUP_MODE:-}" in
    self-test | delete-one | sweep)
      printf '%s' "$CLEANUP_MODE"
      return 0
      ;;
    "") ;;
    *) fail "unknown CLEANUP_MODE" ;;
  esac
  case "${EVENT_NAME:-}" in
    pull_request) printf 'delete-one' ;;
    schedule | workflow_dispatch) printf 'sweep' ;;
    *) fail "unsupported EVENT_NAME" ;;
  esac
}

main() {
  local mode
  require_command jq
  mode="$(resolve_mode)"
  self_test
  log "Neon branch name checks passed"
  case "$mode" in
    self-test) ;;
    delete-one) delete_one ;;
    sweep) sweep ;;
    *) fail "unsupported mode ${mode}" ;;
  esac
}

main "$@"
