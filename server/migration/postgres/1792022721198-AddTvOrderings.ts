import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTvOrderings1792022721198 implements MigrationInterface {
  name = 'AddTvOrderings1792022721198';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tv_ordering" ("id" SERIAL NOT NULL, "tmdbId" integer NOT NULL, "orderingId" varchar(64) NOT NULL, CONSTRAINT "PK_tv_ordering_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_tv_ordering_tmdb_id" UNIQUE ("tmdbId"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tv_ordering"`);
  }
}
