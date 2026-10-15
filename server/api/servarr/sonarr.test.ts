import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import SonarrAPI, { type SonarrSeason } from '@server/api/servarr/sonarr';

interface SonarrEpisodeResult {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  monitored: boolean;
}

interface SeriesUpdatePayload {
  seasons: SonarrSeason[];
}

function buildSonarr(): SonarrAPI {
  return new SonarrAPI({ url: 'http://localhost:8989/api/v3', apiKey: 'test' });
}

function getAxios(sonarr: SonarrAPI): AxiosInstance {
  return (sonarr as unknown as { axios: AxiosInstance }).axios;
}

describe('SonarrAPI removeSeries', () => {
  afterEach(() => mock.restoreAll());

  it('removes the series when it exists in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.removeSeries(1234);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(del.mock.calls[0].arguments[0], '/series/9');
  });

  it('does nothing when the series is not in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({
      data: [{ id: 0, title: 'Breaking Bad' }],
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when the tvdbId is unknown to the lookup', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(() => sonarr.removeSeries(1234), /Series not found/);
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the series was already removed in Sonarr', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
  });

  it('rethrows errors other than 404', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(() => sonarr.removeSeries(1234));
  });

  it('rethrows a 404 from the lookup instead of treating it as removed', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 404 } };
    });
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(
      () => sonarr.removeSeries(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 404
    );
    assert.strictEqual(del.mock.callCount(), 0);
  });
});

describe('SonarrAPI getSeriesByTvdbId', () => {
  afterEach(() => mock.restoreAll());

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => sonarr.getSeriesByTvdbId(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });

  it('throws "Series not found" when the lookup returns no results', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => sonarr.getSeriesByTvdbId(1234), {
      message: 'Series not found',
    });
  });
});

