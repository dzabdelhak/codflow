/**
 * Former D1 test database. Tests now run on PostgreSQL (see ./pg.ts); this
 * name stays so existing callers keep working while they are ported.
 */
export { createTestDb as createTestD1, type TestDb as TestD1 } from "./pg";
