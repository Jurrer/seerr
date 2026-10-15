import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderingGroupRequests1792023100000 implements MigrationInterface {
  name = 'AddOrderingGroupRequests1792023100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ordering_group_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "orderingId" varchar(64) NOT NULL, "groupId" varchar(64) NOT NULL, "name" varchar, "episodeCount" integer NOT NULL DEFAULT 0, "status" integer NOT NULL DEFAULT 1, "requestId" integer, "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" datetime NOT NULL, CONSTRAINT "UQ_ordering_group_request_identity" UNIQUE ("requestId", "groupId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ordering_group_request_orderingId" ON "ordering_group_request" ("orderingId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ordering_group_request_requestId" ON "ordering_group_request" ("requestId")`
    );
    await queryRunner.query(
      `CREATE TABLE "ordering_group_episode_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "position" integer NOT NULL, "seasonNumber" integer NOT NULL, "episodeNumber" integer NOT NULL, "name" varchar, "status" integer NOT NULL DEFAULT 1, "groupId" integer, "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" datetime NOT NULL, CONSTRAINT "UQ_ordering_group_episode_canonical_identity" UNIQUE ("groupId", "seasonNumber", "episodeNumber"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ordering_group_episode_request_groupId" ON "ordering_group_episode_request" ("groupId")`
    );
    await queryRunner.query(
      `ALTER TABLE "ordering_group_request" ADD CONSTRAINT "FK_ordering_group_request_request" FOREIGN KEY ("requestId") REFERENCES "media_request" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "ordering_group_episode_request" ADD CONSTRAINT "FK_ordering_group_episode_request_group" FOREIGN KEY ("groupId") REFERENCES "ordering_group_request" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ordering_group_episode_request" DROP CONSTRAINT "FK_ordering_group_episode_request_group"`
    );
    await queryRunner.query(
      `ALTER TABLE "ordering_group_request" DROP CONSTRAINT "FK_ordering_group_request_request"`
    );
    await queryRunner.query(
      `DROP INDEX "IDX_ordering_group_episode_request_groupId"`
    );
    await queryRunner.query(`DROP TABLE "ordering_group_episode_request"`);
    await queryRunner.query(
      `DROP INDEX "IDX_ordering_group_request_requestId"`
    );
    await queryRunner.query(
      `DROP INDEX "IDX_ordering_group_request_orderingId"`
    );
    await queryRunner.query(`DROP TABLE "ordering_group_request"`);
  }
}
