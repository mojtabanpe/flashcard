# Initial deployment — 2026-10-13

- URL: https://poshtetgarm.ir
- SSH administrative alias: `flashcard`
- Deployment user: `recall-deploy` (UID/GID 11001)
- Application: `recall-app-1`, non-root UID/GID 10001, healthy
- Listener: `127.0.0.1:4310`, behind host Nginx and HTTPS
- Database: Postgres 16 container `recall-postgres-1` on `127.0.0.1:15432`, volume `recall_postgres-data` (legacy SQLite kept read-only at `/opt/recall/data/recall.sqlite`)
- Private environment: `/opt/recall/shared/.env`
- Backups: `/opt/recall/backups`
- Initial snapshot: `2904c051e1e3eb601cb6cf6263405cc2bd950d73`
- Current release with Redis speech caching: `da0ee8a0d7f37bf1fda92ddfed1fb628cabb83f9`

The first release was built on the server from the tested local working tree, rather than a pushed Git commit. Source provenance is recorded in `/opt/recall/current/source-manifest.json`. Local validation passed 17 backend and 8 frontend tests. The transferred SQLite snapshot contained 2 users, 3 decks and 589 cards. File checksums matched; database integrity, foreign keys and authenticated owner-scoped reads were verified on the deployed application.

GitHub environment `production` is configured with deployment secrets and a `master` branch policy. The dedicated private SSH key remains in the local SSH directory and GitHub Secrets, outside the repository. The CI workflow and application changes still need to be committed and pushed before GitHub can perform subsequent automated releases.

Daily consistent SQLite backups use `recall-backup.timer`, between 02:00 and 02:15 UTC (05:30–05:45 Asia/Tehran). A manual run of the unit succeeded and its backup passed an integrity check with all 3 decks and 589 cards. Certbot automatic renewal is enabled and simulated renewal succeeded; the dedicated renewal hook validates and reloads Nginx.

Pronunciation is configured using `http://194.48.198.106:20128/v1/audio/speech`, the existing private API key and the `edge-tts/en-AU-WilliamMultilingualNeural` model. The application container was recreated with the updated environment. An authenticated request through the public HTTPS pronunciation endpoint returned MP3 audio successfully. The upstream service also returned intermittent HTTP 502 errors during verification, followed by successful MP3 responses; provider reliability still needs monitoring. The key stays in private environment files and is not exposed to the frontend. Existing unrelated services are outside this deployment.

The server and the Mac now have separate SQLite files. They do not synchronize automatically. Use the server for production reviews and card changes; never overwrite its database with an older Mac copy.

Redis speech caching was deployed on 2026-10-13 after all 24 backend tests passed, including integration with real Redis. Both app and Redis containers are healthy. The live HTTPS endpoint returned `MISS` followed by `HIT` with byte-identical MP3 audio; the Redis TTL was 86,400 seconds. The observed first request took 1,813 ms and the cached request 63 ms. Redis listens only on `127.0.0.1:16379`, persists through AOF in its named volume, and reports successful AOF writes. A consistent SQLite backup was taken before this release. See [tts-cache.md](tts-cache.md) for configuration and operational details.

## Operational checks

```sh
ssh flashcard 'docker inspect --format "{{.State.Health.Status}}" recall-app-1'
curl -f https://poshtetgarm.ir/api/health
ssh flashcard 'systemctl list-timers recall-backup.timer certbot.timer --no-pager'
ssh flashcard 'systemctl start recall-backup.service'
```

# Postgres cutover and PWA — 2026-10-14

Release `423bd73d9e3414984f5cde6e24391ea1933447e6` moved production from SQLite to Postgres 16 (`recall-postgres-1`, `127.0.0.1:15432`, volume `recall_postgres-data`; the password is `POSTGRES_PASSWORD` in `/opt/recall/shared/.env`). A SQLite backup was taken first (`/opt/recall/backups/pre-423bd73…-20261014T153726Z.sqlite`), the app was stopped, and the import copied and verified 2 users, 5 sessions, 3 decks, 589 cards, 877 archive rows and the manifest. `memnpe@gmail.com` was then created as a copy of `admin@recall.com` (2 decks, 580 cards, same password hash). The app and Postgres are healthy; the live site serves the service worker and manifest, and `index.html` is not in `ngsw.json`. `recall-backup.service` now writes daily `pg_dump` files (`daily-*.dump`); the previous unit is kept at `/opt/recall/backups/recall-backup.service.sqlite-bak`. The legacy SQLite file remains in `/opt/recall/data` for rollback only and is no longer written.

## ChatGPT MCP — 2026-10-20

Deployed working-tree snapshot `bb17220263ae20f9c1f5e44a4675a746767698a8`
with the new prebuilt Dockerfile. Source provenance is recorded in
`/opt/recall/current/source-manifest.json`; this identifier is a content hash,
not a pushed Git commit. The previous release remains available for rollback.
The app is healthy and the pre-deployment Postgres dump is
`/opt/recall/backups/pre-bb17220263ae20f9c1f5e44a4675a746767698a8-20261020T095613Z.dump`.
Counts before and after deployment matched: 3 users, 1,171 cards, 0 passages.

Sign in and select **ChatGPT** in the header (or `/api/mcp/setup`) to create a
personal token. The MCP URL is `https://poshtetgarm.ir/api/mcp`; choose OAuth
with dynamic client registration, then enter the token on Recall's authorization
page. See `server/MCP.md` for tools, permissions and revocation.

Validation passed 31 backend tests (one optional Redis test skipped), 10 frontend
tests, production frontend/API builds, and a final rerun of all 7 MCP integration
tests including the consent-page referrer/CSP regression checks. Browser checks
covered token creation/revocation and responsive layout at 320–1280px. The release
image passed isolated startup, discovery and authentication smoke checks before
deployment. A real ChatGPT account connection still needs the user's OAuth flow.

During the initial full on-host build, the server stopped responding temporarily.
The host has about 2 GB RAM and no swap. Use CI-built images or the prebuilt
Dockerfile to avoid running Angular/TypeScript compilation on this production
host again.
