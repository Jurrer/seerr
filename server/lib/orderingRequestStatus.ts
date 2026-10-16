import { MediaRequestStatus } from '@server/constants/media';
import type OrderingGroupEpisodeRequest from '@server/entity/OrderingGroupEpisodeRequest';

export type OrderingEpisodeStatus = Pick<OrderingGroupEpisodeRequest, 'status'>;

interface OrderingGroupEpisodes {
  episodes: readonly OrderingEpisodeStatus[];
}

export const deriveOrderingStatusFromEpisodes = (
  episodes: readonly OrderingEpisodeStatus[]
): MediaRequestStatus | undefined => {
  if (episodes.length === 0) {
    return undefined;
  }

  if (
    episodes.every((episode) => episode.status === MediaRequestStatus.COMPLETED)
  ) {
    return MediaRequestStatus.COMPLETED;
  }
  if (
    episodes.every((episode) => episode.status === MediaRequestStatus.APPROVED)
  ) {
    return MediaRequestStatus.APPROVED;
  }
  if (
    episodes.every((episode) => episode.status === MediaRequestStatus.DECLINED)
  ) {
    return MediaRequestStatus.DECLINED;
  }
  if (
    episodes.some((episode) => episode.status === MediaRequestStatus.FAILED)
  ) {
    return MediaRequestStatus.FAILED;
  }

  return MediaRequestStatus.PENDING;
};

export const isOrderingRequestComplete = (
  groups: readonly OrderingGroupEpisodes[]
): boolean =>
  groups.length > 0 &&
  groups.every((group) =>
    group.episodes.every(
      (episode) => episode.status === MediaRequestStatus.COMPLETED
    )
  );
