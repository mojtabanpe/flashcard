# SQLite and API data security

- Access SQLite only through NestJS DatabaseService; the browser uses ApiService.
- Every deck/card query must scope by authenticated user_id, including joins, reads, reviews and deletes.
- Derive ownership from the server session. Never accept user_id from request bodies.
- Validate request DTOs with whitelist and forbidNonWhitelisted.
- Keep parameterized SQL and enable foreign keys. Cards must reference a deck owned by the same user.
- Keep passwords hashed and session tokens hashed in the database. Never expose password hashes, archived auth rows or tokens in API responses.
- Store the database and backups outside the web root with restricted file permissions and Git exclusions.
- Use secure HttpOnly cookies in production and retain Origin/header CSRF validation.
- Compute review scheduling from the persisted card on the server in a transaction.
