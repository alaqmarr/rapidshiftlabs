#!/usr/bin/env bash
# ==============================================================================
# RapidShift Labs — Online WAL-Safe SQLite Database Backup
# ==============================================================================
# Performs online, non-blocking backups of SQLite databases in WAL mode
# using SQLite's native '.backup' command (Online Backup API).
#
# Databases:
#   - core.db      (Users, auth, clients, contracts, billing, audit)
#   - analytics.db (Visitor events, aggregates, daily rollups)
#   - metrics.db   (Host telemetry, domain uptime probe time-series)
#
# Features:
#   - Online, non-blocking snapshot (does not lock concurrent readers/writers)
#   - Post-backup integrity verification via 'PRAGMA integrity_check'
#   - Cryptographic SHA-256 checksum generation for disaster recovery verification
#   - Automated pruning of backups older than 14 days
#   - Secure file permissions (chmod 600)
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration & Paths
# ------------------------------------------------------------------------------
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Resolve repository root or default production paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [ -d "/var/www/rapidshiftlabs/data" ]; then
    DEFAULT_DATA_DIR="/var/www/rapidshiftlabs/data"
    DEFAULT_BACKUP_DIR="/var/backups/rapidshiftlabs"
else
    DEFAULT_DATA_DIR="${REPO_DIR}/data"
    DEFAULT_BACKUP_DIR="${DEFAULT_DATA_DIR}/backups"
fi

DATA_DIR="${DATA_DIR:-${DEFAULT_DATA_DIR}}"
BACKUP_DIR="${BACKUP_DIR:-${DEFAULT_BACKUP_DIR}}"

# Ensure backup destination directory exists with strict permissions
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

log_error() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [ERROR] $*" >&2
}

# Verify sqlite3 binary is present
if ! command -v sqlite3 &>/dev/null; then
    log_error "sqlite3 CLI tool is not installed or not in PATH."
    exit 1
fi

log "Starting RapidShift Labs database backup..."
log "Source Data Directory: ${DATA_DIR}"
log "Backup Destination:    ${BACKUP_DIR}"
log "Retention Policy:      ${RETENTION_DAYS} days"

TARGET_DATABASES=("core.db" "analytics.db" "metrics.db")
BACKUP_ERRORS=0

# ------------------------------------------------------------------------------
# Backup & Verify Each Database
# ------------------------------------------------------------------------------
for DB_NAME in "${TARGET_DATABASES[@]}"; do
    SRC_DB="${DATA_DIR}/${DB_NAME}"
    BASE_NAME="${DB_NAME%.db}"
    BACKUP_FILE="${BACKUP_DIR}/${BASE_NAME}-${TIMESTAMP}.db"
    CHECKSUM_FILE="${BACKUP_FILE}.sha256"

    if [ ! -f "${SRC_DB}" ]; then
        log "Skipping ${DB_NAME}: source file does not exist yet at ${SRC_DB}."
        continue
    fi

    log "Backing up ${DB_NAME} -> $(basename "${BACKUP_FILE}")..."

    # 1. Execute online atomic non-blocking backup
    # The .backup command utilizes sqlite3_backup_step() under the hood,
    # safely capturing WAL pages without blocking concurrent application operations.
    if ! sqlite3 "${SRC_DB}" ".backup '${BACKUP_FILE}'"; then
        log_error "Failed to execute .backup for ${SRC_DB}!"
        BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
        continue
    fi

    # 2. Verify backup file exists and has non-zero size
    if [ ! -s "${BACKUP_FILE}" ]; then
        log_error "Backup file ${BACKUP_FILE} is empty or missing!"
        rm -f "${BACKUP_FILE}"
        BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
        continue
    fi

    # 3. Perform SQLite integrity verification
    log "Verifying integrity for $(basename "${BACKUP_FILE}")..."
    INTEGRITY_CHECK=$(sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;" 2>&1 || true)

    if [ "${INTEGRITY_CHECK}" != "ok" ]; then
        log_error "INTEGRITY CHECK FAILED for ${BACKUP_FILE}!"
        log_error "SQLite check output: ${INTEGRITY_CHECK}"
        # Quarantine the corrupted file for inspection
        mv "${BACKUP_FILE}" "${BACKUP_FILE}.corrupted"
        BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
        continue
    fi

    # 4. Generate SHA256 verification hash
    (cd "${BACKUP_DIR}" && sha256sum "$(basename "${BACKUP_FILE}")" > "${CHECKSUM_FILE}")

    # 5. Set restrictive read/write permissions
    chmod 600 "${BACKUP_FILE}" "${CHECKSUM_FILE}"

    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log "[OK] Verified ${DB_NAME} backup (${FILE_SIZE}): $(basename "${BACKUP_FILE}")"
done

# ------------------------------------------------------------------------------
# Retention Policy: Prune backups older than 14 days
# ------------------------------------------------------------------------------
log "Applying retention policy: Pruning files older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."

# Remove .db and .sha256 files older than RETENTION_DAYS
PRUNED_COUNT=0
while IFS= read -r -d '' OLD_FILE; do
    log "Pruning old backup: $(basename "${OLD_FILE}")"
    rm -f "${OLD_FILE}"
    PRUNED_COUNT=$((PRUNED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "*.db" -o -name "*.sha256" -o -name "*.corrupted" \) -mtime "+${RETENTION_DAYS}" -print0)

log "Pruning completed: ${PRUNED_COUNT} expired files removed."

# ------------------------------------------------------------------------------
# Final Status
# ------------------------------------------------------------------------------
if [ "${BACKUP_ERRORS}" -gt 0 ]; then
    log_error "Database backup completed with ${BACKUP_ERRORS} error(s)!"
    exit 1
fi

log "Database backup completed successfully."
exit 0
