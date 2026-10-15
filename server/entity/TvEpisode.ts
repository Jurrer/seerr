import { MediaStatus } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(
  'UQ_tv_episode_canonical_identity',
  ['tmdbId', 'seasonNumber', 'episodeNumber'],
  {
    unique: true,
  }
)
class TvEpisode {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int' })
  public tmdbId: number;

  @Column({ type: 'int' })
  public seasonNumber: number;

  @Column({ type: 'int' })
  public episodeNumber: number;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  public status4k: MediaStatus;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<TvEpisode>) {
    Object.assign(this, init);
  }
}

export default TvEpisode;
