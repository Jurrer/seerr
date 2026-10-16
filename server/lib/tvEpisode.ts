import type { TmdbTvEpisodeGroupDetails } from '@server/api/themoviedb/interfaces';
import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import TvEpisode from '@server/entity/TvEpisode';
import {
  completeOrderingEpisodes,
  completeOrderingRequests,
} from '@server/lib/orderingRequest';
import { canonicalEpisodeKey, canonicalEpisodeKeys } from './canonicalEpisode';

type CanonicalEpisode = Pick<
  TvEpisode,
  'tmdbId' | 'seasonNumber' | 'episodeNumber'
>;

export const seedTvEpisodes = async (
  tmdbId: number,
  canonicalEpisodes: CanonicalEpisode[]
): Promise<TvEpisode[]> => {
  const repository = getRepository(TvEpisode);
  const existingEpisodes = await repository.find({ where: { tmdbId } });
  const existingKeys = canonicalEpisodeKeys(existingEpisodes);
  const missingEpisodes = canonicalEpisodes.filter(
    (episode) => !existingKeys.has(canonicalEpisodeKey(episode))
  );
  const uniqueMissingEpisodes = [
    ...new Map(
      missingEpisodes.map((episode) => [canonicalEpisodeKey(episode), episode])
    ).values(),
  ];

  if (uniqueMissingEpisodes.length === 0) {
    return existingEpisodes;
  }

  const savedEpisodes = await repository.save(
    uniqueMissingEpisodes.map(
      (episode) => new TvEpisode({ ...episode, tmdbId })
    )
  );

  return [...existingEpisodes, ...savedEpisodes];
};

export const seedOrderingEpisodes = async (
  tmdbId: number,
  ordering: TmdbTvEpisodeGroupDetails
): Promise<TvEpisode[]> => {
  const canonicalEpisodes = ordering.groups.flatMap((group) =>
    group.episodes.map((episode) => ({
      tmdbId,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
    }))
  );

  return seedTvEpisodes(tmdbId, canonicalEpisodes);
};

export const syncTvEpisodeAvailability = async (
  tmdbId: number,
  seasonNumber: number,
  canonicalEpisodes: CanonicalEpisode[],
  is4k: boolean
): Promise<void> => {
  const repository = getRepository(TvEpisode);
  const existingEpisodes = await repository.find({ where: { tmdbId } });
  const existingByCanonicalKey = new Map(
    existingEpisodes.map((episode) => [canonicalEpisodeKey(episode), episode])
  );
  const canonicalKeys = new Set(
    canonicalEpisodes.map((episode) => canonicalEpisodeKey(episode))
  );
  const changedEpisodes = existingEpisodes
    .filter((episode) => episode.seasonNumber === seasonNumber)
    .map((episode) => {
      episode[is4k ? 'status4k' : 'status'] = canonicalKeys.has(
        canonicalEpisodeKey(episode)
      )
        ? MediaStatus.AVAILABLE
        : MediaStatus.UNKNOWN;
      return episode;
    });

  for (const canonicalEpisode of canonicalEpisodes) {
    if (existingByCanonicalKey.has(canonicalEpisodeKey(canonicalEpisode))) {
      continue;
    }

    const episode = new TvEpisode({ ...canonicalEpisode, tmdbId });
    episode[is4k ? 'status4k' : 'status'] = MediaStatus.AVAILABLE;
    changedEpisodes.push(episode);
  }

  if (changedEpisodes.length > 0) {
    await repository.save(changedEpisodes);
  }

  const completedEpisodes = await completeOrderingEpisodes(
    tmdbId,
    canonicalEpisodes,
    is4k
  );
  await completeOrderingRequests(completedEpisodes);
};

export const updateTvEpisodeAvailability = async (
  tmdbId: number,
  seasonNumber: number,
  canonicalEpisodes: CanonicalEpisode[],
  is4k: boolean
): Promise<void> =>
  syncTvEpisodeAvailability(tmdbId, seasonNumber, canonicalEpisodes, is4k);
