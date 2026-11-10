#!/usr/bin/env bash
# Manual Neon operations for home-menu. Called by .github/workflows/neon-ops.yml.
#
# snapshot
#   Create a branch from the project's default/primary branch. The name is
#   backup-YYYYMMDD-HHMM in UTC. It does not start with preview/, so
#   .github/scripts/neon-preview-cleanup.sh keeps it: that script deletes a
#   branch only when the name matches preview/*, and delete_neon_branch
#   refuses every other name.
#   NEON_OPS_EXPIRES_DAYS defaults to 7. 0 omits expires_at. 1-30 sends
#   expires_at as UTC now plus that many days. Invalid values fail before
#   any Neon request.
#
# sync-report
#   Fetch the production connection URI from the Neon API, mask the URI and
#   the password, and run hard-coded queries in a read-only transaction.
#
# The workflow input is only the action name. This script does not accept
# SQL, a branch id, or a connection string from the environment.
# Do not enable xtrace. This script turns xtrace off and refuses to continue
# if it is still on.

set +x
set -euo pipefail
umask 077

if [[ $- == *x* ]]; then
  printf 'error: refusing to run with xtrace\n' >&2
  exit 1
fi

NEON_API_BASE="${NEON_API_BASE:-https://console.neon.tech/api/v2}"

SQL_SYNC_RUNS="select started_at, status, added, updated, deleted, inactivated, would_remove, removals_skipped, on_wall from notion_sync_runs order by started_at desc limit 10;"
SQL_DISHES="select is_active, count(*) from dishes where notion_page_id is not null group by 1;"
SQL_MENU_INDEXES="select i.indexname, i.indexdef, x.indisvalid from pg_indexes i join pg_namespace n on n.nspname = i.schemaname join pg_class c on c.relnamespace = n.oid and c.relname = i.indexname join pg_index x on x.indexrelid = c.oid where i.schemaname = 'public' and i.tablename = 'menu_items' order by i.indexname;"
SQL_CUSTOM_DUPLICATES="select count(*) as duplicate_groups, coalesce(sum(copies - 1), 0) as duplicate_custom_rows from (select count(*) as copies from menu_items where custom_name is not null group by weekly_menu_id, day_of_week, meal, lower(btrim(custom_name)) having count(*) > 1) duplicates;"

workdir=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cleanup_workdir() {
  # A command substitution inherits this trap in some bash versions. Only the
  # main shell should delete the temp dir. A nested shell keeps the status
  # that made it exit so a rejected branch selection still fails.
  local status=$?
  if [ "${BASH_SUBSHELL:-0}" -ne 0 ]; then
    exit "$status"
  fi
  if [ -n "$workdir" ] && [ -d "$workdir" ]; then
    rm -rf "$workdir"
  fi
}
trap cleanup_workdir EXIT

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

refuse_xtrace() {
  if [[ $- == *x* ]]; then
    printf 'error: refusing to run with xtrace\n' >&2
    exit 1
  fi
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "${command_name} is required"
}

mask_secret() {
  local value="$1"
  if [ -z "$value" ]; then
    return 0
  fi
  case "$value" in
    *$'\n'* | *$'\r'*)
      fail "refusing to mask a secret that contains a newline"
      ;;
  esac
  printf '%s\n' "::add-mask::${value}"
}

append_summary() {
  local line="$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY"
  fi
}

emit() {
  local line="$1"
  log "$line"
  append_summary "$line"
}

display_text() {
  local value="$1"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  value="${value//\`/}"
  printf '%s' "$value"
}

# Print an API error message only when it cannot contain a credential.
safe_log_text() {
  local message="$1"
  local api_key="${NEON_API_KEY:-}"
  case "$message" in
    *Bearer* | *postgresql:* | *postgres:* | *NEON_API_KEY*)
      log "Neon returned an error message that was not safe to print"
      return 0
      ;;
  esac
  if [ -n "$api_key" ] && [ "$message" != "${message//"$api_key"/}" ]; then
    log "Neon returned an error message that was not safe to print"
    return 0
  fi
  log "$message"
}

api_failure() {
  local status="$1"
  local body="$2"
  local what="$3"
  local message=""
  local code=""
  log "${what} failed with HTTP ${status}"
  message="$(jq -r '.message // empty' "$body" 2>/dev/null || true)"
  code="$(jq -r '.code // empty' "$body" 2>/dev/null || true)"
  case "$code" in
    "" | *[!A-Za-z0-9_.-]*) ;;
    *) log "Neon error code: ${code}" ;;
  esac
  if [ -n "$message" ]; then
    safe_log_text "$message"
  fi
}

require_neon_auth() {
  refuse_xtrace
  [[ "${NEON_PROJECT_ID:-}" =~ ^[a-z0-9-]+$ ]] || fail "NEON_PROJECT_ID is not set to a Neon project id (repo variable NEON_PROJECT_ID)"
  require_command curl
  require_command jq
  [ -n "${NEON_API_KEY:-}" ] || fail "NEON_API_KEY is not set for this run"
  mask_secret "$NEON_API_KEY"
  case "$NEON_API_BASE" in
    https://console.neon.tech/api/v2) ;;
    *) fail "unexpected Neon API base" ;;
  esac
}

neon_request() {
  local method="$1"
  local url="$2"
  local outfile="$3"
  local bodyfile="${4:-}"
  local status
  local -a args=()
  if [ "$method" = "GET" ]; then
    args+=(--retry 2 --retry-delay 2)
  fi
  if [ -n "$bodyfile" ]; then
    args+=(-H "Content-Type: application/json" --data-binary @"$bodyfile")
  fi
  status="$(
    curl --proto '=https' --tlsv1.2 --max-redirs 0 --max-time 60 -sS \
      -o "$outfile" \
      -w '%{http_code}' \
      -X "$method" \
      -A "home-menu-neon-ops" \
      -H "Authorization: Bearer ${NEON_API_KEY}" \
      -H "Accept: application/json" \
      "${args[@]}" \
      "$url"
  )" || return 1
  printf '%s' "$status"
}

