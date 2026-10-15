import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AddOrderingGroupRequests1792023100000 as PostgresMigration } from './postgres/1792023100000-AddOrderingGroupRequests';
import { AddOrderingGroupRequests1792023100000 as SqliteMigration } from './sqlite/1792023100000-AddOrderingGroupRequests';

describe('AddOrderingGroupRequests migrations', () => {
  [PostgresMigration, SqliteMigration].forEach((Migration) => {
    it('matches entity timestamp defaults', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: async (query: string) => {
          queries.push(query);
        },
      } as Parameters<InstanceType<typeof Migration>['up']>[0];

      await new Migration().up(queryRunner);

      const createTableQueries = queries.filter((query) =>
        query.startsWith('CREATE TABLE "ordering_group_')
      );
      assert.strictEqual(createTableQueries.length, 2);
      for (const query of createTableQueries) {
        assert.match(
          query,
          /"updatedAt" (TIMESTAMP|datetime) NOT NULL DEFAULT CURRENT_TIMESTAMP/
        );
      }
    });
  });
});