describe('SonarrAPI addSeries', () => {
  afterEach(() => mock.restoreAll());

  it('monitors only exact episodes when episode numbers are provided', async () => {
    const sonarr = buildSonarr();
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: {
        id: 9,
        title: 'Test Series',
        titleSlug: 'test-series',
        tags: [],
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
        ],
      },
    }));
    const getEpisodes = mock.method(
      SonarrAPI.prototype,
      'getEpisodes',
      async (): Promise<SonarrEpisodeResult[]> => [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
        { id: 102, seasonNumber: 1, episodeNumber: 2, monitored: false },
        { id: 103, seasonNumber: 2, episodeNumber: 1, monitored: false },
        { id: 104, seasonNumber: 2, episodeNumber: 2, monitored: true },
      ]
    );
    const monitorEpisodes = mock.method(
      SonarrAPI.prototype,
      'monitorEpisodes',
      async () => undefined
    );

    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      titleSlug: 'test-series',
      tags: [],
      seasons: [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: false },
      ],
    }));

    await sonarr.addSeries({
      tvdbid: 1234,
      title: 'Test Series',
      profileId: 1,
      seasons: [1, 2],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      episodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 2, episodeNumber: 2 },
      ],
    });

    assert.deepStrictEqual(
      (put.mock.calls[0].arguments[1] as SeriesUpdatePayload).seasons,
      [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ]
    );
    assert.strictEqual(getEpisodes.mock.callCount(), 1);
    assert.strictEqual(monitorEpisodes.mock.callCount(), 1);
    assert.deepStrictEqual(
      monitorEpisodes.mock.calls[0].arguments[0],
      [101, 104]
    );
  });

  it('fails before monitoring when an exact episode is unavailable', async () => {
    const sonarr = buildSonarr();
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: { id: 9, title: 'Test Series', titleSlug: 'test-series' },
    }));
    const monitorEpisodes = mock.method(SonarrAPI.prototype, 'monitorEpisodes');

    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      titleSlug: 'test-series',
      seasons: [{ seasonNumber: 1, monitored: false }],
      tags: [],
    }));
    mock.method(
      SonarrAPI.prototype,
      'getEpisodes',
      async (): Promise<SonarrEpisodeResult[]> => [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
      ]
    );

    await assert.rejects(
      sonarr.addSeries({
        tvdbid: 1234,
        title: 'Test Series',
        profileId: 1,
        seasons: [1],
        seasonFolder: true,
        rootFolderPath: '/tv',
        seriesType: 'standard',
        episodes: [
          { seasonNumber: 1, episodeNumber: 1 },
          { seasonNumber: 1, episodeNumber: 2 },
        ],
      }),
      (error: unknown) => {
        const cause = (error as { cause?: Error }).cause;
        assert.ok(cause);
        assert.ok(cause.message.includes('Failed to map Sonarr episode 1x2'));
        return true;
      }
    );

    assert.strictEqual(put.mock.callCount(), 0);
    assert.strictEqual(monitorEpisodes.mock.callCount(), 0);
  });

  it('restores existing monitoring when exact episode monitoring fails', async () => {
    const sonarr = buildSonarr();
    const updatePayloads: SeriesUpdatePayload[] = [];
    const originalSeasons = [
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: true },
    ];
    const put = mock.method(
      getAxios(sonarr),
      'put',
      async (_endpoint: string, payload: SeriesUpdatePayload) => {
        updatePayloads.push({
          seasons: payload.seasons.map((season) => ({ ...season })),
        });
        return {
          data: { id: 9, title: 'Test Series', titleSlug: 'test-series' },
        };
      }
    );
    const monitorEpisodes = mock.method(
      SonarrAPI.prototype,
      'monitorEpisodes',
      async () => {
        throw new Error('monitor failed');
      }
    );

    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      titleSlug: 'test-series',
      seasons: originalSeasons.map((season) => ({ ...season })),
      tags: [],
    }));
    mock.method(
      SonarrAPI.prototype,
      'getEpisodes',
      async (): Promise<SonarrEpisodeResult[]> => [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
      ]
    );

    await assert.rejects(
      sonarr.addSeries({
        tvdbid: 1234,
        title: 'Test Series',
        profileId: 1,
        seasons: [1],
        seasonFolder: true,
        rootFolderPath: '/tv',
        seriesType: 'standard',
        episodes: [{ seasonNumber: 1, episodeNumber: 1 }],
      }),
      (error: unknown) => {
        assert.ok(
          (error as { cause?: Error }).cause?.message.includes('monitor failed')
        );
        return true;
      }
    );

    assert.strictEqual(put.mock.callCount(), 2);
    assert.deepStrictEqual(updatePayloads[0].seasons, [
      { seasonNumber: 1, monitored: false },
      { seasonNumber: 2, monitored: false },
    ]);
    assert.deepStrictEqual(updatePayloads[1].seasons, originalSeasons);
    assert.strictEqual(monitorEpisodes.mock.callCount(), 1);
  });

  it('monitors exact episodes after creating a new series', async () => {
    const sonarr = buildSonarr();
    const post = mock.method(getAxios(sonarr), 'post', async () => ({
      data: { id: 9, title: 'Test Series', titleSlug: 'test-series' },
    }));
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 0,
      title: 'Test Series',
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ],
    }));
    mock.method(
      SonarrAPI.prototype,
      'getEpisodes',
      async (): Promise<SonarrEpisodeResult[]> => [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
        { id: 104, seasonNumber: 2, episodeNumber: 2, monitored: false },
      ]
    );
    const monitorEpisodes = mock.method(
      SonarrAPI.prototype,
      'monitorEpisodes',
      async () => undefined
    );

    await sonarr.addSeries({
      tvdbid: 1234,
      title: 'Test Series',
      profileId: 1,
      seasons: [1, 2],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      episodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 2, episodeNumber: 2 },
      ],
    });

    assert.deepStrictEqual(
      (post.mock.calls[0].arguments[1] as SeriesUpdatePayload).seasons,
      [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ]
    );
    assert.deepStrictEqual(
      monitorEpisodes.mock.calls[0].arguments[0],
      [101, 104]
    );
  });

  it('keeps season-based monitoring when exact episodes are not provided', async () => {
    const sonarr = buildSonarr();
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: {
        id: 9,
        title: 'Test Series',
        titleSlug: 'test-series',
        tags: [],
        seasons: [
          { seasonNumber: 1, monitored: false },
          { seasonNumber: 2, monitored: false },
        ],
      },
    }));
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      titleSlug: 'test-series',
      tags: [],
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ],
    }));
    mock.method(
      SonarrAPI.prototype,
      'getEpisodes',
      async (): Promise<SonarrEpisodeResult[]> => [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
        { id: 102, seasonNumber: 1, episodeNumber: 2, monitored: false },
        { id: 103, seasonNumber: 2, episodeNumber: 1, monitored: false },
      ]
    );
    const monitorEpisodes = mock.method(
      SonarrAPI.prototype,
      'monitorEpisodes',
      async () => undefined
    );

    await sonarr.addSeries({
      tvdbid: 1234,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    assert.deepStrictEqual(
      (put.mock.calls[0].arguments[1] as SeriesUpdatePayload).seasons,
      [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: false },
      ]
    );
    assert.deepStrictEqual(
      monitorEpisodes.mock.calls[0].arguments[0],
      [101, 102]
    );
  });
});
