# RapidShift Control Plane — Production Deployment Guide

This guide provides end-to-end instructions for deploying the **RapidShift Labs Control Plane** onto an **Ubuntu 22.04 LTS or 24.04 LTS** virtual machine (e.g., Oracle Cloud Infrastructure Always Free Compute).

---

## 1. Architecture Overview & VM Specifications

The RapidShift Control Plane runs as a unified, domain-driven system on a single Linux host:

```
                      Internet
                         │
                         ▼
             [ Nginx / TLS (Certbot) ]
              :80, :443 (Reverse Proxy)
                         │
         ┌───────────────┴───────────────┐
         │                               │
  Host: admin.*                    Host: app.*, api.*
         │                               │
         ▼                               ▼
┌────────────────────────────────────────────────────────┐
│  PM2 Process 1: @rsl/portal (Next.js 16 Web App)       │
│  Listening on 127.0.0.1:3000                           │
│  - /admin/* (Staff Console)                            │
│  - /portal/* (Client Self-Service Dashboard)           │
│  - /api/* (Public REST & SSE Gateways)                 │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  PM2 Process 2: @rsl/worker (Background Daemon)        │
│  - Transactional Outbox Event Dispatcher               │
│  - Automated Invoice Generation & Dunning Reminders    │
│  - Domain Monitoring (HTTP, SSL, DNS, RDAP Probes)     │
│  - Server Fleet Metrics Poller & SSH Health            │
│  - Support Desk 24x7 SLA Escalator Engine              │
│  - Analytics Rollups (Hourly/Daily) & Webhook Offload  │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  Persistent Storage: SQLite 3 via libSQL (WAL Mode)    │
│  Location: /var/www/rapidshiftlabs/data/               │
│  - core.db      (ACID entities, auth, outbox, audit)   │
│  - analytics.db (Raw events, aggregates, referrers)    │
│  - metrics.db   (Fleet & domain time-series samples)   │
└────────────────────────────────────────────────────────┘
```

### Hardware Specifications

| Component | Minimum Requirement | Recommended Specification |
|---|---|---|
| **OCI Shape** | `VM.Standard.E2.1.Micro` (AMD 1 OCPU, 1 GB RAM) | `VM.Standard.A1.Flex` (Ampere ARM 2–4 OCPUs, 12–24 GB RAM) |
| **OS** | Ubuntu 22.04 LTS (`jammy`) | Ubuntu 24.04 LTS (`noble`) |
| **RAM** | 2 GB (with 2 GB swap enabled) | 4 GB to 8 GB |
| **Storage** | 30 GB NVMe / Block Volume | 50 GB to 100 GB NVMe |
| **Network** | Public IPv4, egress open | Public IPv4, ports 80, 443, 22 open |

> **Note on Oracle Cloud VCN Security Rules**:
> In addition to the local Linux firewall (`ufw`), ensure your Oracle Cloud Virtual Cloud Network (VCN) Ingress Rules allow TCP traffic on ports **22** (SSH), **80** (HTTP), and **443** (HTTPS) from Source CIDR `0.0.0.0/0`.

---

## 2. Server Provisioning & OS Hardening

Connect to your clean Ubuntu VM via SSH:

```bash
ssh -i ~/.ssh/id_rsa ubuntu@<YOUR_VM_PUBLIC_IP>
```

### 2.1 Update Operating System Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw sqlite3 ca-certificates jq gnupg lsb-release
```

### 2.2 Configure Virtual Memory (Swap)

For smaller instances (e.g. 2 GB RAM), add a 2 GB swap file to guarantee smooth Next.js compilation:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.3 Configure Host Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
```

---

## 3. Runtime & Toolchain Installation

The control plane requires **Node.js 22 LTS** and **pnpm >= 10**.

### 3.1 Install Node.js 22 LTS

```bash
# Add NodeSource official Node 22 repository
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v   # Must output >= v22.12.0
npm -v
```

### 3.2 Install pnpm & PM2

```bash
# Enable corepack and install pnpm
sudo corepack enable
sudo corepack prepare pnpm@12.10.1 --activate

# Verify pnpm
pnpm -v

# Install PM2 globally for production daemon supervision
sudo npm install -g pm2
```

---

## 4. Directory Structure & System User

We run the application under a dedicated unprivileged system user (`rapidshift`) with isolated directory permissions.

### 4.1 Create System User & Directories

