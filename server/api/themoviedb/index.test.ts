import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';

type GetTvEpisodeGroup = TheMovieDb['getTvEpisodeGroup'];
type GetTvSeason = TheMovieDb['getTvSeason'];
type TestClient = {
  locale?: string;
  get: (endpoint: string, config?: unknown) => Promise<unknown>;
  getTvEpisodeGroup: GetTvEpisodeGroup;
  getTvSeason: GetTvSeason;
};

function createEpisodeGroupClient(episodes: unknown[]): TestClient {
  const client = Object.create(TheMovieDb.prototype) as unknown as TestClient;

  client.locale = 'en';
  client.get = async () => ({
    id: 'season-1',
    name: 'Season 1',
    episode_count: episodes.length,
    group_count: 1,
    type: 1,
    groups: [
      {
        id: 'season-1',
        name: 'Season 1',
        order: 0,
        episodes,
      },
    ],
  });

  return client;
}

function createTvSeasonClient(episodes: unknown[]): TestClient {
  const client = new TheMovieDb() as unknown as TestClient;

  client.locale = 'en';
  client.get = async () => ({
    id: 1,
    season_number: 1,
    name: 'Season 1',
    overview: '',
    episodes,
  });

  return client;
}

describe('TheMovieDb getTvEpisodeGroup', () => {
  it('normalizes episode still paths to absolute TMDB URLs', async () => {
    const client = createEpisodeGroupClient([{ still_path: '/example.jpg' }]);

    const response = await client.getTvEpisodeGroup({
      orderingId: 'season-1',
    });

    assert.strictEqual(
      response.groups[0].episodes[0].still_path,
      'https://image.tmdb.org/t/p/original/example.jpg'
    );
  });

  it('leaves null, undefined, and empty episode still paths unchanged', async () => {
    const episodes = [{ still_path: null }, {}, { still_path: '' }];
    const client = createEpisodeGroupClient(episodes);

    const response = await client.getTvEpisodeGroup({
      orderingId: 'season-1',
    });

    assert.strictEqual(response.groups[0].episodes[0].still_path, null);
    assert.ok(!Object.hasOwn(response.groups[0].episodes[1], 'still_path'));
    assert.strictEqual(response.groups[0].episodes[2].still_path, '');
  });
});

describe('TheMovieDb getTvSeason', () => {
  it('preserves absolute episode still URLs and absent still paths', async () => {
    const absoluteStillPath = 'https://image.tmdb.org/t/p/original/example.jpg';
    const episodes = [{ still_path: absoluteStillPath }, {}];
    const client = createTvSeasonClient(episodes);

    const response = await client.getTvSeason({
      tvId: 123,
      seasonNumber: 1,
    });

    assert.strictEqual(response.episodes[0].still_path, absoluteStillPath);
    assert.ok(!Object.hasOwn(response.episodes[1], 'still_path'));
  });
});
