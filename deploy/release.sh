#!/usr/bin/env bash
set -euo pipefail
release=${1:?Pass the Git commit SHA}
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release'; exit 1; }
base=/opt/recall
folder="$base/releases/$release"
cd "$folder"
exec 9>"$base/shared/deploy.lock"
flock -n 9 || { echo 'Another deployment is in progress'; exit 1; }
[[ -f "$base/shared/.env" ]] || { echo 'Create /opt/recall/shared/.env first'; exit 1; }
compose=(docker compose --env-file "$base/shared/.env" -f "$folder/compose.yml")
export RELEASE="$release"
"${compose[@]}" config --quiet
grep -q '^POSTGRES_PASSWORD=[0-9a-f]\{32,\}$' "$base/shared/.env" || { echo 'Set a hex POSTGRES_PASSWORD in /opt/recall/shared/.env'; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
pg() { docker exec recall-postgres-1 psql -v ON_ERROR_STOP=1 -U recall -d recall -tAc "$1"; }
old=''
if [[ -f "$base/shared/current-release" ]]; then
  old=$(cat "$base/shared/current-release")
fi
if docker inspect recall-postgres-1 >/dev/null 2>&1; then
  docker exec recall-postgres-1 pg_dump -U recall -Fc recall > "$base/backups/pre-$release-$stamp.dump"
elif docker inspect recall-app-1 >/dev/null 2>&1; then
  # Before the Postgres cutover the running image still has the SQLite backup tool.
  docker exec recall-app-1 node dist/server/src/backup.js "/app/backups/pre-$release-$stamp.sqlite"
fi
gzip -dc image.tar.gz | docker load
"${compose[@]}" up -d --wait postgres
if [[ "$(pg "SELECT to_regclass('data_imports') IS NOT NULL AND EXISTS (SELECT 1 FROM data_imports WHERE name='sqlite')" 2>/dev/null)" != t ]] \
  && [[ -f "$base/data/recall.sqlite" ]]; then
  echo 'Importing SQLite into Postgres; the app is stopped so no writes are lost.'
  docker stop recall-app-1 >/dev/null 2>&1 || true
  if ! "${compose[@]}" run --rm --no-deps app node dist/server/src/migrate-sqlite.js /app/data/recall.sqlite; then
    echo 'SQLite import failed; restarting the previous release on SQLite.'
    docker start recall-app-1 >/dev/null 2>&1 || true
    exit 1
  fi
fi
"${compose[@]}" up -d app
healthy=false
for attempt in {1..40}; do
  status=$(docker inspect --format '{{.State.Health.Status}}' recall-app-1 2>/dev/null || true)
  if [[ "$status" == healthy ]]; then healthy=true; break; fi
  sleep 3
done
if [[ "$healthy" != true ]]; then
  echo 'Health check failed; restoring the previous application image.'
  if [[ "$old" =~ ^[a-f0-9]{40}$ ]]; then
    RELEASE="$old" docker compose --env-file "$base/shared/.env" -f "$base/releases/$old/compose.yml" up -d app
  fi
  exit 1
fi
printf '%s\n' "$release" > "$base/shared/current-release.tmp"
mv "$base/shared/current-release.tmp" "$base/shared/current-release"
ln -sfn "$folder" "$base/current"
echo "Deployed $release"
