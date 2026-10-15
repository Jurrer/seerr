import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { TvOrdering } from '@server/models/Tv';

interface OrderingRequestEpisode {
  seasonNumber: number;
  episodeNumber: number;
}

interface OrderingRequestSeason {
  seasonNumber: number;
}

interface OrderingRequestGroup {
  groupId: string;
  episodes: OrderingRequestEpisode[];
}

interface OrderingRequest {
  is4k: boolean;
  status: number;
  seasons: OrderingRequestSeason[];
  orderingGroups: OrderingRequestGroup[];
}

export interface OrderingGroupRequestState {
  id: string;
  name: string;
  episodeCount: number;
  availableCount: number;
  requestedCount: number;
  requestableCount: number;
  status: 'available' | 'partial' | 'requested' | 'not-requested';
}

const canonicalKey = (seasonNumber: number, episodeNumber: number) =>
  `${seasonNumber}-${episodeNumber}`;

export const orderingGroupRequestStates = (
  ordering: TvOrdering,
  requests: OrderingRequest[],
  is4k: boolean
): OrderingGroupRequestState[] =>
  ordering.groups.map((group) => {
    const activeRequests = requests.filter(
      (request) =>
        request.is4k === is4k &&
        request.status !== MediaRequestStatus.DECLINED &&
        request.status !== MediaRequestStatus.COMPLETED
    );

    const availableEpisodes = group.episodes.filter(
      (episode) =>
        episode[is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE
    );
    const requestedEpisodes = group.episodes.filter((episode) =>
      activeRequests.some(
        (request) =>
          request.seasons.some(
            (season) => season.seasonNumber === episode.canonicalSeasonNumber
          ) ||
          request.orderingGroups.some((orderingGroup) =>
            orderingGroup.episodes.some(
              (requestEpisode) =>
                canonicalKey(
                  requestEpisode.seasonNumber,
                  requestEpisode.episodeNumber
                ) ===
                canonicalKey(
                  episode.canonicalSeasonNumber,
                  episode.canonicalEpisodeNumber
                )
            )
          )
      )
    );
    const requestableEpisodes = group.episodes.filter(
      (episode) =>
        !availableEpisodes.includes(episode) &&
        !requestedEpisodes.includes(episode)
    );
    const status: OrderingGroupRequestState['status'] =
      group.episodes.length > 0 &&
      availableEpisodes.length === group.episodes.length
        ? 'available'
        : requestableEpisodes.length === 0
          ? requestedEpisodes.length > 0
            ? 'requested'
            : 'not-requested'
          : availableEpisodes.length > 0 || requestedEpisodes.length > 0
            ? 'partial'
            : 'not-requested';

    return {
      id: group.id,
      name: group.name ?? group.id,
      episodeCount: group.episodes.length,
      availableCount: availableEpisodes.length,
      requestedCount: requestedEpisodes.length,
      requestableCount: requestableEpisodes.length,
      status,
    };
  });

export const getSelectableOrderingGroups = (
  ordering: TvOrdering,
  requests: OrderingRequest[],
  is4k: boolean
): string[] =>
  orderingGroupRequestStates(ordering, requests, is4k)
    .filter((group) => group.requestableCount > 0)
    .map((group) => group.id);
