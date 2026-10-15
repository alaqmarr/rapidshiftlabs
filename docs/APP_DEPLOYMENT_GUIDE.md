# RapidShift Labs — Application Deployment Guide
### (For Servers with Existing Nginx & PM2)

This guide is specifically tailored for an Ubuntu server that **already has Nginx and PM2 running**. It covers only the application deployment, database setup, environment configuration, and connecting to your existing Nginx and PM2 instances without disrupting other services on the server.

---

## Architecture for Existing Servers

```
                    Internet
                       │
                       ▼
           [ Existing Nginx Reverse Proxy ]
                       │
            Host: yourdomain.com
                       │ (Proxy to Port 3000)
                       ▼
┌────────────────────────────────────────────────────────┐
│  Existing PM2 Supervisor                               │
│                                                        │
│  ├── rapidshift-portal (Next.js 16 App on :3000)       │
│  └── rapidshift-worker (Background Automation Daemon)  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
             [ SQLite WAL Databases ]
             data/core.db, analytics.db, metrics.db
```

---

## Phase 1: Install Ubuntu Dependencies

Run the lightweight dependency installer to ensure Node.js 22 LTS, pnpm, and SQLite3 CLI are available (it will **not** modify or overwrite your existing Nginx or PM2 installations):

```bash
# From within the repository (or run standalone):
sudo bash deploy/scripts/install-dependencies.sh
```

Or manually verify your system has:
* **Node.js**: `v22.12.0` or higher (`node -v`)
* **pnpm**: `v10` or `v12` (`pnpm -v` — install via `npm i -g pnpm` if missing)
* **SQLite3**: `sqlite3 --version` (`sudo apt install -y sqlite3 build-essential python3`)

---

## Phase 2: Application Setup & Configuration

### Step 1: Clone Repository
Choose your target directory (e.g., `/var/www/rapidshiftlabs` or `~/rapidshiftlabs`):

```bash
cd /var/www
git clone <YOUR_GIT_REPOSITORY_URL> rapidshiftlabs
cd rapidshiftlabs
```

### Step 2: Configure Environment Variables
Create your production `.env` file:

```bash
cp .env.example .env
```

Generate two secure cryptographic keys:
```bash
# 1. 32-byte key for AES-256-GCM encryption of credentials at rest:
openssl rand -hex 32

# 2. Key for signing Auth.js / NextAuth session tokens:
openssl rand -base64 32
```

Edit `.env` (`nano .env`) and set your actual values:
```env
NODE_ENV=production

# Paste your generated keys:
MASTER_KEY=your_generated_32_byte_hex_key_here
AUTH_SECRET=your_generated_base64_secret_here

AUTH_TRUST_HOST=true

# Set your public URLs (use your domain or server IP):
NEXTAUTH_URL=https://portal.yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
PORTAL_URL=https://portal.yourdomain.com
API_URL=https://api.yourdomain.com

LOG_LEVEL=info
```

> **Note on single domain deployments**: If you are using a single domain (e.g. `https://rapidshift.yourdomain.com`), set all four URL variables (`NEXTAUTH_URL`, `ADMIN_URL`, `PORTAL_URL`, `API_URL`) to the same URL: `https://rapidshift.yourdomain.com`.

### Step 3: Install Node Dependencies
```bash
pnpm install --frozen-lockfile
```
*(If you made local adjustments or lockfile differs, run `pnpm install`)*

### Step 4: Run Database Migrations
Applies all schemas (CRM, billing, contracts, fleet, monitoring, support tickets, team RBAC, outbox) to SQLite and activates WAL mode:

```bash
pnpm db:migrate
```

### Step 5: Create Your Owner / Administrator Account
Create your primary administrator account:

```bash
pnpm admin:create "owner@yourdomain.com" "YourStrongPassword123!"
```
*(If no arguments are provided, it defaults to `admin@rapidshiftlabs.com` / `Admin@RapidShift2026!`)*

### Step 6: Build the Production Artifacts
Compiles the Next.js portal, background worker daemon, and SDK:

```bash
pnpm build
```

---

## Phase 3: Launch with Existing PM2

The repository includes a ready-to-use `ecosystem.config.cjs` configured specifically for RapidShift Labs. It defines two isolated processes:
1. `rapidshift-portal`: Next.js web application running on port `3000`.
2. `rapidshift-worker`: Background daemon handling SLA auto-escalation, dunning emails, and domain monitoring.

Start both processes with PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### Verify PM2 Process Health:
```bash
# Check status alongside your existing apps
pm2 status

# View live streaming logs for RapidShift processes
pm2 logs rapidshift-portal
pm2 logs rapidshift-worker
```

---

## Phase 4: Configure Existing Nginx

Add a new Nginx virtual host for RapidShift Labs without affecting your other websites:

### Step 1: Create Nginx Site Configuration
Create `/etc/nginx/sites-available/rapidshiftlabs.conf`:

```bash
sudo nano /etc/nginx/sites-available/rapidshiftlabs.conf
```

Paste the following configuration (replace `portal.yourdomain.com` with your actual domain):

```nginx
# Map for dynamic iframe framing (permits external framing ONLY for embed widgets)
map $uri $rapidshift_frame_options {
    ~^/embed/   "";
    default     "SAMEORIGIN";
}

map $uri $rapidshift_csp {
    ~^/embed/   "";
    default     "frame-ancestors 'self';";
}

server {
    listen 80;
    server_name portal.yourdomain.com admin.yourdomain.com api.yourdomain.com;

    # Maximum file upload size (for attachments / invoice PDFs)
    client_max_body_size 25M;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options $rapidshift_frame_options always;
    add_header Content-Security-Policy $rapidshift_csp always;

    # Static assets cache (Next.js hashed files)
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Real-Time SSE & Streaming (Disables buffering for chat & status feeds)
    location ~* /(api/stream|api/v1/tickets/.+/messages) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Critical SSE settings:
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Accel-Buffering "no";
        chunked_transfer_encoding on;
        proxy_read_timeout 86400s;
    }

    # Standard Application Routes & WebSockets
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### Step 2: Enable Site and Reload Nginx
```bash
# Enable the site configuration
sudo ln -sf /etc/nginx/sites-available/rapidshiftlabs.conf /etc/nginx/sites-enabled/

# Test Nginx syntax (ensures no typos or conflicts with existing sites)
sudo nginx -t

# Reload Nginx without downtime
sudo systemctl reload nginx
```

### Step 3: Enable SSL via Certbot (Recommended)
If you use Certbot for Let's Encrypt certificates:
```bash
sudo certbot --nginx -d portal.yourdomain.com
```

---

## Phase 5: Verification & Health Check

Test that the services are online and responding:

```bash
# 1. Check local health endpoint
curl -s http://localhost:3000/api/v1/health | jq .

# Expected output:
# {
#   "status": "ok",
#   "service": "rapidshift-control-panel",
#   "database": "healthy"
# }

# 2. Check public URL
curl -I https://portal.yourdomain.com/api/v1/health
```

Now you can open:
* **Admin Console**: `https://portal.yourdomain.com/admin/login`
* **Client Portal**: `https://portal.yourdomain.com/portal/login`

---

## 🔄 Routine Application Updates (Zero-Downtime)

When pulling new code changes in the future, run these 5 commands from the app directory:

```bash
cd /var/www/rapidshiftlabs

# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
pnpm install --frozen-lockfile

# 3. Apply any database migrations
pnpm db:migrate

# 4. Rebuild production bundles
pnpm build

# 5. Reload PM2 processes gracefully (zero-downtime)
pm2 reload ecosystem.config.cjs
```