fetch_neon_branches() {
  local outfile="$1"
  local jsonl body page=0 cursor="" status path_only url encoded
  jsonl="$(mktemp)"
  body="$(mktemp)"
  : >"$jsonl"
  while [ "$page" -lt 50 ]; do
    url="${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches?limit=100"
    page=$((page + 1))
    if [ -n "$cursor" ]; then
      encoded="$(jq -rn --arg cursor "$cursor" '$cursor | @uri')"
      url="${url}&cursor=${encoded}"
    fi
    status="$(neon_request GET "$url" "$body")" || fail "Neon API GET did not complete"
    if [ "$status" != "200" ]; then
      path_only="${url%%\?*}"
      api_failure "$status" "$body" "Listing Neon branches (${path_only})"
      rm -f "$jsonl" "$body"
      fail "could not list Neon branches"
    fi
    jq -c '.branches // [] | .[] | {id, name, default: (.default // false), primary: (.primary // false), protected: (.protected // false), parent_id: (.parent_id // ""), expires_at: (if has("expires_at") and .expires_at != null then .expires_at else "" end)}' "$body" >>"$jsonl"
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

fetch_plan() {
  local outfile="$1"
  local body status
  body="$(mktemp)"
  status="$(neon_request GET "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}" "$body")" || fail "Neon API GET did not complete"
  if [ "$status" != "200" ]; then
    api_failure "$status" "$body" "Reading the Neon project"
    rm -f "$body"
    printf '%s\n' '{"subscription_type":"","branches_limit":""}' >"$outfile"
    return 0
  fi
  jq -c '(.project.owner // {}) as $owner | {subscription_type: ($owner.subscription_type // ""), branches_limit: (($owner.branches_limit // "") | tostring)}' "$body" >"$outfile"
  rm -f "$body"
}

select_production_branch() {
  local branches_json="$1"
  local defaults primaries default_count primary_count default_id primary_id
  defaults="$(jq -c '[.[] | select(.default == true)]' "$branches_json")"
  primaries="$(jq -c '[.[] | select(.primary == true)]' "$branches_json")"
  default_count="$(jq 'length' <<<"$defaults")"
  primary_count="$(jq 'length' <<<"$primaries")"
  if [ "$default_count" -eq 1 ] && [ "$primary_count" -eq 1 ]; then
    default_id="$(jq -r '.[0].id' <<<"$defaults")"
    primary_id="$(jq -r '.[0].id' <<<"$primaries")"
    if [ "$default_id" != "$primary_id" ]; then
      fail "Neon default branch and primary branch are different"
    fi
    jq -c '.[0]' <<<"$defaults"
    return 0
  fi
  if [ "$default_count" -eq 1 ] && [ "$primary_count" -eq 0 ]; then
    jq -c '.[0]' <<<"$defaults"
    return 0
  fi
  if [ "$primary_count" -eq 1 ] && [ "$default_count" -eq 0 ]; then
    jq -c '.[0]' <<<"$primaries"
    return 0
  fi
  fail "expected one default/primary Neon branch (default=${default_count}, primary=${primary_count})"
}

