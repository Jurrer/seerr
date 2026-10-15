import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import type {
  AddSeriesOptions,
  SonarrSeries,
} from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
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
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import type { SonarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

import { MediaRequestSubscriber } from './MediaRequestSubscriber';

const addSeriesMock = mock.method(SonarrAPI.prototype, 'addSeries');
const externalApiGetMock = mock.method(
  ExternalAPI.prototype as unknown as {
    get: (endpoint: string) => Promise<unknown>;
  },
  'get'
);
const sendNotificationMock = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
);

setupTestDb();

beforeEach(() => {
  addSeriesMock.mock.resetCalls();
  externalApiGetMock.mock.resetCalls();
  sendNotificationMock.mock.resetCalls();
});

afterEach(() => {
  const settings = getSettings();
  settings.sonarr = [];
});

function configureSonarr(is4k: boolean): void {
  const settings = getSettings();
  settings.sonarr = [
    {
      id: 1,
      name: 'Sonarr',
      hostname: 'localhost',
      port: 8989,
      apiKey: 'test-key',
      baseUrl: '',
      useSsl: false,
      activeProfileId: 1,
      activeDirectory: '/tv',
      activeLanguageProfileId: 1,
      animeTags: [],
      is4k,
      enableSeasonFolders: true,
      tags: [],
      isDefault: true,
      syncEnabled: true,
      preventSearch: true,
      externalUrl: '',
    },
  ] as unknown as SonarrSettings[];
}

async function seedOrderingRequest(is4k: boolean): Promise<MediaRequest> {
  const userRepository = getRepository(User);
  const requester = await userRepository.findOneOrFail({
    where: { email: 'admin@seerr.dev' },
  });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.TV,
      tmdbId: 77777,
      tvdbId: 1234,
      status: is4k ? MediaStatus.UNKNOWN : MediaStatus.PENDING,
      status4k: is4k ? MediaStatus.PENDING : MediaStatus.UNKNOWN,
    })
  );
  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.TV,
      status: MediaRequestStatus.PENDING,
      media,
      requestedBy: requester,
      is4k,
    })
  );
  await getRepository(OrderingGroupRequest).save(
    new OrderingGroupRequest({
      orderingId: 'absolute-order',
      groupId: 'group-1',
      name: 'First Arc',
      episodeCount: 2,
      status: MediaRequestStatus.PENDING,
      request,
      episodes: [
        new OrderingGroupEpisodeRequest({
          position: 0,
          seasonNumber: 1,
          episodeNumber: 1,
          name: 'First canonical episode',
          status: MediaRequestStatus.PENDING,
        }),
        new OrderingGroupEpisodeRequest({
          position: 1,
          seasonNumber: 2,
          episodeNumber: 2,
          name: 'Second canonical episode',
          status: MediaRequestStatus.PENDING,
        }),
      ],
    })
  );

  return getRepository(MediaRequest).findOneOrFail({
    where: { id: request.id },
    relations: { orderingGroups: { episodes: true }, media: true },
  }) as Promise<MediaRequest>;
}

describe('MediaRequestSubscriber.sendToSonarr ordering groups', () => {
  it('maps stored canonical episode numbers to exact Sonarr episodes', async () => {
    configureSonarr(true);
    externalApiGetMock.mock.mockImplementation(async () => ({
      id: 77777,
      name: 'Test Series',
      external_ids: { tvdb_id: 1234 },
      keywords: { results: [] },
    }));
    addSeriesMock.mock.mockImplementation(
      async () =>
        ({
          id: 9,
          titleSlug: 'test-series',
        }) as SonarrSeries
    );
    const request = await seedOrderingRequest(true);

    request.status = MediaRequestStatus.APPROVED;
    assert.strictEqual(getSettings().sonarr[0].is4k, true);
    assert.strictEqual(request.media.status4k, MediaStatus.PENDING);

    await new MediaRequestSubscriber().sendToSonarr(
      request,
      getRepository(MediaRequest).manager
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(externalApiGetMock.mock.callCount(), 1);
    assert.strictEqual(
      externalApiGetMock.mock.calls[0].arguments[0],
      '/tv/77777'
    );
    assert.strictEqual(addSeriesMock.mock.callCount(), 1);
    const options = addSeriesMock.mock.calls[0]
      .arguments[0] as AddSeriesOptions;
    assert.deepStrictEqual(options.seasons, [1, 2]);
    assert.deepStrictEqual(options.episodes, [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 2, episodeNumber: 2 },
    ]);

    const stored = await getRepository(MediaRequest).findOneOrFail({
      where: { id: request.id },
      relations: { orderingGroups: { episodes: true } },
    });
    assert.strictEqual(request.status, MediaRequestStatus.APPROVED);
    assert.ok(
      stored.orderingGroups.every(
        (group) =>
          group.status === MediaRequestStatus.APPROVED &&
          group.episodes.every(
            (episode) => episode.status === MediaRequestStatus.APPROVED
          )
      )
    );
  });

  it('marks ordering request episodes failed when Sonarr mapping is incomplete', async () => {
    configureSonarr(false);
    externalApiGetMock.mock.mockImplementation(async () => ({
      id: 77777,
      name: 'Test Series',
      external_ids: { tvdb_id: 1234 },
      keywords: { results: [] },
    }));
    addSeriesMock.mock.mockImplementation(async () => {
      throw new Error('Failed to map Sonarr episode 2x2');
    });
    const request = await seedOrderingRequest(false);
    request.status = MediaRequestStatus.APPROVED;

    await new MediaRequestSubscriber().sendToSonarr(
      request,
      getRepository(MediaRequest).manager
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stored = await getRepository(MediaRequest).findOneOrFail({
      where: { id: request.id },
      relations: { orderingGroups: { episodes: true } },
    });
    assert.strictEqual(stored.status, MediaRequestStatus.FAILED);
    assert.ok(
      stored.orderingGroups[0].episodes.every(
        (episode) => episode.status === MediaRequestStatus.FAILED
      )
    );
  });

  it('keeps season requests on season-based Sonarr monitoring', async () => {
    configureSonarr(false);
    externalApiGetMock.mock.mockImplementation(async () => ({
      id: 77777,
      name: 'Test Series',
      external_ids: { tvdb_id: 1234 },
      keywords: { results: [] },
    }));
    addSeriesMock.mock.mockImplementation(
      async () =>
        ({
          id: 9,
          titleSlug: 'test-series',
        }) as SonarrSeries
    );
    const request = await seedOrderingRequest(false);
    request.status = MediaRequestStatus.APPROVED;
    request.orderingGroups = [];
    request.seasons = [
      new SeasonRequest({
        seasonNumber: 1,
        status: MediaRequestStatus.PENDING,
      }),
    ];

    await new MediaRequestSubscriber().sendToSonarr(
      request,
      getRepository(MediaRequest).manager
    );

    const options = addSeriesMock.mock.calls.at(-1)
      ?.arguments[0] as AddSeriesOptions;
    assert.deepStrictEqual(options.seasons, [1]);
    assert.strictEqual(options.episodes, undefined);
  });
});