```bash
# Create application user
sudo useradd -m -s /bin/bash rapidshift

# Create application and backup directories
sudo mkdir -p /var/www/rapidshiftlabs
sudo mkdir -p /var/www/rapidshiftlabs/data
sudo mkdir -p /var/backups/rapidshiftlabs
sudo mkdir -p /var/log/rapidshiftlabs

# Set ownership
sudo chown -R rapidshift:rapidshift /var/www/rapidshiftlabs
sudo chown -R rapidshift:rapidshift /var/backups/rapidshiftlabs
sudo chown -R rapidshift:rapidshift /var/log/rapidshiftlabs

# Enforce secure permissions (backups and database are restricted)
sudo chmod 750 /var/www/rapidshiftlabs
sudo chmod 700 /var/www/rapidshiftlabs/data
sudo chmod 700 /var/backups/rapidshiftlabs
```

---

## 5. Application Installation & Environment Configuration

### 5.1 Clone Repository & Install Dependencies

Switch to the `rapidshift` user:

```bash
sudo -u rapidshift -i
cd /var/www/rapidshiftlabs

# Clone the repository
git clone https://github.com/rapidshiftlabs/rapidshiftlabs.git .

# Install workspace dependencies
pnpm install --frozen-lockfile
```

### 5.2 Environment Variables Dictionary

Create `/var/www/rapidshiftlabs/.env` owned by `rapidshift` (`chmod 600`).

| Variable | Required | Description | Example / Recommendation |
|---|---|---|---|
| `NODE_ENV` | **Yes** | Execution mode | `production` |
| `PORT` | **Yes** | Internal HTTP listening port for Next.js portal | `3000` |
| `DATA_DIR` | **Yes** | Path to persistent SQLite storage directory | `/var/www/rapidshiftlabs/data` |
| `AUTH_SECRET` | **Yes** | Cryptographic secret for Auth.js session tokens & HMAC salting | 32-byte hex string (`openssl rand -hex 32`) |
| `MASTER_KEY` | **Yes** | 32-byte key for AES-256-GCM encryption of SSH keys & credentials | 64-char hex string (`openssl rand -hex 32`) |
| `MASTER_KEY_PREVIOUS` | No | Previous key during master key rotation | Optional |
| `ADMIN_HOST` | **Yes** | Fully qualified hostname for the admin console | `admin.rapidshiftlabs.com` |
| `PORTAL_HOST` | **Yes** | Fully qualified hostname for the client portal | `app.rapidshiftlabs.com` |
| `API_HOST` | **Yes** | Fully qualified hostname for public REST APIs & SDK gate | `api.rapidshiftlabs.com` |
| `ADMIN_URL` | **Yes** | Public base URL for admin console | `https://admin.rapidshiftlabs.com` |
| `PORTAL_URL` | **Yes** | Public base URL for client self-service portal | `https://app.rapidshiftlabs.com` |
| `API_URL` | **Yes** | Public base URL for API & embeds | `https://api.rapidshiftlabs.com` |
| `LOG_LEVEL` | No | Logging verbosity | `info` (`debug`, `warn`, `error`) |
| `SMTP_HOST` | No | Outgoing SMTP server (if not configured in DB) | `smtp.gmail.com` |
| `SMTP_PORT` | No | SMTP port | `587` |
| `SMTP_USER` | No | SMTP username / email address | `alerts@rapidshiftlabs.com` |
| `SMTP_PASS` | No | SMTP password or app password | `<app-password>` |
| `SMTP_FROM` | No | Sender header | `RapidShift Labs <alerts@rapidshiftlabs.com>` |

### 5.3 Generate Production Secrets

Run the following command as `rapidshift` to generate your initial `.env`:

```bash
ADMIN_DOMAIN="admin.yourdomain.com"
APP_DOMAIN="app.yourdomain.com"
API_DOMAIN="api.yourdomain.com"

cat << EOF > /var/www/rapidshiftlabs/.env
NODE_ENV=production
PORT=3000
DATA_DIR=/var/www/rapidshiftlabs/data
AUTH_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)
ADMIN_HOST=${ADMIN_DOMAIN}
PORTAL_HOST=${APP_DOMAIN}
API_HOST=${API_DOMAIN}
ADMIN_URL=https://${ADMIN_DOMAIN}
PORTAL_URL=https://${APP_DOMAIN}
API_URL=https://${API_DOMAIN}
LOG_LEVEL=info
EOF

chmod 600 /var/www/rapidshiftlabs/.env
```

---

## 6. Database Setup, WAL Concurrency & Migrations

RapidShift uses three dedicated SQLite database files:
1. `core.db`: Identity, clients, contracts, billing, entitlements, tickets, outbox, audit logs.
2. `analytics.db`: Ingested visitor events, web vitals, rollups, offload queues.
3. `metrics.db`: Server & PM2 time-series telemetry, domain monitoring uptime checks.

