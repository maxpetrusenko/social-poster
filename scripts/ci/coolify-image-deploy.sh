#!/usr/bin/env bash
set -euo pipefail

format_duration() {
  local total_seconds="${1:-0}"
  local minutes=$((total_seconds / 60))
  local seconds=$((total_seconds % 60))
  printf '%dm %02ds' "${minutes}" "${seconds}"
}

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

set_output() {
  local key="$1"
  local value="${2:-}"
  printf '%s=%s\n' "${OUTPUT_PREFIX}${key}" "${value}" >> "${GITHUB_OUTPUT}"
}

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "::error::Set ${key}"
    exit 1
  fi
}

parse_image_tag() {
  python3 -c '
import json, sys
payload = json.load(sys.stdin)
candidates = [
    payload.get("docker_registry_image_tag"),
    payload.get("dockerRegistryImageTag"),
    payload.get("image_tag"),
    payload.get("imageTag"),
]
print(next((str(value) for value in candidates if value), ""))
'
}

parse_deployment_uuid() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)["deployments"][0]["deployment_uuid"])'
}

parse_status() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])'
}

backup_sqlite_database() {
  if [ "${BACKUP_SQLITE_BEFORE_DEPLOY:-false}" != "true" ]; then
    return
  fi

  local raw_label="${BACKUP_LABEL:-${IMAGE_TAG}}"
  local backup_label
  backup_label="$(printf '%s' "${raw_label}" | tr -c 'A-Za-z0-9_.-' '-')"

  log "Creating SQLite backup before deploy"
  # shellcheck disable=SC2029
  backup_path="$(
    ssh "${ssh_opts[@]}" "${ssh_target}" \
      "COOLIFY_UUID='${COOLIFY_UUID}' BACKUP_LABEL='${backup_label}' bash -s" <<'REMOTE'
set -euo pipefail
container_id="$(docker ps --filter "name=${COOLIFY_UUID}" --format "{{.ID}}" | sed -n '1p')"
if [ -z "${container_id}" ]; then
  echo "No running container found for ${COOLIFY_UUID}; cannot create pre-deploy backup" >&2
  exit 1
fi

docker exec \
  -e BACKUP_LABEL="${BACKUP_LABEL}" \
  "${container_id}" \
  node <<'NODE'
const Database = require("better-sqlite3");

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const label = process.env.BACKUP_LABEL || "deploy";
const backupPath = `/data/backups/social-poster-before-${label}-${timestamp}.db`;

(async () => {
  const db = new Database("/data/social-poster.db", { readonly: true });
  await db.backup(backupPath);
  db.close();
  console.log(backupPath);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
REMOTE
  )"

  set_output backup_path "${backup_path}"
  log "SQLite backup created: ${backup_path}"
}

assert_private_health() {
  local healthcheck_started_at
  local healthcheck_seconds

  healthcheck_started_at=$(date +%s)
  log "Running private production healthcheck"
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "${ssh_target}" \
    "COOLIFY_UUID='${COOLIFY_UUID}' COOLIFY_HEALTH_PATH='${COOLIFY_HEALTH_PATH}' bash -s" <<'REMOTE'
set -euo pipefail
container_id="$(docker ps --filter "name=${COOLIFY_UUID}" --format "{{.ID}}" | sed -n '1p')"
if [ -z "${container_id}" ]; then
  echo "No running container found for ${COOLIFY_UUID}" >&2
  exit 1
fi
docker exec "${container_id}" curl --connect-timeout 5 --max-time 10 --fail --silent --show-error "http://127.0.0.1:3000${COOLIFY_HEALTH_PATH}" >/dev/null
REMOTE

  healthcheck_seconds=$(($(date +%s) - healthcheck_started_at))
  set_output healthcheck_seconds "${healthcheck_seconds}"
  log "Private production healthcheck passed in $(format_duration "${healthcheck_seconds}")"
}

assert_supabase_auth_redirects() {
  if [ "${VERIFY_SUPABASE_AUTH_REDIRECTS:-false}" != "true" ]; then
    return
  fi

  log "Checking shared Supabase Auth redirect allowlist"
  ssh "${ssh_opts[@]}" "${ssh_target}" bash -s <<'REMOTE'
set -euo pipefail
env_file="/opt/supabase/.env"

if [ ! -r "${env_file}" ]; then
  echo "Supabase Auth configuration is not readable at ${env_file}" >&2
  exit 1
fi

if ! auth_container_output="$(
  docker compose --env-file "${env_file}" \
    -f "/opt/supabase/docker-compose.yml" ps -q auth 2>/dev/null
)"; then
  echo "Could not resolve the /opt/supabase Compose auth service" >&2
  exit 1
fi

auth_container_ids=()
while IFS= read -r container_id; do
  [ -n "${container_id}" ] && auth_container_ids+=("${container_id}")
done <<<"${auth_container_output}"

if [ "${#auth_container_ids[@]}" -ne 1 ]; then
  echo "Expected exactly one running /opt/supabase Compose auth container" >&2
  exit 1
fi

python3 - "${env_file}" "${auth_container_ids[0]}" <<'PY'
import json
import subprocess
import sys

env_file = sys.argv[1]
auth_container_id = sys.argv[2]
required = {"https://smmagent.app", "https://smmagent.app/**"}


def assert_required(value, source):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    configured = {entry.strip() for entry in value.split(",") if entry.strip()}
    missing = sorted(required - configured)
    if missing:
        print(
            f"{source} is missing required smmagent.app entries: " + ", ".join(missing),
            file=sys.stderr,
        )
        raise SystemExit(1)


file_value = None
with open(env_file, encoding="utf-8") as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if separator and key.strip() == "ADDITIONAL_REDIRECT_URLS":
            file_value = value

if file_value is None:
    print("Supabase Auth file config is missing ADDITIONAL_REDIRECT_URLS", file=sys.stderr)
    raise SystemExit(1)
assert_required(file_value, "Supabase Auth file config ADDITIONAL_REDIRECT_URLS")

try:
    inspection = subprocess.run(
        ["docker", "inspect", auth_container_id],
        check=True,
        capture_output=True,
        text=True,
    )
    container = json.loads(inspection.stdout)[0]
except (subprocess.CalledProcessError, json.JSONDecodeError, IndexError):
    print("Could not inspect the /opt/supabase Compose auth runtime", file=sys.stderr)
    raise SystemExit(1)

runtime_value = None
for entry in container.get("Config", {}).get("Env") or []:
    key, separator, value = entry.partition("=")
    if separator and key == "GOTRUE_URI_ALLOW_LIST":
        runtime_value = value
        break

if runtime_value is None:
    print(
        "No running Supabase Auth runtime exposes GOTRUE_URI_ALLOW_LIST",
        file=sys.stderr,
    )
    raise SystemExit(1)
assert_required(runtime_value, "Supabase Auth runtime GOTRUE_URI_ALLOW_LIST")
PY
REMOTE
  log "Shared Supabase Auth redirect allowlist passed"
}

