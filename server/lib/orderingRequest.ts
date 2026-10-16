import { MediaRequestStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import OrderingGroupEpisodeRequest from '@server/entity/OrderingGroupEpisodeRequest';
import type TvEpisode from '@server/entity/TvEpisode';
import { Notification } from '@server/lib/notifications';
import { isOrderingRequestComplete } from '@server/lib/orderingRequestStatus';
import { canonicalEpisodeKey, canonicalEpisodeKeys } from './canonicalEpisode';

type CanonicalEpisode = Pick<
  TvEpisode,
  'tmdbId' | 'seasonNumber' | 'episodeNumber'
>;

export const completeOrderingEpisodes = async (
  tmdbId: number,
  canonicalEpisodes: CanonicalEpisode[],
  is4k: boolean
): Promise<OrderingGroupEpisodeRequest[]> => {
  const canonicalKeys = canonicalEpisodeKeys(canonicalEpisodes);
  const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
  const relatedEpisodes = await episodeRepository.find({
    relations: { group: { request: { media: true, requestedBy: true } } },
    where: { group: { request: { media: { tmdbId }, is4k } } },
  });
  const episodesToComplete = relatedEpisodes.filter(
    (episode) =>
      canonicalKeys.has(canonicalEpisodeKey(episode)) &&
      episode.group.request.status === MediaRequestStatus.APPROVED
  );

  if (episodesToComplete.length === 0) {
    return [];
  }

  episodesToComplete.forEach((episode) => {
    episode.status = MediaRequestStatus.COMPLETED;
  });
  await episodeRepository.save(episodesToComplete);
  return episodesToComplete;
};

export const completeOrderingRequests = async (
  episodesToComplete: OrderingGroupEpisodeRequest[]
): Promise<void> => {
  if (episodesToComplete.length === 0) {
    return;
  }

  const completedRequests: MediaRequest[] = [];
  const relatedRequestIds = [
    ...new Set(episodesToComplete.map((episode) => episode.group.request.id)),
  ];
  const requestRepository = getRepository(MediaRequest);
  const relatedRequests = await requestRepository.find({
    relations: { orderingGroups: { episodes: true } },
    where: relatedRequestIds.map((id) => ({ id })),
  });
  for (const request of relatedRequests) {
    if (isOrderingRequestComplete(request.orderingGroups)) {
      request.status = MediaRequestStatus.COMPLETED;
      completedRequests.push(request);
    }
  }

  if (completedRequests.length === 0) {
    return;
  }

  await getRepository(MediaRequest).save(completedRequests);
  completedRequests.forEach((request) => {
    MediaRequest.sendNotification(
      request,
      request.media as Media,
      Notification.MEDIA_AVAILABLE
    );
  });
};