### 6.1 Execute Database Migrations

Run database migrations to initialize tables and schemas:

```bash
pnpm db:migrate
```

### 6.2 Verify SQLite WAL Mode and PRAGMAs

Ensure that each database file is in Write-Ahead Logging (`WAL`) mode with proper timeouts:

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

> **Why WAL Mode?**
> In WAL mode, SQLite writers do not block readers, and readers do not block writers. Combined with the in-process async write mutex and `BEGIN IMMEDIATE` transactions in `@rsl/core`, this guarantees zero `SQLITE_BUSY` contention during simultaneous portal requests and worker polling.

---

## 7. Initial Admin Account Creation

Create your initial owner administrator account using the built-in CLI utility. This user will have full access to `/admin` using **email and password authentication**:

```bash
pnpm admin:create admin@rapidshiftlabs.com 'YourSuperSecretPassword123!'
```

Verify that the owner user exists in `core.db`:

```bash
sqlite3 /var/www/rapidshiftlabs/data/core.db "SELECT id, email, role, status FROM users WHERE email='admin@rapidshiftlabs.com';"
```

Output:
```
<ULID>|admin@rapidshiftlabs.com|owner|active
```

---

## 8. Build the Production Artifacts

Compile the Next.js portal application and worker:

```bash
pnpm build
```

---

## 9. PM2 Process Supervision & Systemd Integration

A production `ecosystem.config.cjs` defines both the web portal and the background worker daemon.

### 9.1 Verify `ecosystem.config.cjs`

Create or confirm `/var/www/rapidshiftlabs/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: "rapidshift-portal",
      script: "node_modules/.bin/next",
      args: "start --port 3000",
      cwd: "/var/www/rapidshiftlabs/apps/portal",
      instances: 1, // Single instance preserves in-process write mutex & SSE hub
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "1G",
      autorestart: true,
      exp_backoff_restart_delay: 100,
      error_file: "/var/log/rapidshiftlabs/portal-error.log",
      out_file: "/var/log/rapidshiftlabs/portal-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "rapidshift-worker",
      script: "node_modules/.bin/tsx",
      args: "src/index.ts",
      cwd: "/var/www/rapidshiftlabs/apps/worker",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "1G",
      autorestart: true,
      exp_backoff_restart_delay: 200,
      error_file: "/var/log/rapidshiftlabs/worker-error.log",
      out_file: "/var/log/rapidshiftlabs/worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
```

### 9.2 Start PM2 Processes

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

### 9.3 Configure Systemd Auto-Start on Boot

Generate and register the systemd service unit:

```bash
# As rapidshift user, run save:
pm2 save

# Exit back to ubuntu/sudo user
exit

# Register PM2 startup script with systemd:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u rapidshift --hp /home/rapidshift
```

### 9.4 Configure PM2 Log Rotation

Install `pm2-logrotate` so log files do not grow unbounded:

```bash
sudo -u rapidshift pm2 install pm2-logrotate
sudo -u rapidshift pm2 set pm2-logrotate:max_size 50M
sudo -u rapidshift pm2 set pm2-logrotate:retain 14
sudo -u rapidshift pm2 set pm2-logrotate:compress true
```

---

## 10. Reverse Proxy Configuration & TLS (Nginx + Certbot)

Nginx handles TLS termination, HTTP-to-HTTPS redirection, and reverse-proxies traffic to the Next.js portal on `127.0.0.1:3000`.

### 10.1 Install Nginx & Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 10.2 Create Nginx Configuration

Create `/etc/nginx/sites-available/rapidshiftlabs.conf` (replace domain names with your actual domain):

```nginx
# Map for WebSocket and Server-Sent Events upgrade headers
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Upstream Next.js Portal application
upstream rapidshift_portal {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Combined server block for admin, portal (app), and api domains
server {
    listen 80;
    listen [::]:80;
    server_name admin.yourdomain.com app.yourdomain.com api.yourdomain.com;

    # Let's Encrypt ACME challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.yourdomain.com app.yourdomain.com api.yourdomain.com;

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/admin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload size for attachments & PDFs
    client_max_body_size 25M;

    # Real-Time SSE Stream Endpoint: Disable Buffering!
    location /api/stream {
        proxy_pass http://rapidshift_portal;
        proxy_http_version 1.1;

        # CRITICAL: Disable buffering for Server-Sent Events
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Accel-Buffering "no";
        chunked_transfer_encoding on;

        # Keep-Alive timeouts for long-lived streams
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # General Route Proxy
    location / {
        proxy_pass http://rapidshift_portal;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

### 10.3 Obtain TLS Certificates via Certbot

Before enabling the SSL block, obtain the initial certificate:

```bash
# Enable HTTP challenge
sudo ln -sf /etc/nginx/sites-available/rapidshiftlabs.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Request certificate covering all 3 subdomains
sudo certbot --nginx \
  -d admin.yourdomain.com \
  -d app.yourdomain.com \
  -d api.yourdomain.com \
  --agree-tos \
  --email admin@yourdomain.com \
  --non-interactive