validate_backup_name() {
  local name="$1"
  [[ "$name" =~ ^backup-[0-9]{8}-[0-9]{4}$ ]] || return 1
  case "$name" in
    preview/*) return 1 ;;
  esac
  return 0
}

# Empty means the default, 7 days. 0 means no expiry. Otherwise an integer 1-30.
# The match is the whole string: 07, 7.0, and whitespace are rejected.
resolve_expires_days() {
  local raw="$1"
  if [ -z "$raw" ]; then
    printf '7'
    return 0
  fi
  case "$raw" in
    0 | [1-9] | 1[0-9] | 2[0-9] | 30)
      printf '%s' "$raw"
      ;;
    *)
      return 1
      ;;
  esac
}

# Prints RFC3339 UTC now+N days, or an empty string when days is 0.
expires_at_for_days() {
  local days="$1"
  case "$days" in
    0)
      printf ''
      ;;
    [1-9] | 1[0-9] | 2[0-9] | 30)
      date -u -d "+${days} days" +%Y-%m-%dT%H:%M:%SZ
      ;;
    *)
      return 1
      ;;
  esac
}

write_branch_create_body() {
  local name="$1"
  local parent="$2"
  local expires_at="$3"
  if [ -n "$expires_at" ]; then
    # shellcheck disable=SC2016
    jq -n --arg name "$name" --arg parent "$parent" --arg expires "$expires_at" \
      '{branch:{name:$name, parent_id:$parent, expires_at:$expires}}'
  else
    # shellcheck disable=SC2016
    jq -n --arg name "$name" --arg parent "$parent" \
      '{branch:{name:$name, parent_id:$parent}}'
  fi
}

confirm_branch_create_body() {
  local body="$1"
  local expect_expires="$2"
  local actual status=0
  jq_result 'has("endpoints") or has("expires_at") or (.branch | has("endpoints"))' "$body" || status=$?
  if [ "$status" -eq 0 ]; then
    fail "branch create body included an endpoint or a top-level expiry"
  fi
  if [ "$status" -ne 1 ]; then
    fail "could not inspect the branch create body"
  fi
  actual="$(jq -r 'if (.branch | has("expires_at")) and .branch.expires_at != null then .branch.expires_at else "" end' "$body")"
  if [ "$actual" != "$expect_expires" ]; then
    fail "branch create body expiry did not match expires_days"
  fi
}

query_is_allowed() {
  local sql="$1"
  case "$sql" in
    "$SQL_SYNC_RUNS" | "$SQL_DISHES" | "$SQL_MENU_INDEXES" | "$SQL_CUSTOM_DUPLICATES") return 0 ;;
    *) return 1 ;;
  esac
}

# jq -e exits 0 for true, 1 for false, and 2+ on error. set -e must not treat
# false as a script failure, and an error must not be treated as false.
jq_result() {
  local status=0
  jq -e "$@" >/dev/null || status=$?
  if [ "$status" -gt 1 ]; then
    return 2
  fi
  return "$status"
}

is_rfc3339() {
  local value="$1"
  [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$ ]]
}

python_tool() {
  python3 - "$@" <<'PY'
import csv
import json
import os
import sys
from urllib.parse import parse_qsl, unquote, urlparse

def die(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(1)

def reject_newlines(value: str, label: str) -> None:
    if "\n" in value or "\r" in value:
        die(f"{label} contains a newline")

def write_private(path: str, text: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)

def escape_pgpass(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:")

def parse_uri(uri_path: str, dest_dir: str) -> None:
    raw = open(uri_path, encoding="utf-8").read()
    reject_newlines(raw.strip(), "connection URI")
    raw = raw.strip()
    if not raw:
        die("connection URI is empty")
    try:
        parsed = urlparse(raw)
        host = parsed.hostname or ""
        port = parsed.port or 5432
    except (ValueError, UnicodeError):
        die("connection URI could not be parsed")
    if parsed.scheme not in ("postgresql", "postgres"):
        die("connection URI is not a postgres URL")
    if parsed.username is None or parsed.password is None:
        die("connection URI is missing a user or password")
    user = unquote(parsed.username)
    password = unquote(parsed.password)
    encoded_password = parsed.password
    reject_newlines(user, "database user")
    reject_newlines(password, "database password")
    reject_newlines(encoded_password, "database password")
    if not user or not password:
        die("connection URI is missing a user or password")
    reject_newlines(host, "database host")
    if not host:
        die("connection URI is missing a host")
    database = unquote(parsed.path[1:] if parsed.path.startswith("/") else parsed.path)
    database = database.rstrip("/")
    reject_newlines(database, "database name")
    if not database or "/" in database:
        die("connection URI database name is missing or not a single name")
    params = parse_qsl(parsed.query, keep_blank_values=True)
    sslmode = ""
    channel_binding = ""
    sslrootcert = ""
    for key, value in params:
        if key == "sslmode":
            sslmode = value
        elif key == "channel_binding":
            channel_binding = value
        elif key == "sslrootcert":
            sslrootcert = value
        else:
            die(f"unsupported connection URI parameter: {key}")
    if not sslmode:
        sslmode = "require"
    if sslmode not in ("require", "verify-ca", "verify-full"):
        die("connection URI sslmode is not an encrypted mode")
    if channel_binding and channel_binding not in ("disable", "prefer", "require"):
        die("connection URI channel_binding is not a known value")
    if sslrootcert and sslrootcert != "system":
        die("connection URI sslrootcert is not system")
    meta = {
        "host": host,
        "port": str(port),
        "user": user,
        "database": database,
        "sslmode": sslmode,
        "channel_binding": channel_binding,
        "sslrootcert": sslrootcert,
    }
    secrets = [raw, password]
    if encoded_password != password:
        secrets.append(encoded_password)
    secrets.append(f"{user}:{password}")
    if encoded_password != password:
        secrets.append(f"{user}:{encoded_password}")
    write_private(os.path.join(dest_dir, "meta.json"), json.dumps(meta) + "\n")
    pgpass = ":".join(
        escape_pgpass(part)
        for part in (host, str(port), database, user, password)
    )
    write_private(os.path.join(dest_dir, "pgpass"), pgpass + "\n")
    write_private(os.path.join(dest_dir, "secrets"), "\n".join(secrets) + "\n")

def csv_to_markdown(csv_path: str) -> None:
    with open(csv_path, encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        die("query returned no header")
    header = rows[0]
    data = rows[1:]
    if not header or any(cell == "" for cell in header):
        die("query header was empty")

    def cell(value: str) -> str:
        return value.replace("\r", " ").replace("\n", " ").replace("|", "\\|")

    for row in data:
        if len(row) != len(header):
            die("query row width does not match the header")
    sys.stdout.write("| " + " | ".join(cell(item) for item in header) + " |\n")
    sys.stdout.write("| " + " | ".join("---" for _ in header) + " |\n")
    if not data:
        sys.stdout.write("_No rows._\n")
        return
    for row in data:
        sys.stdout.write("| " + " | ".join(cell(item) for item in row) + " |\n")

def main() -> None:
    if len(sys.argv) < 2:
        die("missing python tool command")
    command = sys.argv[1]
    if command == "parse-uri":
        if len(sys.argv) != 4:
            die("parse-uri expects a URI file and a destination directory")
        parse_uri(sys.argv[2], sys.argv[3])
        return
    if command == "csv-to-markdown":
        if len(sys.argv) != 3:
            die("csv-to-markdown expects a CSV file")
        csv_to_markdown(sys.argv[2])
        return
    die("unknown python tool command")

if __name__ == "__main__":
    main()
PY
}

parse_connection_uri() {
  local uri_file="$1"
  local dest_dir="$2"
  local stdout_file stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  if ! python_tool parse-uri "$uri_file" "$dest_dir" >"$stdout_file" 2>"$stderr_file"; then
    if [ -s "$stderr_file" ] && ! grep -q '://' "$stderr_file"; then
      cat "$stderr_file" >&2
    else
      log "connection URI could not be parsed"
    fi
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi
  if [ -s "$stdout_file" ] || [ -s "$stderr_file" ]; then
    rm -f "$stdout_file" "$stderr_file"
    log "connection URI parser produced unexpected output"
    return 1
  fi
  rm -f "$stdout_file" "$stderr_file"
}

mask_secret_file() {
  local secrets_file="$1"
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    mask_secret "$line"
  done <"$secrets_file"
}

apply_connection_files() {
  local dest_dir="$1"
  local meta="$dest_dir/meta.json"
  local host port user database sslmode channel_binding sslrootcert
  host="$(jq -r '.host' "$meta")"
  port="$(jq -r '.port' "$meta")"
  user="$(jq -r '.user' "$meta")"
  database="$(jq -r '.database' "$meta")"
  sslmode="$(jq -r '.sslmode' "$meta")"
  channel_binding="$(jq -r '.channel_binding // ""' "$meta")"
  sslrootcert="$(jq -r '.sslrootcert // ""' "$meta")"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail "connection URI host was not a hostname"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "connection URI port was not a number"
  if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    fail "connection URI port was outside 1-65535"
  fi
  [[ "$user" =~ ^[A-Za-z0-9_-]+$ ]] || fail "connection URI user was not a plain role name"
  [[ "$database" =~ ^[A-Za-z0-9_-]+$ ]] || fail "connection URI database was not a plain name"
  case "$sslmode" in
    require | verify-ca | verify-full) ;;
    *) fail "refusing to connect without SSL" ;;
  esac
  case "$channel_binding" in
    "" | disable | prefer | require) ;;
    *) fail "connection URI channel_binding is not a known value" ;;
  esac
  case "$sslrootcert" in
    "" | system) ;;
    *) fail "connection URI sslrootcert is not system" ;;
  esac
  unset PGPASSWORD DATABASE_URL DATABASE_URL_UNPOOLED || true
  export PGHOST="$host"
  export PGPORT="$port"
  export PGUSER="$user"
  export PGDATABASE="$database"
  export PGSSLMODE="$sslmode"
  export PGCONNECT_TIMEOUT=20
  export PGAPPNAME="home-menu-neon-ops"
  export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000"
  export PGPASSFILE="$dest_dir/pgpass"
  chmod 600 "$PGPASSFILE"
  if [ -n "$channel_binding" ]; then
    export PGCHANNELBINDING="$channel_binding"
  else
    unset PGCHANNELBINDING || true
  fi
  if [ "$sslrootcert" = "system" ]; then
    export PGSSLROOTCERT="system"
  else
    unset PGSSLROOTCERT || true
  fi
}

psql_readonly_csv() {
  local sql="$1"
  local outfile="$2"
  refuse_xtrace
  require_command psql
  [ -n "${PGHOST:-}" ] || fail "PGHOST is not set"
  [ -n "${PGUSER:-}" ] || fail "PGUSER is not set"
  [ -n "${PGDATABASE:-}" ] || fail "PGDATABASE is not set"
  [ -n "${PGPASSFILE:-}" ] || fail "PGPASSFILE is not set"
  [ -f "$PGPASSFILE" ] || fail "PGPASSFILE is missing"
  psql -w --no-psqlrc -v ON_ERROR_STOP=1 -q --csv \
    -c "BEGIN;" \
    -c "SET TRANSACTION READ ONLY;" \
    -c "$sql" \
    -c "COMMIT;" \
    >"$outfile"
}

run_report_query() {
  local title="$1"
  local sql="$2"
  local csv markdown rows
  query_is_allowed "$sql" || fail "refusing to run SQL that is not hard-coded"
  csv="$(mktemp)"
  markdown="$(mktemp)"
  if ! psql_readonly_csv "$sql" "$csv"; then
    rm -f "$csv" "$markdown"
    fail "read-only query failed: ${title}"
  fi
  if ! python_tool csv-to-markdown "$csv" >"$markdown"; then
    rm -f "$csv" "$markdown"
    fail "could not format query results: ${title}"
  fi
  rows="$(tail -n +2 "$csv" | grep -c . || true)"
  emit ""
  emit "### ${title}"
  emit ""
  if [ "$rows" -eq 0 ]; then
    log "Query ${title}: no rows"
  else
    log "Query ${title}: ${rows} row(s)"
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    emit "$line"
  done <"$markdown"
  rm -f "$csv" "$markdown"
}

assert_cleanup_keeps_backup_names() {
  local cleanup name
  cleanup="${REPO_ROOT}/.github/scripts/neon-preview-cleanup.sh"
  [ -f "$cleanup" ] || fail "preview cleanup script is missing"
  grep -F -q 'refusing to delete non-preview Neon branch' "$cleanup" || fail "preview cleanup script no longer refuses non-preview branch names"
  grep -F -q 'name does not start with preview/' "$cleanup" || fail "preview cleanup script no longer classifies non-preview names as kept"
  validate_backup_name "backup-20261109-2141" || fail "backup-20261109-2141 was rejected"
  is_rfc3339 "2026-01-29T18:02:16Z" || fail "UTC expiry timestamp was rejected"
  is_rfc3339 "2026-01-29T18:02:16.123456Z" || fail "fractional expiry timestamp was rejected"
  is_rfc3339 "2026-01-29T18:02:16-05:00" || fail "offset expiry timestamp was rejected"
  if is_rfc3339 "2026-01-29T18:02:16"; then
    fail "expiry timestamp without a time zone was accepted"
  fi
  if is_rfc3339 "tomorrow"; then
    fail "plain text was accepted as an expiry timestamp"
  fi
  if validate_backup_name "preview/backup-20261109-2141"; then
    fail "a preview/ name was accepted as a backup"
  fi
  if validate_backup_name "backup-20261109-214"; then
    fail "a short backup name was accepted"
  fi
  if validate_backup_name "backup-20261109-21415"; then
    fail "a long backup name was accepted"
  fi
  name="backup-$(date -u +%Y%m%d-%H%M)"
  validate_backup_name "$name" || fail "generated backup name ${name} is not backup-YYYYMMDD-HHMM"
  case "$name" in
    preview/*) fail "generated backup name starts with preview/" ;;
  esac
}

assert_expires_days() {
  local got stamp start end delta body
  local -a accepted_input=("0" "1" "7" "30" "")
  local -a accepted_days=("0" "1" "7" "30" "7")
  local index input
  for index in 0 1 2 3 4; do
    input="${accepted_input[$index]}"
    if ! got="$(resolve_expires_days "$input")"; then
      fail "expires_days value was rejected"
    fi
    [ "$got" = "${accepted_days[$index]}" ] || fail "expires_days did not normalize to ${accepted_days[$index]}"
  done
  for input in -1 31 abc; do
    if resolve_expires_days "$input" >/dev/null; then
      fail "expires_days ${input} was accepted"
    fi
  done
  [ -z "$(expires_at_for_days 0)" ] || fail "expires_days 0 produced an expiry"
  for input in 1 7 30; do
    stamp="$(expires_at_for_days "$input")"
    is_rfc3339 "$stamp" || fail "expires_days ${input} did not produce an RFC3339 timestamp"
  done
  stamp="$(expires_at_for_days 7)"
  start="$(date -u +%s)"
  end="$(date -u -d "$stamp" +%s)"
  delta=$((end - start))
  if [ "$delta" -lt 604790 ] || [ "$delta" -gt 604810 ]; then
    fail "expires_days 7 was not seven days ahead"
  fi
  body="$(mktemp)"
  write_branch_create_body "backup-20261109-2141" "br-prod" "" >"$body"
  confirm_branch_create_body "$body" ""
  write_branch_create_body "backup-20261109-2141" "br-prod" "$stamp" >"$body"
  confirm_branch_create_body "$body" "$stamp"
  rm -f "$body"
}

assert_queries_are_fixed() {
  local expected_runs expected_dishes
  expected_runs="select started_at, status, added, updated, deleted, inactivated, would_remove, removals_skipped, on_wall from notion_sync_runs order by started_at desc limit 10;"
  expected_dishes="select is_active, count(*) from dishes where notion_page_id is not null group by 1;"
  [ "$SQL_SYNC_RUNS" = "$expected_runs" ] || fail "notion sync query changed"
  [ "$SQL_DISHES" = "$expected_dishes" ] || fail "dish count query changed"
  query_is_allowed "$SQL_SYNC_RUNS" || fail "notion sync query is not allowed"
  query_is_allowed "$SQL_DISHES" || fail "dish count query is not allowed"
  query_is_allowed "$SQL_MENU_INDEXES" || fail "menu indexes query is not allowed"
  query_is_allowed "$SQL_CUSTOM_DUPLICATES" || fail "custom duplicate query is not allowed"
  if query_is_allowed "select 1;"; then
    fail "query allowlist accepted SQL from outside the script"
  fi
}

assert_parser_keeps_password_out_of_stdout() {
  local fixture dest uri_file stdout_file stderr_file pgpass_line password
  fixture="$(mktemp -d)"
  dest="$(mktemp -d)"
  uri_file="$fixture/uri"
  printf '%s\n' 'postgresql://neondb_owner:p%40ss%3Aword@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require' >"$uri_file"
  chmod 600 "$uri_file"
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  if ! python_tool parse-uri "$uri_file" "$dest" >"$stdout_file" 2>"$stderr_file"; then
    rm -rf "$fixture" "$dest"
    fail "parser rejected the fixture connection URI"
  fi
  if [ -s "$stdout_file" ] || [ -s "$stderr_file" ]; then
    rm -rf "$fixture" "$dest" "$stdout_file" "$stderr_file"
    fail "parser printed output for a valid connection URI"
  fi
  rm -f "$stdout_file" "$stderr_file"
  [ "$(jq -r '.host' "$dest/meta.json")" = "ep-example.us-east-2.aws.neon.tech" ] || fail "parser host mismatch"
  [ "$(jq -r '.port' "$dest/meta.json")" = "5432" ] || fail "parser port mismatch"
  [ "$(jq -r '.user' "$dest/meta.json")" = "neondb_owner" ] || fail "parser user mismatch"
  [ "$(jq -r '.database' "$dest/meta.json")" = "neondb" ] || fail "parser database mismatch"
  [ "$(jq -r '.sslmode' "$dest/meta.json")" = "require" ] || fail "parser sslmode mismatch"
  [ "$(jq -r '.channel_binding' "$dest/meta.json")" = "require" ] || fail "parser channel_binding mismatch"
  if jq -e 'has("password") or has("uri")' "$dest/meta.json" >/dev/null; then
    rm -rf "$fixture" "$dest"
    fail "parser wrote a secret into meta.json"
  fi
  password="$(sed -n '2p' "$dest/secrets")"
  [ "$password" = 'p@ss:word' ] || fail "parser password did not match the fixture"
  pgpass_line="$(cat "$dest/pgpass")"
  [ "$pgpass_line" = 'ep-example.us-east-2.aws.neon.tech:5432:neondb:neondb_owner:p@ss\:word' ] || fail "pgpass fixture was not escaped"
  printf '%s\n' 'postgresql://neondb_owner:secret@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=disable' >"$uri_file"
  if python_tool parse-uri "$uri_file" "$dest" >/dev/null 2>"$stderr_file"; then
    rm -rf "$fixture" "$dest"
    fail "parser accepted sslmode=disable"
  fi
  grep -q 'sslmode is not an encrypted mode' "$stderr_file" || fail "parser did not explain the sslmode rejection"
  if grep -q 'secret' "$stderr_file"; then
    rm -rf "$fixture" "$dest" "$stderr_file"
    fail "parser printed a password while rejecting sslmode"
  fi
  printf '%s\n' 'postgresql://neondb_owner:secret@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require&application_name=neon' >"$uri_file"
  if python_tool parse-uri "$uri_file" "$dest" >/dev/null 2>"$stderr_file"; then
    rm -rf "$fixture" "$dest"
    fail "parser accepted an unknown connection URI parameter"
  fi
  grep -q 'unsupported connection URI parameter: application_name' "$stderr_file" || fail "parser did not name the unsupported parameter"
  if grep -q 'secret' "$stderr_file"; then
    rm -rf "$fixture" "$dest" "$stderr_file"
    fail "parser printed a password while rejecting a parameter"
  fi
  rm -rf "$fixture" "$dest"
  rm -f "$stderr_file"
}

assert_jq_result() {
  local fixture body status
  fixture="$(mktemp)"
  body="$(mktemp)"
  printf '%s\n' '[{"name":"backup-20261109-2141"}]' >"$fixture"
  status=0
  # shellcheck disable=SC2016
  jq_result --arg name "backup-20261109-2141" 'any(.[]; .name == $name)' "$fixture" || status=$?
  [ "$status" -eq 0 ] || fail "jq_result did not match an existing backup name"
  status=0
  # shellcheck disable=SC2016
  jq_result --arg name "backup-20261109-2142" 'any(.[]; .name == $name)' "$fixture" || status=$?
  [ "$status" -eq 1 ] || fail "jq_result treated a missing backup name as an error"
  status=0
  jq_result '.' "${fixture}.missing" 2>/dev/null || status=$?
  [ "$status" -eq 2 ] || fail "jq_result treated a jq error as a normal false"
  # shellcheck disable=SC2016
  jq -n --arg name "backup-20261109-2141" --arg parent "br-prod" '{branch:{name:$name, parent_id:$parent}}' >"$body"
  status=0
  jq_result 'has("expires_at") or has("endpoints") or (.branch | has("expires_at"))' "$body" || status=$?
  [ "$status" -eq 1 ] || fail "branch create body looked like it set an expiry or an endpoint"
  rm -f "$fixture" "$body"
}

assert_markdown_table() {
  local csv markdown
  csv="$(mktemp)"
  markdown="$(mktemp)"
  printf '%s\n' 'status,note' 'succeeded,"keep | pipe"' >"$csv"
  python_tool csv-to-markdown "$csv" >"$markdown"
  grep -q '| status | note |' "$markdown" || fail "markdown table is missing the header"
  grep -q '| succeeded | keep \\| pipe |' "$markdown" || fail "markdown table did not escape a pipe"
  rm -f "$csv" "$markdown"
}

assert_production_selection() {
  local fixture selected mismatched
  fixture="$(mktemp)"
  cat >"$fixture" <<'EOF'
[
  {"id":"br-prod","name":"production","default":true,"primary":true,"protected":false,"parent_id":"","expires_at":""},
  {"id":"br-preview","name":"preview/feature","default":false,"primary":false,"protected":false,"parent_id":"br-prod","expires_at":""},
  {"id":"br-backup","name":"backup-20261109-2141","default":false,"primary":false,"protected":false,"parent_id":"br-prod","expires_at":""}
]
EOF
  selected="$(select_production_branch "$fixture")"
  [ "$(jq -r '.id' <<<"$selected")" = "br-prod" ] || fail "did not select the default/primary branch"
  [ "$(jq -r '.name' <<<"$selected")" = "production" ] || fail "did not keep the production branch name"
  mismatched="$(mktemp)"
  cat >"$mismatched" <<'EOF'
[
  {"id":"br-default","name":"default-branch","default":true,"primary":false,"parent_id":"","expires_at":""},
  {"id":"br-primary","name":"primary-branch","default":false,"primary":true,"parent_id":"","expires_at":""}
]
EOF
  if (select_production_branch "$mismatched" >/dev/null 2>&1); then
    rm -f "$fixture" "$mismatched"
    fail "mismatched default and primary branches were accepted"
  fi
  rm -f "$fixture" "$mismatched"
}

assert_workflow_is_manual() {
  local workflow banned
  workflow="${REPO_ROOT}/.github/workflows/neon-ops.yml"
  [ -f "$workflow" ] || fail "neon-ops workflow is missing"
  grep -Fq 'NEON_PROJECT_ID: ${{ vars.NEON_PROJECT_ID }}' "$workflow" || fail "workflow project id drifted"
  grep -q 'workflow_dispatch:' "$workflow" || fail "workflow is missing workflow_dispatch"
  grep -q 'expires_days:' "$workflow" || fail "workflow is missing expires_days"
  grep -q 'default: "7"' "$workflow" || fail "expires_days default is not 7"
  grep -q 'NEON_OPS_EXPIRES_DAYS:' "$workflow" || fail "workflow does not pass expires_days"
  if grep -nE '^[[:space:]]*(schedule|pull_request|push|workflow_call|workflow_run|repository_dispatch):' "$workflow"; then
    fail "neon-ops workflow has an unexpected trigger"
  fi
  if grep -nE '^[[:space:]]+(pull-requests|actions|id-token|packages|deployments|security-events|checks|contents):' "$workflow" | grep -v 'contents: read'; then
    fail "neon-ops workflow permission is not contents: read"
  fi
  banned="set -$(printf 'x')"
  if grep -nF -- "$banned" "$workflow" "${REPO_ROOT}/scripts/neon-ops.sh"; then
    fail "xtrace is present in neon ops"
  fi
  if grep -nF -- "$(printf 'print')$(printf 'env')" "${REPO_ROOT}/scripts/neon-ops.sh"; then
    fail "neon ops prints the environment"
  fi
}

psql_smoke() {
  local summary show_csv stderr_file bad_pass bad_err saved_passfile
  [ "${NEON_OPS_PSQL_SMOKE:-}" = "1" ] || return 0
  [ "${NEON_OPS_ACTION:-}" = "self-test" ] || fail "psql smoke is only available when NEON_OPS_ACTION=self-test"
  case "${PGHOST:-}" in
    127.0.0.1 | localhost) ;;
    *) fail "psql smoke only runs against a local Postgres host" ;;
  esac
  [ "${PGDATABASE:-}" = "neon_ops_smoke" ] || fail "psql smoke only runs against the neon_ops_smoke database"
  [ -n "${NEON_OPS_SMOKE_SENTINEL:-}" ] || fail "psql smoke requires NEON_OPS_SMOKE_SENTINEL"
  [ -n "${PGPASSFILE:-}" ] || fail "psql smoke requires PGPASSFILE"
  require_command psql
  unset PGPASSWORD DATABASE_URL DATABASE_URL_UNPOOLED || true
  summary="$(mktemp)"
  show_csv="$(mktemp)"
  stderr_file="$(mktemp)"
  bad_pass="$(mktemp)"
  bad_err="$(mktemp)"
  chmod 600 "$bad_pass"
  printf '%s\n' "${PGHOST}:${PGPORT:-5432}:${PGDATABASE}:${PGUSER}:${NEON_OPS_SMOKE_SENTINEL}-wrong" >"$bad_pass"
  if PGPASSFILE="$bad_pass" psql -w --no-psqlrc -c 'SELECT 1' >"$bad_err" 2>&1; then
    rm -f "$summary" "$show_csv" "$stderr_file" "$bad_pass" "$bad_err"
    fail "psql connected with the wrong password"
  fi
  if grep -F -q -- "$NEON_OPS_SMOKE_SENTINEL" "$bad_err"; then
    rm -f "$summary" "$show_csv" "$stderr_file" "$bad_pass" "$bad_err"
    fail "psql printed the database password"
  fi
  rm -f "$bad_pass" "$bad_err"
  saved_passfile="$PGPASSFILE"
  export PGPASSFILE="$saved_passfile"
  GITHUB_STEP_SUMMARY="$summary"
  export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000"
  psql_readonly_csv "SHOW default_transaction_read_only;" "$show_csv"
  grep -q '^on$' "$show_csv" || fail "default_transaction_read_only was not on"
  emit "## Neon sync report"
  run_report_query "notion_sync_runs" "$SQL_SYNC_RUNS"
  run_report_query "imported dishes" "$SQL_DISHES"
  if psql_readonly_csv "create temp table neon_ops_write_probe(id integer);" "$show_csv" >"$stderr_file" 2>&1; then
    rm -f "$summary" "$show_csv" "$stderr_file"
    fail "read-only transaction allowed a write"
  fi
  grep -q 'read-only transaction' "$stderr_file" || fail "write probe did not fail because the transaction is read only"
  if grep -F -q -- "$NEON_OPS_SMOKE_SENTINEL" "$summary" "$stderr_file" "$show_csv"; then
    rm -f "$summary" "$show_csv" "$stderr_file"
    fail "psql smoke output contained the database password"
  fi
  grep -q '| started_at | status | added | updated | deleted | inactivated | would_remove | removals_skipped | on_wall |' "$summary" || fail "sync report table header is missing"
  grep -q '| is_active | count |' "$summary" || fail "dish count table header is missing"
  grep -q '| succeeded |' "$summary" || fail "sync report is missing the fixture row"
  grep -q '| t | 2 |' "$summary" || fail "sync report is missing the active dish count"
  grep -q '| f | 1 |' "$summary" || fail "sync report is missing the inactive dish count"
  rm -f "$summary" "$show_csv" "$stderr_file"
  unset GITHUB_STEP_SUMMARY
}

self_test() {
  require_command python3
  require_command jq
  assert_cleanup_keeps_backup_names
  assert_expires_days
  assert_queries_are_fixed
  assert_production_selection
  assert_jq_result
  assert_parser_keeps_password_out_of_stdout
  assert_markdown_table
  assert_workflow_is_manual
  psql_smoke
  log "Neon ops checks passed"
}

snapshot_branch() {
  local branches production parent_id parent_name parent_expires backup_name
  local plan_file subscription_type branches_limit branch_count
  local body response created status
  local created_id created_name created_parent created_expires created_ttl created_init endpoint_count
  local name_status days expires_at
  refuse_xtrace
  # Reject a bad expires_days before any Neon request.
  if ! days="$(resolve_expires_days "${NEON_OPS_EXPIRES_DAYS-}")"; then
    fail "expires_days must be 0 (no expiry) or an integer from 1 to 30"
  fi
  if ! expires_at="$(expires_at_for_days "$days")"; then
    fail "could not build expires_at"
  fi
  if [ -n "$expires_at" ] && ! is_rfc3339 "$expires_at"; then
    fail "expires_at was not RFC3339 UTC"
  fi
  require_neon_auth
  branches="$(mktemp)"
  plan_file="$(mktemp)"
  fetch_neon_branches "$branches"
  production="$(select_production_branch "$branches")"
  parent_id="$(jq -r '.id' <<<"$production")"
  parent_name="$(jq -r '.name' <<<"$production")"
  parent_expires="$(jq -r '.expires_at // ""' <<<"$production")"
  [[ "$parent_id" =~ ^br-[A-Za-z0-9_-]+$ ]] || fail "production branch id is not a Neon branch id"
  [[ "$parent_name" =~ ^[A-Za-z0-9_./-]+$ ]] || fail "production branch name is not safe to print"
  backup_name="backup-$(date -u +%Y%m%d-%H%M)"
  validate_backup_name "$backup_name" || fail "refusing to create ${backup_name}"
  name_status=0
  # $name is a jq variable bound by --arg, not a shell variable.
  # shellcheck disable=SC2016
  jq_result --arg name "$backup_name" 'any(.[]; .name == $name)' "$branches" || name_status=$?
  if [ "$name_status" -eq 0 ]; then
    rm -f "$branches" "$plan_file"
    fail "Neon branch ${backup_name} already exists"
  fi
  if [ "$name_status" -ne 1 ]; then
    rm -f "$branches" "$plan_file"
    fail "could not check whether ${backup_name} already exists"
  fi
  branch_count="$(jq 'length' "$branches")"
  fetch_plan "$plan_file"
  subscription_type="$(jq -r '.subscription_type // ""' "$plan_file")"
  branches_limit="$(jq -r '.branches_limit // ""' "$plan_file")"
  case "$subscription_type" in
    "" | *[!A-Za-z0-9._-]*) subscription_type="" ;;
  esac
  case "$branches_limit" in
    "" | *[!0-9]*) branches_limit="" ;;
  esac
  if [ -n "$branches_limit" ] && [ "$branch_count" -ge "$branches_limit" ]; then
    rm -f "$branches" "$plan_file"
    fail "Neon project already has ${branch_count} branches and the plan limit is ${branches_limit}"
  fi
  log "Neon project: ${NEON_PROJECT_ID}"
  log "Production branch: ${parent_name} (${parent_id})"
  if [ -n "$expires_at" ]; then
    log "Creating ${backup_name} from ${parent_id} with no compute endpoint, expires_at ${expires_at} (${days} days)"
  else
    log "Creating ${backup_name} from ${parent_id} with no compute endpoint and no expires_at"
  fi
  body="$(mktemp)"
  response="$(mktemp)"
  created="$(mktemp)"
  write_branch_create_body "$backup_name" "$parent_id" "$expires_at" >"$body"
  confirm_branch_create_body "$body" "$expires_at"
  status="$(neon_request POST "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches" "$response" "$body")" || fail "Neon API POST did not complete. The branch may already exist; do not retry until that is known."
  if [ "$status" != "201" ] && [ "$status" != "200" ]; then
    api_failure "$status" "$response" "Creating Neon branch ${backup_name}"
    emit "## Neon snapshot"
    emit ""
    emit "Creating \`$(display_text "$backup_name")\` failed with HTTP ${status}."
    rm -f "$branches" "$plan_file" "$body" "$response" "$created"
    fail "could not create Neon branch ${backup_name}"
  fi
  if ! jq -c '
    (.branch // {}) as $branch
    | {
        id: ($branch.id // ""),
        name: ($branch.name // ""),
        parent_id: ($branch.parent_id // ""),
        expires_at: (if ($branch | has("expires_at")) and $branch.expires_at != null then $branch.expires_at else "" end),
        ttl_interval_seconds: (if ($branch | has("ttl_interval_seconds")) and $branch.ttl_interval_seconds != null then ($branch.ttl_interval_seconds | tostring) else "" end),
        init_source: ($branch.init_source // ""),
        endpoint_ids: [(.endpoints // [])[] | (.id // "")]
      }
  ' "$response" >"$created"; then
    rm -f "$branches" "$plan_file" "$body" "$response" "$created"
    fail "Neon branch create response was not JSON"
  fi
  rm -f "$response" "$body"
  created_id="$(jq -r '.id' "$created")"
  created_name="$(jq -r '.name' "$created")"
  created_parent="$(jq -r '.parent_id' "$created")"
  created_expires="$(jq -r '.expires_at' "$created")"
  created_ttl="$(jq -r '.ttl_interval_seconds' "$created")"
  created_init="$(jq -r '.init_source' "$created")"
  endpoint_count="$(jq '.endpoint_ids | length' "$created")"
  [[ "$created_id" =~ ^br-[A-Za-z0-9_-]+$ ]] || fail "created branch id is not a Neon branch id"
  [ "$created_name" = "$backup_name" ] || fail "created branch name did not match ${backup_name}"
  [ "$created_parent" = "$parent_id" ] || fail "created branch parent did not match the production branch"
  if [ -n "$created_expires" ] && ! is_rfc3339 "$created_expires"; then
    fail "created branch expires_at was not empty or a timestamp"
  fi
  case "$created_ttl" in
    "" | *[!0-9]*)
      if [ -n "$created_ttl" ]; then
        fail "created branch ttl_interval_seconds was not a number"
      fi
      ;;
  esac
  case "$created_init" in
    "" | parent-data) ;;
    *) fail "created branch init_source was ${created_init}, expected parent-data" ;;
  esac
  emit "## Neon snapshot"
  emit ""
  emit "- Project: \`$(display_text "$NEON_PROJECT_ID")\`"
  if [ -n "$subscription_type" ]; then
    if [ -n "$branches_limit" ]; then
      emit "- Plan: \`$(display_text "$subscription_type")\` (branch limit ${branches_limit})"
    else
      emit "- Plan: \`$(display_text "$subscription_type")\`"
    fi
  fi
  emit "- Branches before this one: ${branch_count}"
  emit "- Branch: \`$(display_text "$created_name")\`"
  emit "- Id: \`$(display_text "$created_id")\`"
  emit "- Parent: \`$(display_text "$parent_name")\` (\`$(display_text "$created_parent")\`)"
  emit "- Compute endpoints created: ${endpoint_count}"
  emit "- Requested expires_days: ${days}"
  if [ -n "$created_expires" ]; then
    emit "- Expires at: \`$(display_text "$created_expires")\`"
    if [ -n "$created_ttl" ]; then
      emit "- TTL seconds: ${created_ttl}"
    fi
  else
    emit "- Expires at: none"
  fi
  emit ""
  if [ -n "$expires_at" ]; then
    emit "The create request set expires_at to \`$(display_text "$expires_at")\` (${days} days)."
    if [ -z "$created_expires" ]; then
      emit "The response did not include an expiry."
    elif [ "$created_expires" != "$expires_at" ]; then
      emit "The response expiry differs from the requested timestamp."
    fi
  else
    emit "The create request omitted expires_at because expires_days is 0."
    if [ -n "$created_expires" ]; then
      emit "Neon still returned an expiry. This branch will be deleted when that time is reached."
    else
      emit "The response has no expiry. The Neon API does not require one and does not apply one when the field is omitted."
    fi
  fi
  if [ "$endpoint_count" -ne 0 ]; then
    emit ""
    emit "Neon created ${endpoint_count} compute endpoint(s) even though the request omitted endpoints."
  fi
  if [ -n "$parent_expires" ]; then
    emit ""
    if is_rfc3339 "$parent_expires"; then
      emit "Parent branch expiry seen in the branch list: \`$(display_text "$parent_expires")\`."
    else
      emit "Parent branch expiry was present in the branch list but was not a timestamp."
    fi
  fi
  rm -f "$branches" "$plan_file" "$created"
}

fetch_database() {
  local branch_id="$1"
  local outfile="$2"
  local body status count
  body="$(mktemp)"
  status="$(neon_request GET "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches/${branch_id}/databases" "$body")" || fail "Neon API GET did not complete"
  if [ "$status" != "200" ]; then
    api_failure "$status" "$body" "Listing Neon databases"
    rm -f "$body"
    fail "could not list Neon databases"
  fi
  count="$(jq '(.databases // []) | length' "$body")"
  if [ "$count" -ne 1 ]; then
    log "Expected one Neon database on the production branch, found ${count}"
    jq -r '(.databases // [])[] | .name // empty' "$body" | while IFS= read -r name; do
      case "$name" in
        "" | *[!A-Za-z0-9_-]*) log "database name withheld" ;;
        *) log "database: ${name}" ;;
      esac
    done
    rm -f "$body"
    fail "refusing to guess which production database to read"
  fi
  jq -c '.databases[0] | {name, owner_name}' "$body" >"$outfile"
  rm -f "$body"
}

fetch_connection_uri() {
  local branch_id="$1"
  local database="$2"
  local role="$3"
  local outfile="$4"
  local body status database_q role_q branch_q
  body="$(mktemp)"
  branch_q="$(jq -rn --arg value "$branch_id" '$value | @uri')"
  database_q="$(jq -rn --arg value "$database" '$value | @uri')"
  role_q="$(jq -rn --arg value "$role" '$value | @uri')"
  status="$(neon_request GET "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/connection_uri?branch_id=${branch_q}&database_name=${database_q}&role_name=${role_q}&pooled=false" "$body")" || fail "Neon API GET did not complete"
  if [ "$status" != "200" ]; then
    api_failure "$status" "$body" "Reading the Neon connection URI"
    rm -f "$body"
    fail "could not read the Neon connection URI"
  fi
  if ! jq -r '.uri // empty' "$body" >"$outfile"; then
    rm -f "$body" "$outfile"
    fail "connection URI response was not JSON"
  fi
  rm -f "$body"
  [ -s "$outfile" ] || fail "connection URI was empty"
}

sync_report() {
  local branches production parent_id parent_name database_file database role
  local uri_file parsed
  refuse_xtrace
  require_command psql
  require_command python3
  require_neon_auth
  branches="$(mktemp)"
  fetch_neon_branches "$branches"
  production="$(select_production_branch "$branches")"
  parent_id="$(jq -r '.id' <<<"$production")"
  parent_name="$(jq -r '.name' <<<"$production")"
  [[ "$parent_id" =~ ^br-[A-Za-z0-9_-]+$ ]] || fail "production branch id is not a Neon branch id"
  [[ "$parent_name" =~ ^[A-Za-z0-9_./-]+$ ]] || fail "production branch name is not safe to print"
  database_file="$(mktemp)"
  fetch_database "$parent_id" "$database_file"
  database="$(jq -r '.name // empty' "$database_file")"
  role="$(jq -r '.owner_name // empty' "$database_file")"
  [[ "$database" =~ ^[A-Za-z0-9_-]+$ ]] || fail "production database name is not safe to use"
  [[ "$role" =~ ^[A-Za-z0-9_-]+$ ]] || fail "production role name is not safe to use"
  uri_file="$(mktemp)"
  chmod 600 "$uri_file"
  fetch_connection_uri "$parent_id" "$database" "$role" "$uri_file"
  parsed="$(mktemp -d)"
  chmod 700 "$parsed"
  if ! parse_connection_uri "$uri_file" "$parsed"; then
    rm -rf "$parsed"
    rm -f "$uri_file" "$branches" "$database_file"
    fail "could not parse the Neon connection URI"
  fi
  mask_secret_file "$parsed/secrets"
  rm -f "$uri_file" "$parsed/secrets"
  apply_connection_files "$parsed"
  case "$PGSSLMODE" in
    require | verify-ca | verify-full) ;;
    *) fail "refusing to connect without SSL" ;;
  esac
  emit "## Neon sync report"
  emit ""
  emit "- Project: \`$(display_text "$NEON_PROJECT_ID")\`"
  emit "- Branch: \`$(display_text "$parent_name")\` (\`$(display_text "$parent_id")\`)"
  emit "- Database: \`$(display_text "$database")\`"
  emit "- Role: \`$(display_text "$role")\`"
  emit "- Transaction: read only (\`default_transaction_read_only=on\`, then BEGIN / SET TRANSACTION READ ONLY / COMMIT)"
  run_report_query "notion_sync_runs" "$SQL_SYNC_RUNS"
  run_report_query "imported dishes" "$SQL_DISHES"
  run_report_query "menu_items indexes" "$SQL_MENU_INDEXES"
  run_report_query "duplicate custom rows" "$SQL_CUSTOM_DUPLICATES"
  rm -rf "$parsed"
  rm -f "$branches" "$database_file"
}

main() {
  local action
  refuse_xtrace
  workdir="$(mktemp -d)"
  chmod 700 "$workdir"
  export TMPDIR="$workdir"
  action="${NEON_OPS_ACTION:-}"
  self_test
  case "$action" in
    self-test) ;;
    snapshot) snapshot_branch ;;
    sync-report) sync_report ;;
    "") fail "NEON_OPS_ACTION is not set" ;;
    *) fail "unsupported NEON_OPS_ACTION" ;;
  esac
}

main "$@"
