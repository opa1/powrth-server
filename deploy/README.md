# Powrth — Server Deployment

Production server: `129.213.16.57` (OCI ARM64, Ubuntu 24.04)

Deployed to: `/opt/apps/powrth/`
Systemd unit: `powrth.service` (depends on `infra.service`)
HTTP (internal): `127.0.0.1:3001` — Caddy proxies this
TCP (public): `0.0.0.0:8765` — smart meter connections

---

## First-time server setup

Run these once on the server as a user with sudo and Docker access.

### 1. Create the app directory

```bash
sudo mkdir -p /opt/apps/powrth/scripts
sudo chown -R $USER:$USER /opt/apps/powrth
```

### 2. Create the .env file

```bash
cp deploy/.env.example /opt/apps/powrth/.env
nano /opt/apps/powrth/.env   # fill in all REPLACE_WITH_* values
```

> **MASTER_MNEMONIC warning**: every user wallet is derived from this value.
> Back it up offline before starting the app. Losing it means permanent loss
> of access to all platform-managed wallets.

### 3. Create image.env

This file tells systemd which image to start on boot.

```bash
cat > /opt/apps/powrth/image.env << 'EOF'
IMAGE_OWNER=devfreeguy
REPO_NAME=powrth-server
IMAGE_TAG=latest
EOF
```

After the first CI deploy, `deploy.sh` keeps this file up to date automatically
with the deployed sha tag.

### 4. Create the systemd unit

```bash
sudo nano /etc/systemd/system/powrth.service
```

Paste:

```ini
[Unit]
Description=Powrth Server
After=infra.service
Requires=infra.service

[Service]
Type=oneshot
RemainAfterExit=yes
EnvironmentFile=/opt/apps/powrth/image.env
WorkingDirectory=/opt/apps/powrth
ExecStart=/usr/bin/docker compose -f /opt/apps/powrth/compose.yml up -d
ExecStop=/usr/bin/docker compose -f /opt/apps/powrth/compose.yml down

[Install]
WantedBy=multi-user.target
```

### 5. Enable the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable powrth.service
```

The service will start automatically on the next boot after `infra.service` is up.
For the first run, trigger it manually after step 6.

### 6. Authenticate with GHCR (one-time)

The deploy workflow logs in using a short-lived `GITHUB_TOKEN` on every run.
For manual pulls or systemd restarts without CI, the server needs its own credentials:

```bash
# Use a GitHub PAT with read:packages scope
echo "YOUR_PAT" | docker login ghcr.io -u devfreeguy --password-stdin
```

Docker stores the credentials in `~/.docker/config.json`.

### 7. GitHub Actions secrets

Add these in the repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SERVER_HOST` | `129.213.16.57` |
| `SERVER_USER` | your SSH username on the OCI VM |
| `SERVER_KEY` | private key corresponding to an authorized_keys entry on the VM |

---

## Normal deployments

Push to `main` — the workflow runs automatically:
1. **verify** — build, test, lint
2. **build-and-push** — multi-platform Docker image pushed to GHCR
3. **deploy** — syncs compose + scripts, runs `deploy.sh` on the server

`deploy.sh` safety order:
1. Pull new image (abort if pull fails — old container keeps running)
2. Run `prisma migrate deploy` via a one-off container (abort if migrations fail)
3. Remove old container
4. Start new container via compose
5. Health check `http://localhost:3001/health` (30s timeout)
6. Update `image.env` with the new sha tag

---

## Rollback

The previous sha tag is printed in `deploy.sh` output if the health check fails.
To redeploy a previous version manually on the server:

```bash
cd /opt/apps/powrth

IMAGE_OWNER=devfreeguy \
REPO_NAME=powrth-server \
IMAGE_TAG=sha-PREVIOUS \
bash scripts/deploy.sh
```

Replace `sha-PREVIOUS` with the sha tag from the GHCR image history
or the previous value of `IMAGE_TAG` in `image.env`.

After a successful rollback, `image.env` is updated to the rolled-back tag,
so systemd restarts also use the correct image.

---

## Checking the running app

```bash
# Container status
docker ps | grep powrth

# Logs
docker logs powrth-api --tail 100 -f

# Health
curl http://localhost:3001/health

# Meter TCP connections
ss -tnp | grep 8765
```

## Redis

The `alpha` network has a shared `redis` container. `REDIS_URL` and
`REDIS_KEY_PREFIX` are included in `.env` for future use. The current app
version does not connect to Redis — adding it will not cause errors.
