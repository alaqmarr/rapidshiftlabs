# RapidShift Labs — Production Deployment Guide

This guide provides end-to-end instructions for deploying and running the **RapidShift Labs Control Plane** on an **Ubuntu 22.04 LTS or 24.04 LTS Virtual Machine**, optimized for **Oracle Cloud Infrastructure (OCI)** Always Free or Paid Compute.

---

## Architecture Overview

RapidShift Labs runs on a single hardened Ubuntu VM utilizing an event-driven, process-supervised architecture:

```
                              Internet
                                 │
                                 ▼
                     [ Nginx Reverse Proxy + TLS ]
                       Ports :80 (HTTP), :443 (HTTPS)
                                 │
           ┌─────────────────────┴─────────────────────┐
           │                                           │
  Host: admin.* / portal.*                    Host: api.* / embed.*
           │                                           │
           ▼                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  PM2 Process 1: rapidshift-portal (@rsl/portal)                  │
│  Next.js 16 App Router on http://127.0.0.1:3000                  │
│  - /admin/* (Staff Control Plane)                                │
│  - /portal/* (Client Self-Service Dashboard)                     │
│  - /api/* (Public REST & SSE Real-time Gateways)                 │
│  - /embed/* (Client-embeddable widgets via iframe)               │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  PM2 Process 2: rapidshift-worker (@rsl/worker)                  │
│  Background Automation Engine (Daemon)                           │
│  - Transactional Outbox Event Dispatcher                         │
│  - Automated Invoicing & Dunning Reminders                       │
│  - Real-time Domain & SSL Health Probes                          │
│  - Server Fleet Metrics Telemetry                                │
│  - Support Desk 24x7 SLA Escalations                             │
│  - Daily / Hourly Analytics Rollups                              │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Persistent Storage: SQLite 3 via libSQL (WAL Mode)              │
│  Directory: /var/www/rapidshiftlabs/data/                        │
│  - core.db      (Entities, auth, contracts, billing, audit)      │
│  - analytics.db (Visitor events, aggregates, rollups)            │
│  - metrics.db   (Fleet & domain time-series samples)             │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Automated Backups: deploy/scripts/backup-db.sh                  │
│  - Non-blocking online snapshot via SQLite .backup API           │
│  - PRAGMA integrity_check validation & SHA256 checksums          │
│  - Automatic retention policy (14-day rotation via cron at 02:00)│
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Oracle Cloud VM Prerequisites

### 1.1 Recommended Compute Shapes

- **Oracle Cloud Always Free Ampere A1** (`VM.Standard.A1.Flex`): 2–4 OCPUs, 12–24 GB RAM (Recommended).
- **Oracle Cloud Always Free AMD** (`VM.Standard.E2.1.Micro`): 1 OCPU, 1 GB RAM (Supported; our setup script automatically provisions a 2 GB swapfile so Next.js builds succeed without OOM errors).
- **Operating System**: Ubuntu 22.04 LTS (`jammy`) or Ubuntu 24.04 LTS (`noble`).

### 1.2 Oracle Cloud VCN Ingress Rules (CRITICAL)

In the Oracle Cloud Web Console:

1. Navigate to **Networking** > **Virtual Cloud Networks (VCN)**.
2. Select your VCN and click on **Security Lists** > **Default Security List for your VCN**.
3. Under **Ingress Rules**, ensure the following stateful TCP ingress rules exist:
   - **SSH**: Source CIDR `0.0.0.0/0`, Destination Port Range `22`
   - **HTTP**: Source CIDR `0.0.0.0/0`, Destination Port Range `80`
   - **HTTPS**: Source CIDR `0.0.0.0/0`, Destination Port Range `443`

> [!IMPORTANT]
> Without opening ports 80 and 443 in the Oracle Cloud Console Security List, external HTTP/HTTPS traffic will be dropped at the Oracle cloud edge before reaching your VM.

---

## 2. Automated Host Bootstrap

Connect to your clean Ubuntu VM via SSH:

```bash
ssh -i ~/.ssh/your_oci_key ubuntu@<YOUR_VM_PUBLIC_IP>
```

Clone or copy the repository onto the VM, then run the automated bootstrap script with root privileges:

```bash
# Clone the repository (or upload repository files)
git clone https://github.com/rapidshiftlabs/rapidshiftlabs.git /tmp/rapidshiftlabs