```

### 10.4 Alternative: Caddyfile Configuration

If you prefer using **Caddy** instead of Nginx, automatic Let's Encrypt TLS and SSE configuration is simple:

```caddyfile
(common_headers) {
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }
}

admin.yourdomain.com, app.yourdomain.com, api.yourdomain.com {
    import common_headers

    # Realtime SSE stream with buffering disabled
    @sse path /api/stream*
    handle @sse {
        reverse_proxy 127.0.0.1:3000 {
            flush_interval -1
        }
    }

    # General application reverse proxy
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

---

## 11. Automated Hot Backups (`VACUUM INTO`) & Disaster Recovery

SQLite databases in WAL mode must **not** be copied using raw `cp` while the application is active, as doing so risks tearing pages. Instead, we use SQLite's native atomic `VACUUM INTO` command.

### 11.1 Hot Backup Script

Create `/usr/local/bin/rapidshift-backup.sh`:

```bash
sudo tee /usr/local/bin/rapidshift-backup.sh << 'EOF' > /dev/null
#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/var/www/rapidshiftlabs/data"
BACKUP_DIR="/var/backups/rapidshiftlabs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEMP_SNAPSHOT_DIR="${BACKUP_DIR}/snapshot_${TIMESTAMP}"
ARCHIVE_NAME="rapidshift_backup_${TIMESTAMP}.tar.gz"

mkdir -p "${TEMP_SNAPSHOT_DIR}"
chmod 700 "${TEMP_SNAPSHOT_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting atomic SQLite VACUUM INTO backup..."

# 1. Hot snapshot each database using VACUUM INTO
for db in core.db analytics.db metrics.db; do
  if [ -f "${DATA_DIR}/${db}" ]; then
    echo "Snapshotting ${db}..."
    sqlite3 "${DATA_DIR}/${db}" "VACUUM INTO '${TEMP_SNAPSHOT_DIR}/${db}';"
  fi
done

# 2. Compress the snapshot with gzip
tar -czf "${BACKUP_DIR}/${ARCHIVE_NAME}" -C "${TEMP_SNAPSHOT_DIR}" .
rm -rf "${TEMP_SNAPSHOT_DIR}"

# 3. Generate SHA256 checksum
sha256sum "${BACKUP_DIR}/${ARCHIVE_NAME}" > "${BACKUP_DIR}/${ARCHIVE_NAME}.sha256"

# 4. Restrict permissions
chmod 600 "${BACKUP_DIR}/${ARCHIVE_NAME}"*
chown rapidshift:rapidshift "${BACKUP_DIR}/${ARCHIVE_NAME}"*

# 5. Retention policy: Keep daily backups for 14 days, delete older
find "${BACKUP_DIR}" -name "rapidshift_backup_*.tar.gz*" -type f -mtime +14 -delete

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup completed successfully: ${BACKUP_DIR}/${ARCHIVE_NAME}"
EOF

sudo chmod 750 /usr/local/bin/rapidshift-backup.sh
```

### 11.2 Configure Daily Automated Cron Job

Add the backup script to root's crontab:

```bash
sudo crontab -l 2>/dev/null | { cat; echo "0 3 * * * /usr/local/bin/rapidshift-backup.sh >> /var/log/rapidshiftlabs/backup.log 2>&1"; } | sudo crontab -
```

Test run the backup manually:

```bash
sudo /usr/local/bin/rapidshift-backup.sh
ls -lh /var/backups/rapidshiftlabs/
```

### 11.3 Step-by-Step Disaster Recovery & Restore Procedure

In the event of database corruption or hardware migration, restore from your latest backup:

```bash
# 1. Stop PM2 processes to prevent active writes
sudo -u rapidshift pm2 stop all

# 2. Identify the target backup archive
BACKUP_ARCHIVE=$(ls -t /var/backups/rapidshiftlabs/rapidshift_backup_*.tar.gz | head -n 1)
echo "Restoring from: $BACKUP_ARCHIVE"

# 3. Verify SHA256 integrity
cd /var/backups/rapidshiftlabs
sha256sum -c "${BACKUP_ARCHIVE}.sha256"

# 4. Archive current data directory as a safety precaution
sudo mv /var/www/rapidshiftlabs/data /var/www/rapidshiftlabs/data_corrupted_$(date +%s)
sudo mkdir -p /var/www/rapidshiftlabs/data
sudo chown rapidshift:rapidshift /var/www/rapidshiftlabs/data
sudo chmod 700 /var/www/rapidshiftlabs/data

# 5. Extract snapshot into data directory
sudo tar -xzf "$BACKUP_ARCHIVE" -C /var/www/rapidshiftlabs/data/
sudo chown -R rapidshift:rapidshift /var/www/rapidshiftlabs/data

# 6. Verify integrity of restored databases
for db in core.db analytics.db metrics.db; do
  INTEGRITY=$(sqlite3 /var/www/rapidshiftlabs/data/$db "PRAGMA integrity_check;")
  echo "$db Integrity: $INTEGRITY"
  if [ "$INTEGRITY" != "ok" ]; then
    echo "ERROR: Database $db failed integrity check!"
    exit 1
  fi
done

# 7. Restart PM2 processes
sudo -u rapidshift pm2 start all
sudo -u rapidshift pm2 status
```

---

## 12. Zero-Downtime Updates & Rollback Runbook

### 12.1 Deploying Code Updates

To deploy a new release with minimal interruption:

```bash
sudo -u rapidshift -i
cd /var/www/rapidshiftlabs

# 1. Fetch latest changes
git fetch --tags origin
git checkout main
git pull origin main

# 2. Install updated dependencies
pnpm install --frozen-lockfile

# 3. Apply any database migrations
pnpm db:migrate

# 4. Build fresh production bundle
pnpm build

# 5. Reload processes via PM2 with zero downtime
pm2 reload ecosystem.config.cjs

# 6. Verify health
curl -f http://127.0.0.1:3000/api/v1/health
```

### 12.2 Rollback Runbook

If a deployment encounters issues, roll back immediately:

```bash
sudo -u rapidshift -i
cd /var/www/rapidshiftlabs

# 1. Checkout the previous known good tag or commit hash
git checkout <PREVIOUS_COMMIT_OR_TAG>

# 2. Re-install dependencies & build
pnpm install --frozen-lockfile
pnpm build

# 3. Reload PM2
pm2 reload ecosystem.config.cjs

# 4. (If database schema changes need rollback, restore database per Section 11.3)
```

---

## 13. System Verification & Troubleshooting

### 13.1 Health Check Verification

Test all public ingress routes and internal endpoints:

```bash
# 1. Local container health endpoint
curl -s http://127.0.0.1:3000/api/v1/health | jq .

# Expected Response:
# {
#   "status": "ok",
#   "service": "rapidshift-control-plane",
#   "uptime": 123.45,
#   "timestamp": 1773177600000,
#   "database": "healthy"
# }

# 2. OpenAPI 3.1 specification
curl -s https://api.yourdomain.com/openapi.json | jq .openapi
# Expected: "3.1.0"

# 3. Test Realtime SSE Stream connection
curl -N -H "Accept: text/event-stream" "https://api.yourdomain.com/api/stream?topics=billing"
```

### 13.2 Troubleshooting Checklist

| Symptom | Probable Cause | Remediation |
|---|---|---|
| `502 Bad Gateway` from Nginx | Next.js portal is not running or crashed on startup | Check `pm2 status` and inspect logs: `pm2 logs rapidshift-portal --lines 50`. Ensure `PORT=3000` is free. |
| `SQLITE_BUSY: database is locked` | Missing WAL mode or long transaction blocking writers | Run `sqlite3 data/core.db "PRAGMA journal_mode;"` to verify `wal`. Ensure no manual locks or third-party tools keep SQLite open. |
| SSE disconnects after 60 seconds | Nginx proxy buffering or proxy timeouts terminating SSE | Verify `proxy_buffering off;` and `proxy_read_timeout 86400s;` are configured in `/api/stream` location block. |
| Admin login fails with 401 | Incorrect password or unmigrated user table | Re-run `pnpm admin:create admin@rapidshiftlabs.com '<password>'` and check `sqlite3 data/core.db "SELECT * FROM users;"`. |
| `EACCES: permission denied` writing to `data/` | Data folder owned by root rather than `rapidshift` user | Run `sudo chown -R rapidshift:rapidshift /var/www/rapidshiftlabs/data`. |
| Oracle VM reboot loses PM2 processes | PM2 startup systemd unit was not saved | Run `pm2 save` followed by `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u rapidshift --hp /home/rapidshift`. |
