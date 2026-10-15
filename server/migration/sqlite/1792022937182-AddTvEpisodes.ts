import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTvEpisodes1792022937182 implements MigrationInterface {
  name = 'AddTvEpisodes1792022937182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tv_episode" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "seasonNumber" integer NOT NULL, "episodeNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT 1, "status4k" integer NOT NULL DEFAULT 1, "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UQ_tv_episode_canonical_identity" UNIQUE ("tmdbId", "seasonNumber", "episodeNumber"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tv_episode"`);
  }
}
