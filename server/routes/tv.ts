import { getMetadataProvider } from '@server/api/metadata';
import RottenTomatoes from '@server/api/rating/rottentomatoes';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbKeyword,
  TmdbTvDetails,
  TmdbTvEpisodeGroupDetails,
  TmdbTvEpisodeGroupResult,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import TvOrdering from '@server/entity/TvOrdering';
import { Watchlist } from '@server/entity/Watchlist';
import { Permission } from '@server/lib/permissions';
import { seedOrderingEpisodes } from '@server/lib/tvEpisode';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { mapTvResult } from '@server/models/Search';
import {
  mapSeasonWithEpisodes,
  mapTvDetails,
  mapTvOrdering,
  mapTvOrderingGroups,
} from '@server/models/Tv';
import { Router, type Request } from 'express';

const tvRoutes = Router();

const DEFAULT_ORDERING_ID = 'default';
const BROKEN_ORDERING_ERROR =
  'The applied TMDB ordering is no longer available.';

async function getAppliedOrdering(tvId: number) {
  return getRepository(TvOrdering).findOne({ where: { tmdbId: tvId } });
}

async function applyOrdering(tvId: number, orderingId: string) {
  const repository = getRepository(TvOrdering);
  const existing = await repository.findOne({ where: { tmdbId: tvId } });

  if (existing) {
    existing.orderingId = orderingId;
    return repository.save(existing);
  }

  return repository.save(new TvOrdering({ tmdbId: tvId, orderingId }));
}

async function clearOrdering(tvId: number) {
  const repository = getRepository(TvOrdering);
  const existing = await repository.findOne({ where: { tmdbId: tvId } });

  if (existing) {
    await repository.remove(existing);
  }
}

function invalidOrdering() {
  return {
    status: 422,
    message:
      'Invalid orderingId. The ordering does not exist for this TV series.',
  };
}

function hasValidOrderingDetails(
  ordering: TmdbTvEpisodeGroupDetails,
  tvId: number,
  orderingId: string
) {
  return (
    ordering.id === orderingId &&
    ordering.groups.length > 0 &&
    ordering.groups.every(
      (group) =>
        group.episodes.length > 0 &&
        group.episodes.every(
          (episode) =>
            episode.show_id === tvId &&
            Number.isSafeInteger(episode.id) &&
            episode.id > 0 &&
            Number.isSafeInteger(episode.season_number) &&
            episode.season_number >= 0 &&
            Number.isSafeInteger(episode.episode_number) &&
            episode.episode_number > 0
        )
    )
  );
}

function getLanguage(req: Request) {
  return (req.query.language as string) ?? req.locale ?? 'en';
}

function resolveEpisodeGroups(
  episodeGroups: TmdbTvDetails['episode_groups']
): TmdbTvEpisodeGroupResult[] | undefined {
  return Array.isArray(episodeGroups) ? episodeGroups : episodeGroups?.results;
}

tvRoutes.get('/:id', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const tmdbTv = await tmdb.getTvShow({
      tvId: Number(req.params.id),
    });
    const metadataProvider = tmdbTv.keywords.results.some(
      (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
    )
      ? await getMetadataProvider('anime')
      : await getMetadataProvider('tv');
    const tv = await metadataProvider.getTvShow({
      tvId: Number(req.params.id),
      language: (req.query.language as string) ?? req.locale,
    });
    const media = await Media.getMedia(tv.id, MediaType.TV);

    const onUserWatchlist = await getRepository(Watchlist).exist({
      where: {
        tmdbId: Number(req.params.id),
        mediaType: MediaType.TV,
        requestedBy: {
          id: req.user?.id,
        },
      },
    });

    const appliedOrdering = await getAppliedOrdering(tv.id);
    let currentOrdering;
    if (appliedOrdering) {
      try {
        const groups =
          resolveEpisodeGroups(tmdbTv.episode_groups) ??
          (await tmdb.getTvEpisodeGroups({ tvId: tv.id })).results;
        const group = groups.find(
          (candidate) => candidate.id === appliedOrdering.orderingId
        );
        if (!group) {
          currentOrdering = {
            id: appliedOrdering.orderingId,
            error: BROKEN_ORDERING_ERROR,
          };
        } else {
          const ordering = await tmdb.getTvEpisodeGroup({
            orderingId: appliedOrdering.orderingId,
            language: getLanguage(req),
          });
          currentOrdering =
            ordering &&
            hasValidOrderingDetails(ordering, tv.id, appliedOrdering.orderingId)
              ? mapTvOrdering(group, true)
              : {
                  id: appliedOrdering.orderingId,
                  error: BROKEN_ORDERING_ERROR,
                };
        }
      } catch {
        currentOrdering = {
          id: appliedOrdering.orderingId,
          error: BROKEN_ORDERING_ERROR,
        };
      }
    }

    const data = mapTvDetails(
      tv,
      media?.filter(req.user),
      onUserWatchlist,
      currentOrdering
    );

    // TMDB issue where it doesnt fallback to English when no overview is available in requested locale.
    if (!data.overview) {
      const tvEnglish = await metadataProvider.getTvShow({
        tvId: Number(req.params.id),
      });
      data.overview = tvEnglish.overview;
    }

    return res.status(200).json(data);
  } catch (e) {
    logger.debug('Something went wrong retrieving series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series.',
    });
  }
});

