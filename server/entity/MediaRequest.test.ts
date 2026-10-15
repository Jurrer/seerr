import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  DuplicateMediaRequestError,
  MediaRequest,
  NoSeasonsAvailableError,
  OrderingGroupRequestError,
  QuotaRestrictedError,
} from '@server/entity/MediaRequest';
import OrderingGroupEpisodeRequest from '@server/entity/OrderingGroupEpisodeRequest';
import OrderingGroupRequest from '@server/entity/OrderingGroupRequest';
import SeasonRequest from '@server/entity/SeasonRequest';
import TvEpisode from '@server/entity/TvEpisode';
import TvOrdering from '@server/entity/TvOrdering';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';

// get is a prototype method unlike getMovie, and replaces the cache lookup too
let episodeGroupUnavailable = false;

const defaultExternalGet = async (endpoint: string) => {
  if (endpoint === '/tv/episode_group/absolute-order') {
    if (episodeGroupUnavailable) {
      throw new Error('not found');
    }

    return orderingGroup;
  }

  const tmdbId = Number(endpoint.replace(/^\/(movie|tv)\//, ''));

  if (!tmdbId) {
    throw new Error(`Unstubbed external endpoint: ${endpoint}`);
  }

  return {
    id: tmdbId,
    external_ids: {},
    seasons: [1, 2, 3].map((season_number) => ({ season_number })),
    // Skips getMovie's localized fallback call
    videos: { results: [{ type: 'Trailer', key: 'trailer' }] },
  };
};

const externalApiGetMock = mock.method(
  ExternalAPI.prototype as unknown as {
    get: (endpoint: string) => Promise<unknown>;
  },
  'get',
  defaultExternalGet
).mock;

mock.method(MediaRequest, 'sendNotification', async () => undefined);

const orderingGroup = {
  id: 'absolute-order',
  name: 'Absolute Order',
  description: 'Absolute episode order',
  episode_count: 3,
  group_count: 2,
  network: null,
  type: 2,
  groups: [
    {
      id: 'group-1',
      name: 'First Arc',
      order: 1,
      episodes: [
        {
          episode_number: 1,
          season_number: 1,
          order: 0,
          name: 'First canonical episode',
        },
        {
          episode_number: 2,
          season_number: 2,
          order: 1,
          name: 'Second canonical episode',
        },
      ],
    },
    {
      id: 'group-2',
      name: 'Later Arc',
      order: 2,
      episodes: [
        {
          episode_number: 3,
          season_number: 3,
          order: 0,
          name: 'Third canonical episode',
        },
      ],
    },
  ],
};

setupTestDb();

beforeEach(() => {
  externalApiGetMock.resetCalls();
});

async function seedRequester(movieQuotaLimit: number): Promise<User> {
  const userRepository = getRepository(User);

  const requester = await userRepository.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  requester.movieQuotaLimit = movieQuotaLimit;

  return userRepository.save(requester);
}

async function seedOrderingRequester(tvQuotaLimit: number): Promise<User> {
  const requester = await seedRequester(5);
  requester.tvQuotaLimit = tvQuotaLimit;
  requester.permissions = Permission.REQUEST | Permission.REQUEST_4K;

  return getRepository(User).save(requester);
}

async function createRequester(
  email: string,
  permissions = Permission.REQUEST
): Promise<User> {
  return getRepository(User).save(new User({ email, permissions, avatar: '' }));
}

function requestMovies(mediaIds: number[], requester: User) {
  return Promise.allSettled(
    mediaIds.map((mediaId) =>
      MediaRequest.request(
        { mediaId, mediaType: MediaType.MOVIE, is4k: false },
        requester
      )
    )
  );
}

function rejections(results: PromiseSettledResult<MediaRequest>[]) {
  return results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
}

describe('MediaRequest.request', () => {
  it('rejects the second of two concurrent requests at the movie quota', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(1);

    const results = await requestMovies([11111, 22222], requester);
    const rejected = rejections(results);

    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof QuotaRestrictedError);
    assert.strictEqual(await requestRepository.count(), 1);
    assert.strictEqual(externalApiGetMock.callCount(), 1);
  });

  it('rejects a concurrent duplicate request for the same movie', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(5);

    const results = await requestMovies([33333, 33333], requester);
    const rejected = rejections(results);

    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof DuplicateMediaRequestError);
    assert.strictEqual(await requestRepository.count(), 1);
    assert.strictEqual(externalApiGetMock.callCount(), 2);
  });

  it('rejects a duplicate request that omits is4k', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(5);
    const body = { mediaId: 66666, mediaType: MediaType.MOVIE };

    await MediaRequest.request(body, requester);

    await assert.rejects(
      () => MediaRequest.request(body, requester),
      DuplicateMediaRequestError
    );
    assert.strictEqual(await requestRepository.count(), 1);
  });

  it('rejects a concurrent duplicate request from a different user', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(5);
    const otherRequester = await createRequester('second@seerr.dev');

    const results = await Promise.allSettled(
      [requester, otherRequester].map((user) =>
        MediaRequest.request(
          { mediaId: 44444, mediaType: MediaType.MOVIE, is4k: false },
          user
        )
      )
    );
    const rejected = rejections(results);

    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof DuplicateMediaRequestError);
    assert.strictEqual(await requestRepository.count(), 1);
  });

  it('gives an overlapping season to only one of two concurrent users', async () => {
    const seasonRequestRepository = getRepository(SeasonRequest);
    const requester = await seedRequester(5);
    const otherRequester = await createRequester('second@seerr.dev');

    const results = await Promise.allSettled(
      [
        [requester, [1, 2]],
        [otherRequester, [2, 3]],
      ].map(([user, seasons]) =>
        MediaRequest.request(
          {
            mediaId: 55555,
            mediaType: MediaType.TV,
            seasons: seasons as number[],
            is4k: false,
          },
          user as User
        )
      )
    );

    assert.strictEqual(rejections(results).length, 0);
    assert.strictEqual(
      await seasonRequestRepository.count({ where: { seasonNumber: 2 } }),
      1
    );
    assert.strictEqual(await seasonRequestRepository.count(), 3);
  });

  it('creates one media row for concurrent 4k and non-4k requests', async () => {
    const mediaRepository = getRepository(Media);
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(5);
    const otherRequester = await createRequester(
      'second@seerr.dev',
      Permission.REQUEST_4K
    );

    const results = await Promise.allSettled(
      [
        [requester, false],
        [otherRequester, true],
      ].map(([user, is4k]) =>
        MediaRequest.request(
          { mediaId: 88888, mediaType: MediaType.MOVIE, is4k: is4k as boolean },
          user as User
        )
      )
    );

    assert.strictEqual(rejections(results).length, 0);
    assert.strictEqual(await requestRepository.count(), 2);
    assert.strictEqual(
      await mediaRepository.count({
        where: { tmdbId: 88888, mediaType: MediaType.MOVIE },
      }),
      1
    );
  });

  it('creates one parent request containing ordering group request rows', async () => {
    const groupRepository = getRepository(OrderingGroupRequest);
    const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
    const tvEpisodeRepository = getRepository(TvEpisode);
    const seasonRequestRepository = getRepository(SeasonRequest);
    const requester = await seedOrderingRequester(2);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77777, orderingId: 'absolute-order' })
    );

    const request = await MediaRequest.request(
      {
        mediaId: 77777,
        mediaType: MediaType.TV,
        is4k: true,
        orderingGroups: ['group-1', 'group-2'],
        serverId: 10,
        profileId: 20,
        rootFolder: '/tv',
        languageProfileId: 30,
        tags: [1],
      },
      requester
    );

    assert.strictEqual(request.requestedBy.id, requester.id);
    assert.strictEqual(request.is4k, true);
    assert.strictEqual(request.serverId, 10);
    assert.strictEqual(request.profileId, 20);
    assert.strictEqual(request.rootFolder, '/tv');
    assert.strictEqual(request.languageProfileId, 30);
    assert.deepStrictEqual(request.tags, [1]);
    assert.deepStrictEqual(
      request.orderingGroups.map((group) => group.groupId),
      ['group-1', 'group-2']
    );
    assert.strictEqual(request.seasons.length, 0);
    assert.strictEqual(await groupRepository.count(), 2);
    assert.strictEqual(await episodeRepository.count(), 3);
    assert.strictEqual(await seasonRequestRepository.count(), 0);
    assert.strictEqual(
      await tvEpisodeRepository.count({ where: { tmdbId: 77777 } }),
      3
    );

    const firstGroup = request.orderingGroups[0];
    assert.strictEqual(firstGroup.orderingId, 'absolute-order');
    assert.strictEqual(firstGroup.name, 'First Arc');
    assert.strictEqual(firstGroup.episodeCount, 2);
    assert.strictEqual(firstGroup.status, MediaRequestStatus.PENDING);
    assert.deepStrictEqual(
      firstGroup.episodes.map((episode) => ({
        position: episode.position,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
      })),
      [
        {
          position: 1,
          seasonNumber: 1,
          episodeNumber: 1,
          name: 'First canonical episode',
        },
        {
          position: 2,
          seasonNumber: 2,
          episodeNumber: 2,
          name: 'Second canonical episode',
        },
      ]
    );
  });

  it('rejects broken orderings without creating a fallback request', async () => {
    const requestRepository = getRepository(MediaRequest);
    const seasonRequestRepository = getRepository(SeasonRequest);
    const groupRepository = getRepository(OrderingGroupRequest);
    const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77784, orderingId: 'absolute-order' })
    );
    episodeGroupUnavailable = true;

    try {
      await assert.rejects(
        () =>
          MediaRequest.request(
            {
              mediaId: 77784,
              mediaType: MediaType.TV,
              orderingGroups: ['group-1'],
            },
            requester
          ),
        OrderingGroupRequestError
      );
    } finally {
      episodeGroupUnavailable = false;
    }

    assert.strictEqual(await requestRepository.count(), 0);
    assert.strictEqual(await seasonRequestRepository.count(), 0);
    assert.strictEqual(await groupRepository.count(), 0);
    assert.strictEqual(await episodeRepository.count(), 0);
  });

  it('keeps ordering request dedupe independent by quality', async () => {
    const requestRepository = getRepository(MediaRequest);
    const groupRepository = getRepository(OrderingGroupRequest);
    const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77785, orderingId: 'absolute-order' })
    );

    const fourKRequest = await MediaRequest.request(
      {
        mediaId: 77785,
        mediaType: MediaType.TV,
        is4k: true,
        orderingGroups: ['group-1', 'group-2'],
      },
      requester
    );
    const standardRequest = await MediaRequest.request(
      {
        mediaId: 77785,
        mediaType: MediaType.TV,
        is4k: false,
        orderingGroups: ['group-1', 'group-2'],
      },
      requester
    );

    assert.strictEqual(fourKRequest.is4k, true);
    assert.strictEqual(standardRequest.is4k, false);
    assert.strictEqual(await requestRepository.count(), 2);
    assert.strictEqual(await groupRepository.count(), 4);
    assert.strictEqual(await episodeRepository.count(), 6);
  });

  it('reduces ordering groups against canonical availability and active standard seasons', async () => {
    const groupRepository = getRepository(OrderingGroupRequest);
    const episodeRepository = getRepository(OrderingGroupEpisodeRequest);
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77778, orderingId: 'absolute-order' })
    );
    await getRepository(TvEpisode).save(
      new TvEpisode({
        tmdbId: 77778,
        seasonNumber: 1,
        episodeNumber: 1,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await MediaRequest.request(
      {
        mediaId: 77778,
        mediaType: MediaType.TV,
        is4k: true,
        seasons: [2],
      },
      requester
    );

    const request = await MediaRequest.request(
      {
        mediaId: 77778,
        mediaType: MediaType.TV,
        is4k: true,
        orderingGroups: ['group-1', 'group-2'],
      },
      requester
    );

    assert.strictEqual(request.orderingGroups.length, 1);
    assert.strictEqual(request.orderingGroups[0].groupId, 'group-2');
    assert.strictEqual(request.orderingGroups[0].episodeCount, 1);
    assert.strictEqual(await groupRepository.count(), 1);
    assert.strictEqual(await episodeRepository.count(), 1);
  });

  it('charges one season-equivalent quota unit per ordering group', async () => {
    const requestRepository = getRepository(MediaRequest);
    const groupRepository = getRepository(OrderingGroupRequest);
    const requester = await seedOrderingRequester(1);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77779, orderingId: 'absolute-order' })
    );

    await assert.rejects(
      () =>
        MediaRequest.request(
          {
            mediaId: 77779,
            mediaType: MediaType.TV,
            orderingGroups: ['group-1', 'group-2'],
          },
          requester
        ),
      QuotaRestrictedError
    );
    assert.strictEqual(await requestRepository.count(), 0);
    assert.strictEqual(await groupRepository.count(), 0);
  });

  it('rejects ordering groups submitted with standard seasons', async () => {
    const requester = await seedOrderingRequester(5);

    await assert.rejects(
      () =>
        MediaRequest.request(
          {
            mediaId: 77780,
            mediaType: MediaType.TV,
            seasons: [1],
            orderingGroups: ['group-1'],
          },
          requester
        ),
      Error
    );
  });

  it('keeps ordering group request no-content behavior', async () => {
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77781, orderingId: 'absolute-order' })
    );
    await getRepository(TvEpisode).save([
      new TvEpisode({
        tmdbId: 77781,
        seasonNumber: 1,
        episodeNumber: 1,
        status: MediaStatus.AVAILABLE,
      }),
      new TvEpisode({
        tmdbId: 77781,
        seasonNumber: 2,
        episodeNumber: 2,
        status: MediaStatus.AVAILABLE,
      }),
      new TvEpisode({
        tmdbId: 77781,
        seasonNumber: 3,
        episodeNumber: 3,
        status: MediaStatus.AVAILABLE,
      }),
    ]);

    await assert.rejects(
      () =>
        MediaRequest.request(
          {
            mediaId: 77781,
            mediaType: MediaType.TV,
            orderingGroups: ['group-1', 'group-2'],
          },
          requester
        ),
      NoSeasonsAvailableError
    );
  });

  it('preserves stored ordering group snapshots after upstream changes', async () => {
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77782, orderingId: 'absolute-order' })
    );

    const request = await MediaRequest.request(
      {
        mediaId: 77782,
        mediaType: MediaType.TV,
        orderingGroups: ['group-1'],
      },
      requester
    );

    orderingGroup.groups[0].name = 'Rewritten upstream';
    orderingGroup.groups[0].episodes[0].name = 'Rewritten episode';
    orderingGroup.groups[0].episodes[0].season_number = 9;
    orderingGroup.groups[0].episodes[0].episode_number = 9;

    const stored = await getRepository(OrderingGroupRequest).findOneOrFail({
      where: { id: request.orderingGroups[0].id },
      relations: ['episodes'],
    });

    assert.strictEqual(stored.name, 'First Arc');
    assert.strictEqual(stored.episodes[0].name, 'First canonical episode');
    assert.strictEqual(stored.episodes[0].seasonNumber, 1);
    assert.strictEqual(stored.episodes[0].episodeNumber, 1);
  });

  it('derives ordering group request status from canonical episode rows', async () => {
    const requester = await seedOrderingRequester(5);

    await getRepository(TvOrdering).save(
      new TvOrdering({ tmdbId: 77783, orderingId: 'absolute-order' })
    );

    const request = await MediaRequest.request(
      {
        mediaId: 77783,
        mediaType: MediaType.TV,
        orderingGroups: ['group-2'],
      },
      requester
    );

    const episode = await getRepository(
      OrderingGroupEpisodeRequest
    ).findOneOrFail({
      where: { id: request.orderingGroups[0].episodes[0].id },
    });
    episode.status = MediaRequestStatus.COMPLETED;
    await getRepository(OrderingGroupEpisodeRequest).save(episode);

    const stored = await getRepository(OrderingGroupRequest).findOneOrFail({
      where: { id: request.orderingGroups[0].id },
      relations: ['episodes'],
    });

    assert.strictEqual(stored.status, MediaRequestStatus.COMPLETED);
  });
});