assert_public_health() {
  if [ "${VERIFY_PUBLIC:-false}" != "true" ]; then
    return
  fi

  if [ -z "${PRODUCTION_URL:-}" ]; then
    echo "::error::Set PRODUCTION_URL when VERIFY_PUBLIC=true"
    exit 1
  fi

  local health_url="${PRODUCTION_URL}/health"
  local api_health_url="${PRODUCTION_URL}/api/health"
  local health_file
  local api_health_file
  health_file="$(mktemp)"
  api_health_file="$(mktemp)"

  log "Checking public health endpoint: ${health_url}"
  set +e
  curl_public_json "${health_url}" "${health_file}"
  local health_exit=$?
  set -e
  if [ "${health_exit}" -eq 10 ]; then
    log "Public /health was blocked by the edge WAF; private production health already passed"
    return
  elif [ "${health_exit}" -ne 0 ]; then
    exit "${health_exit}"
  fi
  python3 -c '
import json, sys
payload = json.load(open(sys.argv[1]))
if payload.get("ok") is not True:
    raise SystemExit(f"public /health returned unexpected payload: {payload}")
' "${health_file}"

  log "Checking public app health endpoint: ${api_health_url}"
  set +e
  curl_public_json "${api_health_url}" "${api_health_file}"
  local api_health_exit=$?
  set -e
  if [ "${api_health_exit}" -eq 10 ]; then
    log "Public /api/health was blocked by the edge WAF; private production health already passed"
    return
  elif [ "${api_health_exit}" -ne 0 ]; then
    exit "${api_health_exit}"
  fi
  python3 -c '
import json, sys
payload = json.load(open(sys.argv[1]))
status = payload.get("status")
drift = payload.get("schedules", {}).get("drift")
if status != "ok":
    raise SystemExit(f"public /api/health status is {status!r}: {payload}")
if drift != 0:
    raise SystemExit(f"public /api/health schedule drift is {drift!r}: {payload}")
' "${api_health_file}"
}

