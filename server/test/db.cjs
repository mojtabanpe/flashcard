// Gives each test file its own Postgres schema, dropped afterwards.
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const url = process.env.DATABASE_TEST_URL ?? 'postgres://recall:recall-local@127.0.0.1:5433/recall';
exports.useTestDatabase = () => {
  const schema = 'test_' + randomBytes(6).toString('hex');
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SCHEMA = schema;
  // Most tests sign up and use the session at once; verification has its own test.
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  return {
    url,
    schema,
    async drop() {
      const pool = new Pool({ connectionString: url });
      try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await pool.end(); }
    },
  };
};
