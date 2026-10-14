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
old=''
if [[ -f "$base/shared/current-release" ]]; then
  old=$(cat "$base/shared/current-release")
  # A SQLite online backup remains consistent even when the app is running.
  docker exec recall-app-1 node dist/server/src/backup.js "/app/backups/pre-$release-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
fi
gzip -dc image.tar.gz | docker load
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
