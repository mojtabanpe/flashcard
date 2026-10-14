import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { createPool, migrate, transaction } from './schema';
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly pool = createPool();
  async onModuleInit() {
    await migrate(this.pool);
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async many<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    return (await this.pool.query<T>(sql, params)).rows;
  }
  async one<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    return (await this.pool.query<T>(sql, params)).rows[0];
  }
  async run(sql: string, params: unknown[] = []) {
    return (await this.pool.query(sql, params)).rowCount ?? 0;
  }
  transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return transaction(this.pool, work);
  }
}
