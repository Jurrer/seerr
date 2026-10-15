import { MediaRequestStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import OrderingGroupEpisodeRequest from '@server/entity/OrderingGroupEpisodeRequest';
import type TvEpisode from '@server/entity/TvEpisode';
import { Notification } from '@server/lib/notifications';

type CanonicalEpisode = Pick<
  TvEpisode,
  'tmdbId' | 'seasonNumber' | 'episodeNumber'
>;

export const completeOrderingRequests = async (
  tmdbId: number,
  canonicalEpisodes: CanonicalEpisode[],
  is4k: boolean
): Promise<void> => {
  const canonicalKeys = new Set(
    canonicalEpisodes.map(
      (episode) => `${episode.seasonNumber}-${episode.episodeNumber}`
    )
  );
  const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
  const relatedEpisodes = await episodeRepository.find({
    relations: { group: { request: { media: true, requestedBy: true } } },
    where: { group: { request: { media: { tmdbId }, is4k } } },
  });
  const episodesToComplete = relatedEpisodes.filter(
    (episode) =>
      canonicalKeys.has(`${episode.seasonNumber}-${episode.episodeNumber}`) &&
      episode.group.request.status === MediaRequestStatus.APPROVED
  );

  if (episodesToComplete.length === 0) {
    return;
  }

  episodesToComplete.forEach((episode) => {
    episode.status = MediaRequestStatus.COMPLETED;
  });
  await episodeRepository.save(episodesToComplete);

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
    if (
      request.orderingGroups.every((group) =>
        group.episodes.every(
          (episode) => episode.status === MediaRequestStatus.COMPLETED
        )
      )
    ) {
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
