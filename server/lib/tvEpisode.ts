import type { TmdbTvEpisodeGroupDetails } from '@server/api/themoviedb/interfaces';
import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import TvEpisode from '@server/entity/TvEpisode';

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
  const existingKeys = new Set(
    existingEpisodes.map(
      (episode) => `${episode.seasonNumber}-${episode.episodeNumber}`
    )
  );
  const missingEpisodes = canonicalEpisodes.filter(
    (episode) =>
      !existingKeys.has(`${episode.seasonNumber}-${episode.episodeNumber}`)
  );
  const uniqueMissingEpisodes = [
    ...new Map(
      missingEpisodes.map((episode) => [
        `${episode.seasonNumber}-${episode.episodeNumber}`,
        episode,
      ])
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

export const updateTvEpisodeAvailability = async (
  tmdbId: number,
  canonicalEpisodes: CanonicalEpisode[],
  is4k: boolean
): Promise<void> => {
  const repository = getRepository(TvEpisode);
  const existingEpisodes = await repository.find({ where: { tmdbId } });
  const existingByCanonicalKey = new Map(
    existingEpisodes.map((episode) => [
      `${episode.seasonNumber}-${episode.episodeNumber}`,
      episode,
    ])
  );
  const changedEpisodes = canonicalEpisodes.map((canonicalEpisode) => {
    const key = `${canonicalEpisode.seasonNumber}-${canonicalEpisode.episodeNumber}`;
    const episode =
      existingByCanonicalKey.get(key) ??
      new TvEpisode({
        tmdbId,
        seasonNumber: canonicalEpisode.seasonNumber,
        episodeNumber: canonicalEpisode.episodeNumber,
      });

    episode[is4k ? 'status4k' : 'status'] = MediaStatus.AVAILABLE;
    return episode;
  });

  if (changedEpisodes.length > 0) {
    await repository.save(changedEpisodes);
  }
};
