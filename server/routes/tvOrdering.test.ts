import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import type { TmdbTvDetails } from '@server/api/themoviedb/interfaces';
import { getRepository } from '@server/datasource';
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
        id: tvId === TV_ID ? ORDERING_ID : OTHER_ORDERING_ID,
        name: 'Absolute Order',
        description: 'Absolute episode order',
        episode_count: 24,
        group_count: 1,
        network: null,
        type: 2,
      },
    ],
  });
});

describe('GET /tv/:id/orderings', () => {
  it('lists the default ordering and TMDB orderings for a viewer', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
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

    const agent = await loginAs('demo@seerr.dev');
    const res = await agent
      .put(`/tv/${TV_ID}/ordering`)
      .send({ orderingId: ORDERING_ID });

    assert.strictEqual(res.status, 204);
    const ordering = await getRepository(TvOrdering).findOneOrFail({
      where: { tmdbId: TV_ID },
    });
    assert.strictEqual(ordering.orderingId, ORDERING_ID);
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

describe('GET /tv/:id', () => {
  it('keeps standard TV details when no ordering is applied', async () => {
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, TV_ID);
    assert.strictEqual(res.body.name, 'Alternate Ordering');
    assert.strictEqual('currentOrdering' in res.body, false);
  });

  it('includes the currently applied ordering', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
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
  });

  it('reports a broken applied ordering while still returning details', async () => {
    await seedOrdering(TV_ID, ORDERING_ID);
    getEpisodeGroups = async () => ({ results: [] });
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent.get(`/tv/${TV_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Alternate Ordering');
    assert.deepStrictEqual(res.body.currentOrdering, {
      id: ORDERING_ID,
      error: 'The applied TMDB ordering is no longer available.',
    });
  });
});
