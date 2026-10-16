import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import type { TmdbTvDetails } from '@server/api/themoviedb/interfaces';
import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import TvEpisode from '@server/entity/TvEpisode';
import TvOrdering from '@server/entity/TvOrdering';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import tvRoutes from './tv';

const TV_ID = 42;
const ORDERING_ID = '5f0c1a2b3c4d5e6f7a8b9c0d';
const OTHER_ORDERING_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const orderingResult = {
  id: ORDERING_ID,
  name: 'Absolute Order',
  description: 'Absolute episode order',
  episode_count: 24,
  group_count: 1,
  network: null,
  type: 2,
};

const tvShow = {
  id: TV_ID,
  name: 'Alternate Ordering',
  overview: 'overview',
  number_of_episodes: 0,
  number_of_seasons: 1,
  genres: [],
  seasons: [],
  networks: [],
  created_by: [],
  episode_run_time: [],
  languages: [],
  production_companies: [],
  production_countries: [],
  spoken_languages: [],
  origin_country: [],
  keywords: { results: [] },
  external_ids: {},
  content_ratings: { results: [] },
  credits: { crew: [] },
  aggregate_credits: { cast: [] },
  videos: { results: [] },
} as unknown as TmdbTvDetails;

Object.defineProperty(TheMovieDb.prototype, 'getTvShow', {
  get() {
    return async ({ tvId }: { tvId: number }) =>
      ({
        ...tvShow,
        id: tvId,
      }) as TmdbTvDetails;
  },
  set() {},
  configurable: true,
});

type GetEpisodeGroups = (options: {
  tvId: number;
  language?: string;
}) => Promise<{ results: unknown[] }>;

const setEpisodeGroups = (mock: GetEpisodeGroups) => {
  Object.defineProperty(TheMovieDb.prototype, 'getTvEpisodeGroups', {
    value: mock,
    configurable: true,
  });
};

let getEpisodeGroups: GetEpisodeGroups = async () => ({ results: [] });

setEpisodeGroups(async ({ tvId }) => {
  return getEpisodeGroups({ tvId });
});

type GetEpisodeGroup = (options: {
  orderingId: string;
  language?: string;
}) => Promise<unknown | null>;

let getEpisodeGroup: GetEpisodeGroup = async () => null;

Object.defineProperty(TheMovieDb.prototype, 'getTvEpisodeGroup', {
  value: (options: Parameters<GetEpisodeGroup>[0]) => getEpisodeGroup(options),
  configurable: true,
});

const episodeGroup = {
  id: ORDERING_ID,
  name: 'Absolute Order',
  description: 'Absolute episode order',
  episode_count: 3,
  group_count: 2,
  network: null,
  type: 2,
  groups: [
    {
      id: 'group-2',
      name: 'Later Arc',
      order: 2,
      episodes: [
        {
          id: 2,
          air_date: '2020-02-02',
          episode_number: 2,
          name: 'Canonical 1x2',
          overview: 'Second canonical episode',
          production_code: 'PC002',
          season_number: 1,
          show_id: TV_ID,
          still_path: '/second.jpg',
          vote_average: 8.4,
          vote_count: 2,
          order: 0,
        },
      ],
    },
    {
      id: 'group-1',
      name: 'First Arc',
      order: 1,
      episodes: [
        {
          id: 1,
          air_date: '2020-01-02',
          episode_number: 2,
          name: 'Canonical 1x2 First Position',
          overview: 'Second ordering position',
          production_code: 'PC001',
          season_number: 1,
          show_id: TV_ID,
          still_path: '/first-position.jpg',
          vote_average: 7.5,
          vote_count: 1,
          order: 2,
        },
        {
          id: 3,
          air_date: '2020-01-01',
          episode_number: 1,
          name: 'Canonical 1x1',
          overview: 'First canonical episode',
          production_code: 'PC003',
          season_number: 1,
          show_id: TV_ID,
          still_path: '/first.jpg',
          vote_average: 9.1,
          vote_count: 3,
          order: 0,
        },
      ],
    },
  ],
};

let app: Express;

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/tv', isAuthenticated(), tvRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );

  return app;
}

async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/local').send({
    email,
    password: 'test1234',
  });

  assert.strictEqual(res.status, 200);
  return agent;
}

async function seedOrdering(tmdbId: number, orderingId: string) {
  await getRepository(TvOrdering).save(new TvOrdering({ tmdbId, orderingId }));
}

before(async () => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  getEpisodeGroups = async ({ tvId }) => ({
    results: [
      {
        ...orderingResult,
        id: tvId === TV_ID ? ORDERING_ID : OTHER_ORDERING_ID,
      },
    ],
  });
  getEpisodeGroup = async () => episodeGroup;
});

