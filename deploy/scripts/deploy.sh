#!/usr/bin/env bash
# deploy.sh — Powrth production deployment
# Called by GitHub Actions after image push.
# Safety guarantee: image is pulled and verified before the old container is removed.
set -euo pipefail

# ─── Required env vars ────────────────────────────────────────────────────────
: "${IMAGE_OWNER:?IMAGE_OWNER is required}"
: "${REPO_NAME:?REPO_NAME is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

# ─── Constants ────────────────────────────────────────────────────────────────
APP_DIR="/opt/apps/powrth"
COMPOSE_FILE="${APP_DIR}/compose.yml"
CONTAINER="powrth-api"
IMAGE="ghcr.io/${IMAGE_OWNER}/${REPO_NAME}-api:${IMAGE_TAG}"
HEALTH_URL="http://localhost:3001/health"
HEALTH_MAX_WAIT=30   # seconds
HEALTH_INTERVAL=2    # seconds between retries

# ─── Save previous tag for rollback reference ─────────────────────────────────
PREVIOUS_TAG=""
if [[ -f "${APP_DIR}/image.env" ]]; then
  PREVIOUS_TAG=$(grep "^IMAGE_TAG=" "${APP_DIR}/image.env" | cut -d= -f2 || true)
fi

echo "[deploy] ──────────────────────────────────────────────────"
echo "[deploy] Target:   ${IMAGE}"
[[ -n "${PREVIOUS_TAG}" ]] && echo "[deploy] Previous: ghcr.io/${IMAGE_OWNER}/${REPO_NAME}-api:${PREVIOUS_TAG}"
echo "[deploy] ──────────────────────────────────────────────────"

# ─── Step 1: Pull new image ───────────────────────────────────────────────────
# Pull before touching the running container.
# If the pull fails, the old container keeps running unaffected.
echo "[deploy] Pulling image..."
docker pull "${IMAGE}"

# ─── Step 2: Run database migrations ─────────────────────────────────────────
# One-off container using the new image. Runs against the shared postgres
# on the alpha network. If migrations fail, the old container is still running.
echo "[deploy] Running database migrations..."
docker run --rm \
  --network alpha \
  --env-file "${APP_DIR}/.env" \
  "${IMAGE}" \
  node_modules/.bin/prisma migrate deploy

# ─── Step 3: Replace container ───────────────────────────────────────────────
# Only reached if pull + migrations both succeeded.
echo "[deploy] Stopping old container..."
docker rm -f "${CONTAINER}" 2>/dev/null || true

echo "[deploy] Starting new container..."
IMAGE_OWNER="${IMAGE_OWNER}" \
REPO_NAME="${REPO_NAME}" \
IMAGE_TAG="${IMAGE_TAG}" \
docker compose -f "${COMPOSE_FILE}" up -d

# ─── Step 4: Health check ────────────────────────────────────────────────────
echo "[deploy] Waiting for health check at ${HEALTH_URL}..."
ELAPSED=0
until curl -sf "${HEALTH_URL}" > /dev/null 2>&1; do
  if [[ ${ELAPSED} -ge ${HEALTH_MAX_WAIT} ]]; then
    echo "[deploy] ERROR: Health check failed after ${HEALTH_MAX_WAIT}s."
    echo "[deploy] The new container may be running but unhealthy."
    echo "[deploy] Check logs: docker logs ${CONTAINER}"
    if [[ -n "${PREVIOUS_TAG}" ]]; then
      echo "[deploy] To rollback to the previous version:"
      echo "  cd ${APP_DIR}"
      echo "  IMAGE_OWNER=${IMAGE_OWNER} REPO_NAME=${REPO_NAME} IMAGE_TAG=${PREVIOUS_TAG} bash scripts/deploy.sh"
    fi
    exit 1
  fi
  sleep "${HEALTH_INTERVAL}"
  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
done

echo "[deploy] Health check passed (${ELAPSED}s)."

# ─── Step 5: Persist image tag for systemd / manual rollback ─────────────────
cat > "${APP_DIR}/image.env" << EOF
IMAGE_OWNER=${IMAGE_OWNER}
REPO_NAME=${REPO_NAME}
IMAGE_TAG=${IMAGE_TAG}
EOF

echo "[deploy] ──────────────────────────────────────────────────"
echo "[deploy] Done. Running: ${IMAGE}"
echo "[deploy] ──────────────────────────────────────────────────"
