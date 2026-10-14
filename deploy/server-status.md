# Initial deployment — 2026-10-13

- URL: https://poshtetgarm.ir
- SSH administrative alias: `flashcard`
- Deployment user: `recall-deploy` (UID/GID 11001)
- Application: `recall-app-1`, non-root UID/GID 10001, healthy
- Listener: `127.0.0.1:4310`, behind host Nginx and HTTPS
- Database: `/opt/recall/data/recall.sqlite`
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
