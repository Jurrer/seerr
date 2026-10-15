import { MediaRequestStatus } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  AfterLoad,
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';
import OrderingGroupEpisodeRequest from './OrderingGroupEpisodeRequest';

@Entity()
@Index('UQ_ordering_group_request_identity', ['request', 'groupId'])
class OrderingGroupRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', length: 64 })
  @Index()
  public orderingId: string;

  @Column({ type: 'varchar', length: 64 })
  public groupId: string;

  @Column({ type: 'varchar', nullable: true })
  public name?: string;

  @Column({ type: 'integer', default: 0 })
  public episodeCount: number;

  @Column({ type: 'integer', default: MediaRequestStatus.PENDING })
  public status: MediaRequestStatus;

  @ManyToOne(() => MediaRequest, (request) => request.orderingGroups, {
    onDelete: 'CASCADE',
  })
  @Index()
  public request: MediaRequest;

  @OneToMany(() => OrderingGroupEpisodeRequest, (episode) => episode.group, {
    eager: true,
    cascade: true,
  })
  public episodes: OrderingGroupEpisodeRequest[];

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<OrderingGroupRequest>) {
    Object.assign(this, init);
  }

  @AfterLoad()
  private deriveStatusFromEpisodes(): void {
    if (!this.episodes?.length) {
      return;
    }

    if (
      this.episodes.every(
        (episode) => episode.status === MediaRequestStatus.COMPLETED
      )
    ) {
      this.status = MediaRequestStatus.COMPLETED;
    } else if (
      this.episodes.every(
        (episode) => episode.status === MediaRequestStatus.APPROVED
      )
    ) {
      this.status = MediaRequestStatus.APPROVED;
    } else if (
      this.episodes.every(
        (episode) => episode.status === MediaRequestStatus.DECLINED
      )
    ) {
      this.status = MediaRequestStatus.DECLINED;
    } else if (
      this.episodes.some(
        (episode) => episode.status === MediaRequestStatus.FAILED
      )
    ) {
      this.status = MediaRequestStatus.FAILED;
    } else {
      this.status = MediaRequestStatus.PENDING;
    }
  }
}

export default OrderingGroupRequest;
