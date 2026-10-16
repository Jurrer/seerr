import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';

type GetTvEpisodeGroup = TheMovieDb['getTvEpisodeGroup'];
type TestEpisodeGroupClient = {
  locale?: string;
  get: (endpoint: string, config?: unknown) => Promise<unknown>;
  getTvEpisodeGroup: GetTvEpisodeGroup;
};

function createEpisodeGroupClient(episodes: unknown[]): TestEpisodeGroupClient {
  const client = Object.create(
    TheMovieDb.prototype
  ) as unknown as TestEpisodeGroupClient;

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
    const episodes = [
      { still_path: null },
      { still_path: undefined },
      { still_path: '' },
    ];
    const client = createEpisodeGroupClient(episodes);

    const response = await client.getTvEpisodeGroup({
      orderingId: 'season-1',
    });

    assert.strictEqual(response.groups[0].episodes[0].still_path, null);
    assert.strictEqual(response.groups[0].episodes[1].still_path, undefined);
    assert.strictEqual(response.groups[0].episodes[2].still_path, '');
  });
});