curl_public_json() {
  local url="$1"
  local output_file="$2"
  local status

  status="$(
    curl --connect-timeout 10 --max-time 20 --silent --show-error \
      --retry 6 --retry-delay 5 --retry-all-errors \
      --user-agent "Mozilla/5.0 SocialPosterDeployCanary/1.0" \
      --header "Accept: application/json,text/plain,*/*" \
      --header "Cache-Control: no-cache" \
      --output "${output_file}" \
      --write-out "%{http_code}" \
      "${url}" || true
  )"

  if [ "${status}" = "403" ]; then
    echo "::warning::Public canary was blocked by the edge WAF for ${url}"
    return 10
  fi
  if ! [[ "${status}" =~ ^[0-9]+$ ]] || [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    cat "${output_file}" >&2 || true
    echo "::error::Public canary returned HTTP ${status} for ${url}"
    return 1
  fi
}

require_env COOLIFY_API_TOKEN
require_env COOLIFY_SSH_PRIVATE_KEY
require_env COOLIFY_UUID
require_env IMAGE_TAG

COOLIFY_SSH_HOST="${COOLIFY_SSH_HOST:-173.249.52.27}"
COOLIFY_SSH_USER="${COOLIFY_SSH_USER:-root}"
COOLIFY_HEALTH_PATH="${COOLIFY_HEALTH_PATH:-/api/health}"
OUTPUT_PREFIX="${OUTPUT_PREFIX:-}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-90}"

started_at=$(date +%s)
set_output image_tag "${IMAGE_TAG}"
set_output deployment_status started

install -m 700 -d ~/.ssh
key_file="$HOME/.ssh/coolify_deploy_key"
printf '%s\n' "${COOLIFY_SSH_PRIVATE_KEY}" > "${key_file}"
chmod 600 "${key_file}"

if [ -n "${COOLIFY_SSH_KNOWN_HOSTS:-}" ]; then
  printf '%s\n' "${COOLIFY_SSH_KNOWN_HOSTS}" >> ~/.ssh/known_hosts
else
  ssh-keyscan -H "${COOLIFY_SSH_HOST}" >> ~/.ssh/known_hosts
fi

ssh_opts=(
  -i "${key_file}"
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o IdentitiesOnly=yes
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
  -o StrictHostKeyChecking=yes
)

token_b64="$(printf '%s' "${COOLIFY_API_TOKEN}" | base64 | tr -d '\n')"
ssh_target="${COOLIFY_SSH_USER}@${COOLIFY_SSH_HOST}"

assert_supabase_auth_redirects

if [ "${READ_PREVIOUS_IMAGE_TAG:-false}" = "true" ]; then
  log "Reading current Coolify image tag before deploy"
  # shellcheck disable=SC2029
  application_response="$(
    ssh "${ssh_opts[@]}" "${ssh_target}" \
      "COOLIFY_API_TOKEN_B64='${token_b64}' COOLIFY_UUID='${COOLIFY_UUID}' bash -s" <<'REMOTE'
set -euo pipefail
COOLIFY_API_TOKEN="$(printf '%s' "${COOLIFY_API_TOKEN_B64}" | base64 -d)"
curl --connect-timeout 10 --max-time 30 --fail --silent --show-error \
  --url "http://127.0.0.1:8000/api/v1/applications/${COOLIFY_UUID}" \
  --header "Authorization: Bearer ${COOLIFY_API_TOKEN}"