describe('GET /tv/:id/orderings', () => {
  it('lists the default ordering and TMDB orderings for a viewer', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    tvShow.episode_groups = { results: [orderingResult] };
    getEpisodeGroups = async () => ({ results: [] });

    try {
      const agent = await loginAs('demo@seerr.dev');
      const res = await agent.get(`/tv/${TV_ID}/orderings`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, [
        {
          id: 'default',
          name: 'Seasons',
          episodeCount: 0,
          groupCount: 1,
          isApplied: false,
        },
        {
          id: ORDERING_ID,
          name: 'Absolute Order',
          description: 'Absolute episode order',
          episodeCount: 24,
          groupCount: 1,
          type: 'absolute',
          isApplied: true,
        },
      ]);
    } finally {
      delete tvShow.episode_groups;
    }
  });
});

describe('PUT /tv/:id/ordering', () => {
  it('lets a settings manager apply an ordering', async () => {
    const userRepository = getRepository(User);
    const user = await userRepository.findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    user.permissions = Permission.MANAGE_SETTINGS;
    await userRepository.save(user);
    tvShow.episode_groups = { results: [orderingResult] };
    getEpisodeGroups = async () => ({ results: [] });

    try {
      const agent = await loginAs('demo@seerr.dev');
      const res = await agent
        .put(`/tv/${TV_ID}/ordering`)
        .send({ orderingId: ORDERING_ID });

      assert.strictEqual(res.status, 204);
      const ordering = await getRepository(TvOrdering).findOneOrFail({
        where: { tmdbId: TV_ID },
      });
      assert.strictEqual(ordering.orderingId, ORDERING_ID);
    } finally {
      delete tvShow.episode_groups;
    }
  });

  it('clears the applied ordering with default', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: 'default' });

    assert.strictEqual(res.status, 204);
    assert.strictEqual(
      await getRepository(TvOrdering).countBy({ tmdbId: TV_ID }),
      0
    );
  });

  it('rejects a viewer without settings permission', async () => {
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: ORDERING_ID });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(
      await getRepository(TvOrdering).countBy({ tmdbId: TV_ID }),
      0
    );
  });

  it('returns 422 and leaves the ordering unchanged for an invalid ID', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: OTHER_ORDERING_ID });

    assert.strictEqual(res.status, 422);
    const ordering = await getRepository(TvOrdering).findOneOrFail({
      where: { tmdbId: TV_ID },
    });
    assert.strictEqual(ordering.orderingId, ORDERING_ID);
  });

  it('returns 422 and leaves the ordering unchanged when details are missing', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroup = async () => null;
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: ORDERING_ID });

    assert.strictEqual(res.status, 422);
    const ordering = await getRepository(TvOrdering).findOneOrFail({
      where: { tmdbId: TV_ID },
    });
    assert.strictEqual(ordering.orderingId, ORDERING_ID);
  });

  it('returns 422 when group details contain invalid canonical episode identities', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroup = async () => ({
      ...episodeGroup,
      groups: [
        {
          ...episodeGroup.groups[0],
          episodes: [
            {
              ...episodeGroup.groups[0].episodes[0],
              season_number: null,
              episode_number: null,
            },
          ],
        },
      ],
    });
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: ORDERING_ID });

    assert.strictEqual(res.status, 422);
    const ordering = await getRepository(TvOrdering).findOneOrFail({
      where: { tmdbId: TV_ID },
    });
    assert.strictEqual(ordering.orderingId, ORDERING_ID);
  });

  it('returns 422 for an empty or missing ordering ID', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const missing = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: '' });
    const omitted = await agent.put(`/tv/${TV_ID}/ordering`).send({});

    assert.strictEqual(missing.status, 422);
    assert.strictEqual(omitted.status, 422);
    assert.strictEqual(await getRepository(TvOrdering).count(), 0);
  });
});

