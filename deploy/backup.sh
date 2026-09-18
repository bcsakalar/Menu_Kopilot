#!/usr/bin/env bash
# Menü Kopilot - daily database dump (the approved templates are the valuable part).
# Installed as /etc/cron.d/menu-kopilot-backup (docs/DEPLOY_MYSERVER.md):
#   30 3 * * * root /opt/menu-kopilot/deploy/backup.sh >> /var/log/menu-kopilot-backup.log 2>&1
# Restore: docker exec -i menu-kopilot-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < FILE
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/yedek}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TARGET="$DIR/menu-kopilot-$(date +%F).dump"

mkdir -p "$DIR"
# Custom format: compressed and restorable table by table. Credentials come from the container's own environment.
docker exec menu-kopilot-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TARGET.tmp"
# Write to a temporary name first so a half-written dump never looks valid.
mv "$TARGET.tmp" "$TARGET"
find "$DIR" -name 'menu-kopilot-*.dump' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $(basename "$TARGET") ($(du -h "$TARGET" | cut -f1))"