REMOTE
  )"

  previous_image_tag="$(parse_image_tag <<<"${application_response}")"
  set_output previous_image_tag "${previous_image_tag}"
  if [ -n "${previous_image_tag}" ]; then
    log "Previous Coolify image tag: ${previous_image_tag}"
  else
    log "Previous Coolify image tag unavailable"
  fi

  if [ "${previous_image_tag:-}" = "${IMAGE_TAG}" ] && [ "${FORCE_REDEPLOY_SAME_IMAGE:-false}" != "true" ]; then
    log "Image tag ${IMAGE_TAG} is already deployed; skipping no-op Coolify rollout"
    set_output deployment_uuid "noop-same-image"
    set_output deployment_status "skipped_same_image"
    set_output rollout_seconds "0"
    assert_private_health
    assert_public_health
    exit 0
  fi
fi

backup_sqlite_database

log "Updating Coolify image tag to ${IMAGE_TAG}"
# shellcheck disable=SC2029
deploy_response="$(
  ssh "${ssh_opts[@]}" "${ssh_target}" \
    "COOLIFY_API_TOKEN_B64='${token_b64}' COOLIFY_UUID='${COOLIFY_UUID}' IMAGE_TAG='${IMAGE_TAG}' bash -s" <<'REMOTE'
set -euo pipefail
COOLIFY_API_TOKEN="$(printf '%s' "${COOLIFY_API_TOKEN_B64}" | base64 -d)"
api_base="http://127.0.0.1:8000/api/v1"

curl --connect-timeout 10 --max-time 30 --fail --silent --show-error \
  --request PATCH \
  --url "${api_base}/applications/${COOLIFY_UUID}" \
  --header "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{\"docker_registry_image_tag\":\"${IMAGE_TAG}\"}" \
  >/dev/null

curl --connect-timeout 10 --max-time 30 --fail --silent --show-error \
  --request POST \
  --url "${api_base}/deploy?uuid=${COOLIFY_UUID}&force=false" \
  --header "Authorization: Bearer ${COOLIFY_API_TOKEN}"
REMOTE
)"

echo "${deploy_response}"
deployment_uuid="$(parse_deployment_uuid <<<"${deploy_response}")"
set_output deployment_uuid "${deployment_uuid}"
log "Coolify deployment queued: ${deployment_uuid}"
echo "::notice title=Coolify deployment queued::${deployment_uuid}"

last_status_response=""
for attempt in $(seq 1 "${POLL_ATTEMPTS}"); do
  # shellcheck disable=SC2029
  status_response="$(
    ssh "${ssh_opts[@]}" "${ssh_target}" \
      "COOLIFY_API_TOKEN_B64='${token_b64}' DEPLOYMENT_UUID='${deployment_uuid}' bash -s" <<'REMOTE'
set -euo pipefail
COOLIFY_API_TOKEN="$(printf '%s' "${COOLIFY_API_TOKEN_B64}" | base64 -d)"
curl --connect-timeout 10 --max-time 15 --fail --silent --show-error \
  --url "http://127.0.0.1:8000/api/v1/deployments/${DEPLOYMENT_UUID}" \
  --header "Authorization: Bearer ${COOLIFY_API_TOKEN}"
REMOTE
  )"
  last_status_response="${status_response}"

  status="$(parse_status <<<"${status_response}")"
  elapsed_seconds=$(($(date +%s) - started_at))
  set_output deployment_status "${status}"
  set_output poll_attempts "${attempt}"
  set_output rollout_seconds "${elapsed_seconds}"
  log "Coolify status=${status} attempt=${attempt}/${POLL_ATTEMPTS} elapsed=$(format_duration "${elapsed_seconds}") deployment=${deployment_uuid}"

  if [ "${status}" = "finished" ]; then
    log "Coolify finished"
    assert_private_health
    total_seconds=$(($(date +%s) - started_at))
    set_output rollout_seconds "${total_seconds}"

    assert_public_health
    [ "${VERIFY_PUBLIC:-false}" = "true" ] && log "Public production canary passed"
    exit 0
  fi

  if [ "${status}" != "in_progress" ] && [ "${status}" != "queued" ]; then
    echo "${status_response}"
    echo "::error::Coolify deployment ended with status ${status}"
    exit 1
  fi

  sleep 10
done

if [ -n "${last_status_response}" ]; then
  echo "${last_status_response}"
fi
echo "::error::Timed out waiting for Coolify deployment ${deployment_uuid}"
exit 1
