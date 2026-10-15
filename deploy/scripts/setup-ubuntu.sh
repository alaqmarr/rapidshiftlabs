#!/usr/bin/env bash
# ==============================================================================
# RapidShift Labs — Oracle Cloud Ubuntu Host Bootstrap Automation
# ==============================================================================
# Target OS: Ubuntu 22.04 LTS (Jammy) / Ubuntu 24.04 LTS (Noble)
# Target Cloud: Oracle Cloud Infrastructure (OCI) / Generic Ubuntu VM
#
# Components Installed & Configured:
#   1. OS updates & development essentials (curl, git, build-essential, jq)
#   2. 2 GB virtual memory swapfile (ensures Next.js builds succeed on small shapes)
#   3. Node.js 22 LTS via NodeSource official distribution
#   4. pnpm package manager & PM2 process manager
#   5. SQLite 3 CLI for WAL-mode backups & diagnostics
#   6. Nginx HTTP/HTTPS reverse proxy & Certbot (Let's Encrypt)
#   7. UFW firewall rules + Oracle Cloud OCI iptables fix (ports 22, 80, 443)
#   8. Dedicated unprivileged system user ('rapidshift') and directory tree
#   9. Linux logrotate configuration for PM2 & application logs
#  10. Automated daily backup cron job (at 02:00 AM)
#  11. PM2 systemd startup configuration for automatic boot persistence
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 0. Pre-Flight Checks & Privileges
# ------------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    echo "======================================================================" >&2
    echo "ERROR: This setup script must be executed with root / sudo privileges." >&2
    echo "Usage: sudo bash deploy/scripts/setup-ubuntu.sh" >&2
    echo "======================================================================" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() {
    echo ""
    echo "======================================================================"
    echo ">>> [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
    echo "======================================================================"
}

log "Starting RapidShift Labs Ubuntu Host Bootstrap..."

# ------------------------------------------------------------------------------
# 1. Update OS Packages & Install Prerequisites
# ------------------------------------------------------------------------------
log "Step 1: Updating operating system packages..."
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

log "Installing base utilities and dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    sqlite3 \
    ca-certificates \
    jq \
    gnupg \
    lsb-release \
    logrotate \
    cron \
    ufw \
    net-tools

# ------------------------------------------------------------------------------
# 2. Configure 2 GB Swap File (Prevents OOM on 1GB - 2GB RAM Cloud Shapes)
# ------------------------------------------------------------------------------
log "Step 2: Checking and configuring virtual memory swapfile..."
TOTAL_SWAP_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')

if [ "${TOTAL_SWAP_KB}" -lt 1000000 ]; then
    if [ ! -f /swapfile ]; then
        log "Allocating 2 GB swapfile at /swapfile..."
        fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        log "2 GB swapfile activated successfully."
    else
        log "/swapfile already exists. Ensuring it is active..."
        swapon /swapfile 2>/dev/null || true
    fi
else
    log "Swap is already configured (${TOTAL_SWAP_KB} kB)."
fi

# ------------------------------------------------------------------------------
# 3. Install Node.js 22 LTS (NodeSource)
# ------------------------------------------------------------------------------
log "Step 3: Installing Node.js 22 LTS via NodeSource..."
CURRENT_NODE_VER=$(node -v 2>/dev/null || echo "none")

if [[ ! "${CURRENT_NODE_VER}" =~ ^v22\. ]]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
else
    log "Node.js 22 is already installed (${CURRENT_NODE_VER})."
fi

log "Node version: $(node -v)"
log "NPM version:  $(npm -v)"

# ------------------------------------------------------------------------------
# 4. Install pnpm & PM2 Process Manager
# ------------------------------------------------------------------------------
log "Step 4: Installing pnpm and PM2 process supervisor..."
corepack enable || true
corepack prepare pnpm@12.10.1 --activate || npm install -g pnpm

# Install PM2 globally
npm install -g pm2

log "pnpm version: $(pnpm -v)"
log "PM2 version:  $(pm2 -v)"

# ------------------------------------------------------------------------------
# 5. Install Nginx & Certbot (Let's Encrypt)
# ------------------------------------------------------------------------------
log "Step 5: Installing Nginx reverse proxy and Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

systemctl enable nginx
systemctl start nginx || true

# ------------------------------------------------------------------------------
# 6. Create Dedicated System User & Directory Tree
# ------------------------------------------------------------------------------
log "Step 6: Setting up dedicated 'rapidshift' system user and directory structure..."

