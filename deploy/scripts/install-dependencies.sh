#!/usr/bin/env bash
# ==============================================================================
# RapidShift Labs — Ubuntu Dependencies Installation Script
# ==============================================================================
# Use this script when your Ubuntu server ALREADY has Nginx and PM2 installed.
# It only installs and verifies the runtime dependencies required by RapidShift Labs:
#   1. System build utilities (curl, git, build-essential, python3, sqlite3, jq)
#   2. Node.js 22 LTS (v22.12+ required by Next.js 16 and engines)
#   3. pnpm package manager (v10+ / v12)
#   4. 2 GB virtual memory swap check (prevents Next.js build OOM on low-RAM shapes)
#
# NOTE: This script DOES NOT modify your existing Nginx or PM2 setup.
# ==============================================================================

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
    echo "======================================================================" >&2
    echo "ERROR: Please run this script with sudo or as root." >&2
    echo "Usage: sudo bash deploy/scripts/install-dependencies.sh" >&2
    echo "======================================================================" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo ""
echo "======================================================================"
echo ">>> [1/4] Updating package index and installing build prerequisites..."
echo "======================================================================"
apt-get update -y
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    sqlite3 \
    ca-certificates \
    jq \
    gnupg

echo ""
echo "======================================================================"
echo ">>> [2/4] Verifying / Installing Node.js 22 LTS..."
echo "======================================================================"
CURRENT_NODE_VER=$(node -v 2>/dev/null || echo "none")

if [[ ! "${CURRENT_NODE_VER}" =~ ^v22\. ]] && [[ ! "${CURRENT_NODE_VER}" =~ ^v2[3-9]\. ]]; then
    echo "Current Node.js version is '${CURRENT_NODE_VER}'. Installing Node.js 22.x LTS..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
else
    echo "Compatible Node.js already detected: ${CURRENT_NODE_VER}"
fi

echo "Active Node version: $(node -v)"
echo "Active NPM version:  $(npm -v)"

echo ""
echo "======================================================================"
echo ">>> [3/4] Verifying / Installing pnpm..."
echo "======================================================================"
if ! command -v pnpm &>/dev/null; then
    echo "Installing pnpm globally..."
    npm install -g pnpm@12.10.1 || corepack enable && corepack prepare pnpm@12.10.1 --activate
else
    echo "pnpm is already installed: $(pnpm -v)"
fi

echo ""
echo "======================================================================"
echo ">>> [4/4] Checking Virtual Memory / Swap (Build OOM Protection)..."
echo "======================================================================"
TOTAL_SWAP_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')

echo "System RAM:  $((TOTAL_MEM_KB / 1024)) MB"
echo "System Swap: $((TOTAL_SWAP_KB / 1024)) MB"

# If total memory + swap is less than 3GB, Next.js / Turbopack build may crash with OOM on budget VMs
if [ "${TOTAL_SWAP_KB}" -lt 1000000 ] && [ "${TOTAL_MEM_KB}" -lt 3000000 ]; then
    if [ ! -f /swapfile ]; then
        echo "Creating a 2 GB swapfile at /swapfile to protect builds from OOM..."
        fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        echo "2 GB swapfile activated successfully."
    else
        echo "/swapfile exists. Ensuring it is active..."
        swapon /swapfile 2>/dev/null || true
    fi
else
    echo "Memory/swap capacity is sufficient for compilation."
fi

echo ""
echo "======================================================================"
echo ">>> Existing PM2 & Nginx Check (Preserved):"
echo "======================================================================"
echo "Nginx: $(nginx -v 2>&1 || echo 'Not installed')"
echo "PM2:   $(pm2 -v 2>&1 || echo 'Not installed')"
echo "SQLite: $(sqlite3 --version | awk '{print $1}')"
echo ""
echo "All system dependencies for RapidShift Labs are installed and ready!"
echo "======================================================================"