describe('GET /tv/:id/ordering', () => {
  it('seeds canonical episodes and aggregates quality-independent availability', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    await getRepository(TvEpisode).save(
      new TvEpisode({
        tmdbId: TV_ID,
        seasonNumber: 1,
        episodeNumber: 1,
        status: MediaStatus.AVAILABLE,
      })
    );
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}/ordering`);

    assert.strictEqual(res.status, 200);
    const episodes = await getRepository(TvEpisode).find({
      where: { tmdbId: TV_ID },
      order: { seasonNumber: 'ASC', episodeNumber: 'ASC' },
    });
    assert.deepStrictEqual(
      episodes.map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      })),
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ]
    );
    assert.deepStrictEqual(res.body.groups[0], {
      id: 'group-1',
      name: 'First Arc',
      episodeCount: 2,
      status: 4,
      status4k: 1,
      availableEpisodeCount: 1,
      available4kEpisodeCount: 0,
      episodes: [
        {
          id: 3,
          name: 'Canonical 1x1',
          airDate: '2020-01-01',
          position: 1,
          canonicalEpisodeNumber: 1,
          canonicalSeasonNumber: 1,
          overview: 'First canonical episode',
          productionCode: 'PC003',
          stillPath: '/first.jpg',
          voteAverage: 9.1,
          voteCount: 3,
          status: 5,
          status4k: 1,
        },
        {
          id: 1,
          name: 'Canonical 1x2 First Position',
          airDate: '2020-01-02',
          position: 2,
          canonicalEpisodeNumber: 2,
          canonicalSeasonNumber: 1,
          overview: 'Second ordering position',
          productionCode: 'PC001',
          stillPath: '/first-position.jpg',
          voteAverage: 7.5,
          voteCount: 1,
          status: 1,
          status4k: 1,
        },
      ],
    });
    assert.deepStrictEqual(
      {
        status: res.body.groups[1].status,
        status4k: res.body.groups[1].status4k,
        availableEpisodeCount: res.body.groups[1].availableEpisodeCount,
        available4kEpisodeCount: res.body.groups[1].available4kEpisodeCount,
      },
      {
        status: 1,
        status4k: 1,
        availableEpisodeCount: 0,
        available4kEpisodeCount: 0,
      }
    );
  });

  it('returns the applied ordering groups in TMDB order', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}/ordering`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      id: ORDERING_ID,
      name: 'Absolute Order',
      description: 'Absolute episode order',
      episodeCount: 3,
      groupCount: 2,
      type: 'absolute',
      isApplied: true,
      groups: [
        {
          id: 'group-1',
          name: 'First Arc',
          episodeCount: 2,
          status: 1,
          status4k: 1,
          availableEpisodeCount: 0,
          available4kEpisodeCount: 0,
          episodes: [
            {
              id: 3,
              name: 'Canonical 1x1',
              airDate: '2020-01-01',
              position: 1,
              canonicalEpisodeNumber: 1,
              canonicalSeasonNumber: 1,
              overview: 'First canonical episode',
              productionCode: 'PC003',
              stillPath: '/first.jpg',
              voteAverage: 9.1,
              voteCount: 3,
              status: 1,
              status4k: 1,
            },
            {
              id: 1,
              name: 'Canonical 1x2 First Position',
              airDate: '2020-01-02',
              position: 2,
              canonicalEpisodeNumber: 2,
              canonicalSeasonNumber: 1,
              overview: 'Second ordering position',
              productionCode: 'PC001',
              stillPath: '/first-position.jpg',
              voteAverage: 7.5,
              voteCount: 1,
              status: 1,
              status4k: 1,
            },
          ],
        },
        {
          id: 'group-2',
          name: 'Later Arc',
          episodeCount: 1,
          status: 1,
          status4k: 1,
          availableEpisodeCount: 0,
          available4kEpisodeCount: 0,
          episodes: [
            {
              id: 2,
              name: 'Canonical 1x2',
              airDate: '2020-02-02',
              position: 1,
              canonicalEpisodeNumber: 2,
              canonicalSeasonNumber: 1,
              overview: 'Second canonical episode',
              productionCode: 'PC002',
              stillPath: '/second.jpg',
              voteAverage: 8.4,
              voteCount: 2,
              status: 1,
              status4k: 1,
            },
          ],
        },
      ],
    });
  });

  it('returns no content when no ordering is applied', async () => {
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}/ordering`);

    assert.strictEqual(res.status, 204);
  });

  it('returns an ordering error when the applied ordering is broken', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroup = async () => null;
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}/ordering`);

    assert.strictEqual(res.status, 422);
    assert.deepStrictEqual(res.body, {
      status: 422,
      message: 'The applied TMDB ordering is no longer available.',
    });
  });
});

describe('GET /tv/:id', () => {
  it('keeps standard TV details when no ordering is applied', async () => {
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, TV_ID);
    assert.strictEqual(res.body.name, 'Alternate Ordering');
    assert.strictEqual('currentOrdering' in res.body, false);
    assert.strictEqual('orderingError' in res.body, false);
  });

  it('includes the currently applied ordering', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    tvShow.episode_groups = { results: [orderingResult] };
    getEpisodeGroups = async () => ({ results: [] });

    try {
      const agent = await loginAs('demo@seerr.dev');
      const res = await agent.get(`/tv/${TV_ID}`);

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.currentOrdering, {
        id: ORDERING_ID,
        name: 'Absolute Order',
        description: 'Absolute episode order',
        episodeCount: 24,
        groupCount: 1,
        type: 'absolute',
        isApplied: true,
      });
    } finally {
      delete tvShow.episode_groups;
    }
  });

  it('reports a broken applied ordering while still returning details', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroups = async () => ({ results: [] });
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Alternate Ordering');
    assert.strictEqual(
      res.body.orderingError,
      'The applied TMDB ordering is no longer available.'
    );
    assert.deepStrictEqual(res.body.currentOrdering, {
      id: ORDERING_ID,
      error: 'The applied TMDB ordering is no longer available.',
    });
  });

  it('reports a broken applied ordering when the listed ordering has invalid details', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroup = async () => null;
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.body.orderingError,
      'The applied TMDB ordering is no longer available.'
    );
  });
});
