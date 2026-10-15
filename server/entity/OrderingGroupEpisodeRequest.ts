import { MediaRequestStatus } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import OrderingGroupRequest from './OrderingGroupRequest';

@Entity()
@Index('UQ_ordering_group_episode_canonical_identity', [
  'group',
  'seasonNumber',
  'episodeNumber',
])
class OrderingGroupEpisodeRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  public position: number;

  @Column({ type: 'integer' })
  public seasonNumber: number;

  @Column({ type: 'integer' })
  public episodeNumber: number;

  @Column({ type: 'varchar', nullable: true })
  public name?: string;

  @Column({ type: 'integer', default: MediaRequestStatus.PENDING })
  public status: MediaRequestStatus;

  @ManyToOne(() => OrderingGroupRequest, (group) => group.episodes, {
    onDelete: 'CASCADE',
  })
  @Index()
  public group: OrderingGroupRequest;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<OrderingGroupEpisodeRequest>) {
    Object.assign(this, init);
  }
}

export default OrderingGroupEpisodeRequest;
