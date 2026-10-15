import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class TvOrdering {
  @PrimaryGeneratedColumn()
  public id: number;

  @Index({ unique: true })
  @Column({ type: 'int' })
  public tmdbId: number;

  @Column({ type: 'varchar', length: 64 })
  public orderingId: string;

  constructor(init?: Partial<TvOrdering>) {
    Object.assign(this, init);
  }
}

export default TvOrdering;