# Run the automated host setup script
sudo bash /tmp/rapidshiftlabs/deploy/scripts/setup-ubuntu.sh
```

### What `setup-ubuntu.sh` Automates:

1. Updates OS packages and installs build essentials, `curl`, `git`, `jq`, `sqlite3`, and `logrotate`.
2. Creates and mounts a **2 GB swap file** (`/swapfile`) to prevent OOM errors on small RAM instances.
3. Installs **Node.js 22 LTS** from the official NodeSource repository.
4. Installs **pnpm** and **PM2** process supervisor globally.
5. Installs **Nginx** reverse proxy and **Certbot** (`python3-certbot-nginx`).
6. Configures **UFW firewall** (allowing ports 22, 80, 443) and applies the **Oracle Cloud iptables fix** (preventing default OCI reject rules from dropping ports 80/443).
7. Creates a dedicated, unprivileged system user (`rapidshift`) and secure directory tree (`/var/www/rapidshiftlabs`, `/var/www/rapidshiftlabs/data`, `/var/backups/rapidshiftlabs`, `/var/log/rapidshiftlabs`).
8. Configures Linux **logrotate** (`/etc/logrotate.d/rapidshift`) for PM2 and application logs.
9. Installs the **automated daily database backup cron job** (02:00 AM) in `rapidshift`'s crontab.
10. Enables **PM2 systemd startup** service for automatic process recovery upon VM reboot.

---

## 3. Application Deployment & Environment Setup

### 3.1 Place Code in Production Directory

Move or clone the project into `/var/www/rapidshiftlabs` and set ownership to `rapidshift`:

```bash
# Copy files if cloned to /tmp, or clone directly
sudo cp -r /tmp/rapidshiftlabs/* /tmp/rapidshiftlabs/.* /var/www/rapidshiftlabs/ 2>/dev/null || true
sudo chown -R rapidshift:rapidshift /var/www/rapidshiftlabs
sudo chmod 750 /var/www/rapidshiftlabs
```

### 3.2 Configure Environment Variables

Switch to the `rapidshift` system user:

```bash
sudo -u rapidshift -i
cd /var/www/rapidshiftlabs
```

Generate a secure production `.env` file (`chmod 600`):

```bash
# Replace these values with your actual domains
ADMIN_DOMAIN="admin.yourdomain.com"
PORTAL_DOMAIN="app.yourdomain.com"
API_DOMAIN="api.yourdomain.com"

cat << EOF > /var/www/rapidshiftlabs/.env
NODE_ENV=production
PORT=3000
DATA_DIR=/var/www/rapidshiftlabs/data

# Cryptographic Keys (Auto-generated 32-byte hex strings)
AUTH_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)

# Hostname and Base URL Routing
ADMIN_HOST=${ADMIN_DOMAIN}
PORTAL_HOST=${PORTAL_DOMAIN}
API_HOST=${API_DOMAIN}
ADMIN_URL=https://${ADMIN_DOMAIN}
PORTAL_URL=https://${PORTAL_DOMAIN}
API_URL=https://${API_DOMAIN}

# Logging Level
LOG_LEVEL=info
EOF

chmod 600 /var/www/rapidshiftlabs/.env
```

### 3.3 Environment Variables Reference

| Variable      | Required | Description                                    | Example                        |
| ------------- | -------- | ---------------------------------------------- | ------------------------------ |
| `NODE_ENV`    | **Yes**  | Execution mode                                 | `production`                   |
| `PORT`        | **Yes**  | Web portal internal listening port             | `3000`                         |
| `DATA_DIR`    | **Yes**  | Persistent SQLite storage location             | `/var/www/rapidshiftlabs/data` |
| `AUTH_SECRET` | **Yes**  | 32-byte hex string for Auth.js session signing | `openssl rand -hex 32`         |
| `MASTER_KEY`  | **Yes**  | 32-byte hex string for AES-256-GCM encryption  | `openssl rand -hex 32`         |
| `ADMIN_HOST`  | **Yes**  | FQDN domain for admin portal                   | `admin.yourdomain.com`         |
| `PORTAL_HOST` | **Yes**  | FQDN domain for client dashboard               | `app.yourdomain.com`           |
| `API_HOST`    | **Yes**  | FQDN domain for APIs and embeds                | `api.yourdomain.com`           |
| `ADMIN_URL`   | **Yes**  | Public HTTPS URL for admin                     | `https://admin.yourdomain.com` |
| `PORTAL_URL`  | **Yes**  | Public HTTPS URL for portal                    | `https://app.yourdomain.com`   |
| `API_URL`     | **Yes**  | Public HTTPS URL for API                       | `https://api.yourdomain.com`   |
| `LOG_LEVEL`   | No       | Logging verbosity (`info`, `debug`, `warn`)    | `info`                         |

---

## 4. Install Dependencies, Migrate Databases & Seed Admin

Still as user `rapidshift`:

### 4.1 Install Workspace Dependencies

```bash
pnpm install --frozen-lockfile
```

### 4.2 Run Database Migrations

Initialize schemas in `/var/www/rapidshiftlabs/data/core.db`:

```bash
pnpm db:migrate
```

### 4.3 Verify WAL Mode on SQLite Databases

Verify that each SQLite database is in Write-Ahead Logging mode:

```bash
for db in core.db analytics.db metrics.db; do
  echo "=== $db ==="
  sqlite3 /var/www/rapidshiftlabs/data/$db "PRAGMA journal_mode; PRAGMA busy_timeout; PRAGMA synchronous;"
done
```

**Expected Output:**

```
=== core.db ===
wal
5000
1
=== analytics.db ===
wal
5000
1
=== metrics.db ===
wal
5000
1
```

### 4.4 Create Initial Owner Administrator Account

Create your primary administrator account:

```bash
pnpm admin:create admin@yourdomain.com 'YourStrongPassword123!'
```

Verify that the user is registered in `core.db`:

```bash
sqlite3 /var/www/rapidshiftlabs/data/core.db "SELECT id, email, role, status FROM users WHERE email='admin@yourdomain.com';"
```

---

## 5. Build Application & Supervise with PM2

### 5.1 Build Production Artifacts

Compile the Next.js App Router portal and worker:

```bash
pnpm build
```

### 5.2 Start Processes with PM2

We use `ecosystem.config.cjs`, which configures:

- `@rsl/portal`: `next start --port 3000`
- `@rsl/worker`: `apps/worker` daemon via `tsx` or compiled `dist/`
- Memory limits: `1GB` max memory before auto-restart
- Exponential backoff restart delays
- Unified log files: `/var/www/rapidshiftlabs/logs/portal.log` and `/var/www/rapidshiftlabs/logs/worker.log`

Start the applications:

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

Save the process list to ensure it restores on reboot:

```bash
pm2 save
```

Verify logs:

```bash
pm2 logs --lines 20
```

---

## 6. Configure Nginx & Let's Encrypt SSL

Switch back to the `ubuntu` user with sudo access:

```bash
exit
```

### 6.1 Configure DNS

Before requesting SSL certificates, ensure your DNS provider has `A` records pointing your domains to your Oracle Cloud VM's Public IPv4 address:

- `admin.yourdomain.com` -> `<VM_PUBLIC_IP>`
- `app.yourdomain.com` -> `<VM_PUBLIC_IP>`
- `portal.yourdomain.com` -> `<VM_PUBLIC_IP>`
- `api.yourdomain.com` -> `<VM_PUBLIC_IP>`

### 6.2 Install Nginx Site Configuration

Copy the production configuration template from the repository:

```bash
sudo cp /var/www/rapidshiftlabs/deploy/nginx/rapidshift.conf /etc/nginx/sites-available/rapidshift.conf
```

Edit `/etc/nginx/sites-available/rapidshift.conf` and update `server_name` with your actual domains:

```bash
sudo nano /etc/nginx/sites-available/rapidshift.conf
```

Enable the site and disable the default site:

```bash
sudo ln -sf /etc/nginx/sites-available/rapidshift.conf /etc/nginx/sites-enabled/rapidshift.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

### 6.3 Obtain Let's Encrypt SSL Certificate

Run Certbot to automatically obtain and configure TLS certificates:

```bash
sudo certbot --nginx \
  -d admin.yourdomain.com \
  -d app.yourdomain.com \
  -d portal.yourdomain.com \
  -d api.yourdomain.com \
  --agree-tos \
  --email admin@yourdomain.com \
  --non-interactive
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Automated WAL-Safe Database Backups

RapidShift Labs provides an online, non-blocking backup script at `deploy/scripts/backup-db.sh`.

### 7.1 How It Works

- Executes `sqlite3 <db> ".backup '<backup-file>'"` using SQLite's native Online Backup API.
- Backs up `core.db`, `analytics.db`, and `metrics.db`.
- Does **not** block concurrent web reads or background worker writes in WAL mode.
- Validates each backup file using `PRAGMA integrity_check;`. If corruption is detected, the backup is quarantined.
- Generates a `sha256` checksum for cryptographic verification.
- Enforces a 14-day retention window, automatically deleting backups older than 14 days.

### 7.2 Run a Manual Backup Test

Test the backup script:

```bash
sudo -u rapidshift bash /var/www/rapidshiftlabs/deploy/scripts/backup-db.sh
```

Inspect the backup directory:

```bash
ls -lh /var/backups/rapidshiftlabs/
```

### 7.3 Automated Cron Schedule

The bootstrap script automatically installs the cron job in `rapidshift`'s crontab:

```bash
crontab -u rapidshift -l
```

**Output:**

```
0 2 * * * /var/www/rapidshiftlabs/deploy/scripts/backup-db.sh >> /var/log/rapidshiftlabs/backup.log 2>&1
```

### 7.4 Disaster Recovery & Restore Runbook

In case of hardware failure or accidental corruption, restore from a verified backup:

```bash
# 1. Stop PM2 processes to halt all database operations
sudo -u rapidshift pm2 stop all

# 2. Identify latest valid backup
LATEST_CORE=$(ls -t /var/backups/rapidshiftlabs/core-*.db | head -n 1)
echo "Restoring from: ${LATEST_CORE}"

# 3. Verify SHA256 checksum
cd /var/backups/rapidshiftlabs
sha256sum -c "${LATEST_CORE}.sha256"

# 4. Safely quarantine existing data directory
sudo mv /var/www/rapidshiftlabs/data /var/www/rapidshiftlabs/data_backup_$(date +%s)
sudo mkdir -p /var/www/rapidshiftlabs/data
sudo chown rapidshift:rapidshift /var/www/rapidshiftlabs/data
sudo chmod 700 /var/www/rapidshiftlabs/data

# 5. Copy restored databases
sudo -u rapidshift cp "${LATEST_CORE}" /var/www/rapidshiftlabs/data/core.db
LATEST_ANALYTICS=$(ls -t /var/backups/rapidshiftlabs/analytics-*.db 2>/dev/null | head -n 1 || true)
[ -n "${LATEST_ANALYTICS}" ] && sudo -u rapidshift cp "${LATEST_ANALYTICS}" /var/www/rapidshiftlabs/data/analytics.db
LATEST_METRICS=$(ls -t /var/backups/rapidshiftlabs/metrics-*.db 2>/dev/null | head -n 1 || true)
[ -n "${LATEST_METRICS}" ] && sudo -u rapidshift cp "${LATEST_METRICS}" /var/www/rapidshiftlabs/data/metrics.db

# 6. Verify integrity of restored files
for db in core.db analytics.db metrics.db; do
  if [ -f "/var/www/rapidshiftlabs/data/$db" ]; then
    echo "Checking $db: $(sqlite3 /var/www/rapidshiftlabs/data/$db "PRAGMA integrity_check;")"
  fi
done

# 7. Restart application processes
sudo -u rapidshift pm2 start all
sudo -u rapidshift pm2 status
```

---

## 8. Verification & Smoke Testing

### 8.1 Health Endpoint

Verify that the Next.js portal is responding and connected to the database:

```bash
curl -i http://127.0.0.1:3000/api/v1/health
```

**Expected Response:** `200 OK` with JSON payload confirming healthy status.

### 8.2 Real-Time SSE Streaming Verification

Verify that Nginx is not buffering Server-Sent Events (SSE):

```bash
curl -N -H "Accept: text/event-stream" "http://127.0.0.1:3000/api/stream"
```

You should see incoming events flush immediately without stalling.

### 8.3 Embeddable Widgets Framing Test

Verify that `/embed/*` routes permit third-party iframe embedding while main portal routes deny it:

```bash
# Main portal should return X-Frame-Options: SAMEORIGIN
curl -I https://app.yourdomain.com/portal | grep -i "x-frame-options"

# Embed route should NOT return X-Frame-Options (or returns frame-ancestors *)
curl -I https://app.yourdomain.com/embed/widget | grep -i "x-frame-options"
```

---

## 9. Zero-Downtime Updates Runbook

When deploying updates to production:

```bash
sudo -u rapidshift -i
cd /var/www/rapidshiftlabs

# 1. Pull latest git changes
git fetch origin main
git pull origin main

# 2. Install any updated dependencies
pnpm install --frozen-lockfile

# 3. Apply schema migrations
pnpm db:migrate

# 4. Build fresh production assets
pnpm build

# 5. Reload PM2 processes with zero downtime
pm2 reload ecosystem.config.cjs

# 6. Check health
curl -f http://127.0.0.1:3000/api/v1/health
```

---

## 10. Operational Troubleshooting

| Symptom                                        | Cause                                                             | Solution                                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cannot connect via HTTP/HTTPS**              | Oracle VCN Ingress Rules missing or local firewall blocking ports | Verify Oracle Cloud VCN Ingress Rules allow TCP 80/443. Check `sudo ufw status` and run `sudo iptables -L INPUT -n` to ensure no Oracle drop rules precede ACCEPT. |
| **502 Bad Gateway from Nginx**                 | Next.js portal crashed or port 3000 is occupied                   | Check `pm2 status` and `pm2 logs rapidshift-portal --lines 50`. Confirm `node_modules/.bin/next start --port 3000` is running.                                     |
| **Out of Memory during `pnpm build`**          | VM has 1 GB RAM and no swap                                       | Check `free -m`. Ensure `/swapfile` is active via `swapon --show`.                                                                                                 |
| **`SQLITE_BUSY: database is locked`**          | Long transaction or SQLite not in WAL mode                        | Verify WAL mode: `sqlite3 data/core.db "PRAGMA journal_mode;"`. Ensure all writers use `BEGIN IMMEDIATE`.                                                          |
| **SSE stream stalls or disconnects after 60s** | Nginx proxy buffering or proxy timeout                            | Ensure `proxy_buffering off;`, `proxy_cache off;`, and `proxy_read_timeout 86400s;` are set in the `/api/stream` location block in Nginx.                          |
| **iframe cannot load `/embed/*`**              | `X-Frame-Options: SAMEORIGIN` applied to embed route              | Verify that the dynamic `$x_frame_options` map or dedicated `/embed/` location block in `/etc/nginx/sites-available/rapidshift.conf` is loaded.                    |