tvRoutes.get('/:id/orderings', async (req, res, next) => {
  const tvId = Number(req.params.id);
  try {
    const tmdb = new TheMovieDb();
    const show = await tmdb.getTvShow({
      tvId,
      language: getLanguage(req),
    });
    const groups =
      resolveEpisodeGroups(show.episode_groups) ??
      (await tmdb.getTvEpisodeGroups({ tvId, language: getLanguage(req) }))
        .results;
    const appliedOrdering = await getAppliedOrdering(tvId);

    return res.status(200).json([
      {
        id: DEFAULT_ORDERING_ID,
        name: 'Seasons',
        episodeCount: show.number_of_episodes,
        groupCount: Math.max(show.number_of_seasons, 1),
        isApplied: !appliedOrdering,
      },
      ...groups.map((group) =>
        mapTvOrdering(group, group.id === appliedOrdering?.orderingId)
      ),
    ]);
  } catch (e) {
    logger.debug('Something went wrong retrieving TV orderings', {
      label: 'API',
      errorMessage: e.message,
      tvId,
    });
    return next({ status: 500, message: 'Unable to retrieve TV orderings.' });
  }
});

tvRoutes.get('/:id/ordering', async (req, res, next) => {
  const tvId = Number(req.params.id);
  try {
    const appliedOrdering = await getAppliedOrdering(tvId);
    if (!appliedOrdering) {
      return res.status(204).send();
    }

    const tmdb = new TheMovieDb();
    const ordering = await tmdb.getTvEpisodeGroup({
      orderingId: appliedOrdering.orderingId,
      language: getLanguage(req),
    });
    const episodes = await seedOrderingEpisodes(tvId, ordering);

    return res.status(200).json(mapTvOrderingGroups(ordering, episodes));
  } catch (e) {
    logger.debug('Something went wrong retrieving the applied TV ordering', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 422,
      message: BROKEN_ORDERING_ERROR,
    });
  }
});

tvRoutes.put(
  '/:id/ordering',
  isAuthenticated(Permission.MANAGE_SETTINGS),
  async (req, res, next) => {
    const tvId = Number(req.params.id);
    try {
      const orderingId = ((req.body?.orderingId ?? '') as string).trim();

      if (!orderingId) {
        return next(invalidOrdering());
      }

      if (orderingId === DEFAULT_ORDERING_ID) {
        await clearOrdering(tvId);
        return res.status(204).send();
      }

      const tmdb = new TheMovieDb();
      const show = await tmdb.getTvShow({ tvId });
      const groups =
        resolveEpisodeGroups(show.episode_groups) ??
        (await tmdb.getTvEpisodeGroups({ tvId })).results;
      const group = groups.find((candidate) => candidate.id === orderingId);

      if (!group || group.episode_count <= 0 || group.group_count <= 0) {
        return next(invalidOrdering());
      }

      const ordering = await tmdb.getTvEpisodeGroup({
        orderingId,
      });
      if (!ordering || !hasValidOrderingDetails(ordering, tvId, orderingId)) {
        return next(invalidOrdering());
      }

      await applyOrdering(tvId, orderingId);
      return res.status(204).send();
    } catch (e) {
      logger.debug('Something went wrong applying a TV ordering', {
        label: 'API',
        errorMessage: e.message,
        tvId,
      });
      return next({ status: 500, message: 'Unable to apply TV ordering.' });
    }
  }
);

tvRoutes.get('/:id/season/:seasonNumber', async (req, res, next) => {
  try {
    const tmdb = new TheMovieDb();
    const tmdbTv = await tmdb.getTvShow({
      tvId: Number(req.params.id),
    });
    const metadataProvider = tmdbTv.keywords.results.some(
      (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
    )
      ? await getMetadataProvider('anime')
      : await getMetadataProvider('tv');

    const season = await metadataProvider.getTvSeason({
      tvId: Number(req.params.id),
      seasonNumber: Number(req.params.seasonNumber),
      language: (req.query.language as string) ?? req.locale,
    });

    return res.status(200).json(mapSeasonWithEpisodes(season));
  } catch (e) {
    logger.debug('Something went wrong retrieving season', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
      seasonNumber: req.params.seasonNumber,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve season.',
    });
  }
});

tvRoutes.get('/:id/recommendations', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.getTvRecommendations({
      tvId: Number(req.params.id),
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      })),
      { includeActiveRequest: true }
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: results.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving series recommendations', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series recommendations.',
    });
  }
});

tvRoutes.get('/:id/similar', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.getTvSimilar({
      tvId: Number(req.params.id),
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      })),
      { includeActiveRequest: true }
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: results.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving similar series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve similar series.',
    });
  }
});

tvRoutes.get('/:id/ratings', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const rtapi = new RottenTomatoes();

  try {
    const tv = await tmdb.getTvShow({
      tvId: Number(req.params.id),
    });

    const rtratings = await rtapi.getTVRatings(
      tv.name,
      tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined
    );

    if (!rtratings) {
      return next({
        status: 404,
        message: 'Rotten Tomatoes ratings not found.',
      });
    }

    return res.status(200).json(rtratings);
  } catch (e) {
    logger.debug('Something went wrong retrieving series ratings', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series ratings.',
    });
  }
});

export default tvRoutes;