APP_USER="rapidshift"
APP_DIR="/var/www/rapidshiftlabs"
DATA_DIR="/var/www/rapidshiftlabs/data"
BACKUP_DIR="/var/backups/rapidshiftlabs"
LOG_DIR="/var/log/rapidshiftlabs"

if ! id -u "${APP_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${APP_USER}"
    log "Created system user '${APP_USER}'."
else
    log "System user '${APP_USER}' already exists."
fi

mkdir -p "${APP_DIR}"
mkdir -p "${DATA_DIR}"
mkdir -p "${BACKUP_DIR}"
mkdir -p "${LOG_DIR}"

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${BACKUP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${LOG_DIR}"

chmod 750 "${APP_DIR}"
chmod 700 "${DATA_DIR}"
chmod 700 "${BACKUP_DIR}"
chmod 755 "${LOG_DIR}"

# ------------------------------------------------------------------------------
# 7. Configure Firewall (UFW) & Oracle Cloud OCI iptables Patch
# ------------------------------------------------------------------------------
log "Step 7: Configuring UFW firewall and Oracle Cloud security rules..."

# Ensure loopback and essential ports are open
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Oracle Cloud Infrastructure (OCI) specific iptables rule patch:
# Standard Oracle Ubuntu cloud images have default iptables rules in the INPUT chain
# that REJECT all inbound packets not explicitly matched earlier in the chain.
# We insert ACCEPT rules at the top of the INPUT chain to ensure HTTP/HTTPS traffic reaches Nginx.
if command -v iptables &>/dev/null; then
    log "Checking Oracle Cloud iptables rules for port 80 and 443..."
    iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
    if command -v netfilter-persistent &>/dev/null; then
        netfilter-persistent save 2>/dev/null || true
    fi
fi

# ------------------------------------------------------------------------------
# 8. Configure PM2 & Application Log Rotation (logrotate)
# ------------------------------------------------------------------------------
log "Step 8: Setting up logrotate for RapidShift PM2 and application logs..."

cat << 'EOF' > /etc/logrotate.d/rapidshift
/var/log/rapidshiftlabs/*.log
/var/www/rapidshiftlabs/logs/*.log
/home/rapidshift/.pm2/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    create 0640 rapidshift rapidshift
}
EOF

chmod 644 /etc/logrotate.d/rapidshift

# Verify logrotate configuration syntax
logrotate -d /etc/logrotate.d/rapidshift >/dev/null 2>&1 || true
log "Logrotate configuration installed at /etc/logrotate.d/rapidshift."

# ------------------------------------------------------------------------------
# 9. Install Daily Automated Database Backup Cron Job (02:00 AM)
# ------------------------------------------------------------------------------
log "Step 9: Installing automated daily database backup cron job..."

BACKUP_SCRIPT="${APP_DIR}/deploy/scripts/backup-db.sh"
CRON_SCHEDULE="0 2 * * *"
CRON_CMD="${CRON_SCHEDULE} ${BACKUP_SCRIPT} >> ${LOG_DIR}/backup.log 2>&1"

# Install into rapidshift user's crontab idempotently
(crontab -u "${APP_USER}" -l 2>/dev/null | grep -F -v "backup-db.sh" || true; echo "${CRON_CMD}") | crontab -u "${APP_USER}" -

log "Backup cron job installed for '${APP_USER}': ${CRON_CMD}"

# ------------------------------------------------------------------------------
# 10. PM2 Systemd Service Startup Integration
# ------------------------------------------------------------------------------
log "Step 10: Enabling PM2 systemd daemon auto-start on boot..."

# Generate and configure PM2 startup script for rapidshift user
env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" || true

log "======================================================================"
log "Bootstrap completed successfully!"
log "Next steps for deploying RapidShift Labs:"
log "  1. Switch to application user: sudo -u rapidshift -i"
log "  2. Clone repository into ${APP_DIR} if not already present:"
log "     cd ${APP_DIR} && git clone <REPO_URL> ."
log "  3. Configure environment: cp .env.example .env (or populate /var/www/rapidshiftlabs/.env)"
log "  4. Install & build: pnpm install --frozen-lockfile && pnpm db:migrate && pnpm build"
log "  5. Start services: pm2 start ecosystem.config.cjs && pm2 save"
log "  6. Configure Nginx: sudo cp ${APP_DIR}/deploy/nginx/rapidshift.conf /etc/nginx/sites-available/"
log "     sudo ln -sf /etc/nginx/sites-available/rapidshift.conf /etc/nginx/sites-enabled/"
log "     sudo certbot --nginx -d admin.yourdomain.com -d app.yourdomain.com"
log "======================================================================"
