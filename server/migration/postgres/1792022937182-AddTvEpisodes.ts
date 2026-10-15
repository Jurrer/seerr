import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTvEpisodes1792022937182 implements MigrationInterface {
  name = 'AddTvEpisodes1792022937182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tv_episode" ("id" SERIAL NOT NULL, "tmdbId" integer NOT NULL, "seasonNumber" integer NOT NULL, "episodeNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT 1, "status4k" integer NOT NULL DEFAULT 1, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PK_tv_episode_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_tv_episode_canonical_identity" UNIQUE ("tmdbId", "seasonNumber", "episodeNumber"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tv_episode"`);
  }
}
