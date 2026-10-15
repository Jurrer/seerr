import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import OrderingGroupEpisodeRequest from '@server/entity/OrderingGroupEpisodeRequest';
import OrderingGroupRequest from '@server/entity/OrderingGroupRequest';
import TvEpisode from '@server/entity/TvEpisode';
import { User } from '@server/entity/User';
import { Notification } from '@server/lib/notifications';
import { syncTvEpisodeAvailability } from '@server/lib/tvEpisode';
import { setupTestDb } from '@server/test/db';

setupTestDb();

afterEach(() => {
  mock.restoreAll();
});

describe('canonical episode availability', () => {
  it('resets unavailable episodes and completes the parent request with a notification', async () => {
    const sendNotificationMock = mock.method(
      MediaRequest,
      'sendNotification',
      async () => undefined
    );
    const userRepository = getRepository(User);
    const requester = await userRepository.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.TV,
        tmdbId: 77778,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: requester,
        is4k: false,
        seasons: [],
        orderingGroups: [
          new OrderingGroupRequest({
            orderingId: 'absolute-order',
            groupId: 'group-1',
            name: 'First Arc',
            episodeCount: 2,
            status: MediaRequestStatus.APPROVED,
            episodes: [
              new OrderingGroupEpisodeRequest({
                position: 1,
                seasonNumber: 1,
                episodeNumber: 1,
                status: MediaRequestStatus.APPROVED,
              }),
              new OrderingGroupEpisodeRequest({
                position: 2,
                seasonNumber: 1,
                episodeNumber: 2,
                status: MediaRequestStatus.APPROVED,
              }),
            ],
          }),
        ],
      })
    );
    sendNotificationMock.mock.resetCalls();
    await getRepository(TvEpisode).save([
      new TvEpisode({
        tmdbId: media.tmdbId,
        seasonNumber: 1,
        episodeNumber: 1,
        status: MediaStatus.AVAILABLE,
      }),
      new TvEpisode({
        tmdbId: media.tmdbId,
        seasonNumber: 1,
        episodeNumber: 2,
        status: MediaStatus.AVAILABLE,
      }),
    ]);

    await syncTvEpisodeAvailability(
      media.tmdbId,
      1,
      [{ tmdbId: media.tmdbId, seasonNumber: 1, episodeNumber: 1 }],
      false
    );
    const episodesAfterRemoval = await getRepository(TvEpisode).find({
      where: { tmdbId: media.tmdbId },
      order: { episodeNumber: 'ASC' },
    });
    assert.strictEqual(
      episodesAfterRemoval.find((episode) => episode.episodeNumber === 2)
        ?.status,
      MediaStatus.UNKNOWN
    );
    await syncTvEpisodeAvailability(
      media.tmdbId,
      1,
      [
        { tmdbId: media.tmdbId, seasonNumber: 1, episodeNumber: 1 },
        { tmdbId: media.tmdbId, seasonNumber: 1, episodeNumber: 2 },
      ],
      false
    );

    const episodes = await getRepository(TvEpisode).find({
      where: { tmdbId: media.tmdbId },
      order: { episodeNumber: 'ASC' },
    });
    assert.deepStrictEqual(
      episodes.map((episode) => ({
        status: episode.status,
        status4k: episode.status4k,
      })),
      [
        { status: MediaStatus.AVAILABLE, status4k: MediaStatus.UNKNOWN },
        { status: MediaStatus.AVAILABLE, status4k: MediaStatus.UNKNOWN },
      ]
    );

    const stored = await getRepository(MediaRequest).findOneOrFail({
      where: { id: request.id },
      relations: { orderingGroups: { episodes: true } },
    });
    assert.strictEqual(stored.status, MediaRequestStatus.COMPLETED);
    assert.ok(
      stored.orderingGroups.every(
        (group) =>
          group.episodes.every(
            (episode) => episode.status === MediaRequestStatus.COMPLETED
          ) && group.status === MediaRequestStatus.COMPLETED
      )
    );
    assert.strictEqual(sendNotificationMock.mock.callCount(), 1);
    assert.strictEqual(
      sendNotificationMock.mock.calls[0].arguments[2],
      Notification.MEDIA_AVAILABLE
    );
  });
});
