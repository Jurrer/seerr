import { TV_ORDERING_TYPE_NAMES } from '@server/api/themoviedb';
import type {
  TmdbNetwork,
  TmdbSeasonWithEpisodes,
  TmdbTvDetails,
  TmdbTvEpisodeGroupDetails,
  TmdbTvEpisodeGroupEpisode,
  TmdbTvEpisodeGroupResult,
  TmdbTvEpisodeResult,
  TmdbTvRatingResult,
  TmdbTvSeasonResult,
} from '@server/api/themoviedb/interfaces';
import type Media from '@server/entity/Media';
import type { Video } from './Movie';
import type {
  Cast,
  Crew,
  ExternalIds,
  Genre,
  Keyword,
  ProductionCompany,
  TvNetwork,
  WatchProviders,
} from './common';
import {
  mapAggregateCast,
  mapCrew,
  mapExternalIds,
  mapVideos,
  mapWatchProviders,
} from './common';

interface Episode {
  id: number;
  name: string;
  airDate: string | null;
  episodeNumber: number;
  overview: string;
  productionCode: string;
  seasonNumber: number;
  showId: number;
  stillPath?: string;
  voteAverage: number;
  voteCount: number;
}

interface Season {
  airDate: string;
  id: number;
  episodeCount: number;
  name: string;
  overview: string;
  posterPath?: string;
  seasonNumber: number;
}

export interface SeasonWithEpisodes extends Omit<Season, 'episodeCount'> {
  episodes: Episode[];
  externalIds: ExternalIds;
}

interface SpokenLanguage {
  englishName: string;
  iso_639_1: string;
  name: string;
}

export interface TvOrderingSummary {
  id: string;
  name?: string;
  description?: string;
  episodeCount?: number;
  groupCount?: number;
  type?: string;
  isApplied?: boolean;
  error?: string;
}

export interface TvOrderingEpisode {
  id: number;
  name: string;
  airDate: string | null;
  position: number;
  canonicalEpisodeNumber: number;
  canonicalSeasonNumber: number;
  overview: string;
  productionCode: string;
  stillPath?: string;
  voteAverage: number;
  voteCount: number;
}

export interface TvOrderingGroup {
  id: string;
  name?: string;
  episodeCount: number;
  episodes: TvOrderingEpisode[];
}

export interface TvOrdering extends TvOrderingSummary {
  groups: TvOrderingGroup[];
}

export interface TvDetails {
  id: number;
  backdropPath?: string;
  posterPath?: string;
  contentRatings: TmdbTvRatingResult;
  createdBy: {
    id: number;
    name: string;
    gender: number;
    profilePath?: string;
  }[];
  episodeRunTime: number[];
  firstAirDate?: string;
  genres: Genre[];
  homepage: string;
  inProduction: boolean;
  relatedVideos?: Video[];
  languages: string[];
  lastAirDate: string;
  lastEpisodeToAir?: Episode;
  name: string;
  nextEpisodeToAir?: Episode;
  networks: TvNetwork[];
  numberOfEpisodes: number;
  numberOfSeasons: number;
  originCountry: string[];
  originalLanguage: string;
  originalName: string;
  overview: string;
  popularity: number;
  productionCompanies: ProductionCompany[];
  productionCountries: {
    iso_3166_1: string;
    name: string;
  }[];
  spokenLanguages: SpokenLanguage[];
  seasons: Season[];
  status: string;
  tagline?: string;
  type: string;
  voteAverage: number;
  voteCount: number;
  credits: {
    cast: Cast[];
    crew: Crew[];
  };
  externalIds: ExternalIds;
  keywords: Keyword[];
  mediaInfo?: Media;
  currentOrdering?: TvOrderingSummary;
  watchProviders?: WatchProviders[];
  onUserWatchlist?: boolean;
}

const mapEpisodeResult = (episode: TmdbTvEpisodeResult): Episode => ({
  id: episode.id,
  airDate: episode.air_date,
  episodeNumber: episode.episode_number,
  name: episode.name,
  overview: episode.overview,
  productionCode: episode.production_code,
  seasonNumber: episode.season_number,
  showId: episode.show_id,
  voteAverage: episode.vote_average,
  voteCount: episode.vote_count,
  stillPath: episode.still_path,
});

const mapTvOrderingEpisode = (
  episode: TmdbTvEpisodeGroupEpisode,
  position: number
): TvOrderingEpisode => ({
  airDate: episode.air_date,
  canonicalEpisodeNumber: episode.episode_number,
  canonicalSeasonNumber: episode.season_number,
  id: episode.id,
  name: episode.name,
  overview: episode.overview,
  position,
  productionCode: episode.production_code,
  stillPath: episode.still_path,
  voteAverage: episode.vote_average,
  voteCount: episode.vote_count,
});

const mapSeasonResult = (season: TmdbTvSeasonResult): Season => ({
  airDate: season.air_date,
  episodeCount: season.episode_count,
  id: season.id,
  name: season.name,
  overview: season.overview,
  seasonNumber: season.season_number,
  posterPath: season.poster_path,
});

export const mapSeasonWithEpisodes = (
  season: TmdbSeasonWithEpisodes
): SeasonWithEpisodes => ({
  airDate: season.air_date,
  episodes: season.episodes.map(mapEpisodeResult),
  externalIds: mapExternalIds(season.external_ids),
  id: season.id,
  name: season.name,
  overview: season.overview,
  seasonNumber: season.season_number,
  posterPath: season.poster_path,
});

export const mapNetwork = (network: TmdbNetwork): TvNetwork => ({
  id: network.id,
  name: network.name,
  originCountry: network.origin_country,
  headquarters: network.headquarters,
  homepage: network.homepage,
  logoPath: network.logo_path,
});

export const mapTvDetails = (
  show: TmdbTvDetails,
  media?: Media,
  userWatchlist?: boolean,
  currentOrdering?: TvOrderingSummary
): TvDetails => ({
  createdBy: show.created_by,
  episodeRunTime: show.episode_run_time,
  firstAirDate: show.first_air_date,
  genres: show.genres.map((genre) => ({
    id: genre.id,
    name: genre.name,
  })),
  relatedVideos: mapVideos(show.videos),
  homepage: show.homepage,
  id: show.id,
  inProduction: show.in_production,
  languages: show.languages,
  lastAirDate: show.last_air_date,
  name: show.name,
  networks: show.networks.map(mapNetwork),
  numberOfEpisodes: show.number_of_episodes,
  numberOfSeasons: show.number_of_seasons,
  originCountry: show.origin_country,
  originalLanguage: show.original_language,
  originalName: show.original_name,
  tagline: show.tagline,
  overview: show.overview,
  popularity: show.popularity,
  productionCompanies: show.production_companies.map((company) => ({
    id: company.id,
    name: company.name,
    originCountry: company.origin_country,
    logoPath: company.logo_path,
  })),
  productionCountries: show.production_countries,
  contentRatings: show.content_ratings,
  spokenLanguages: show.spoken_languages.map((language) => ({
    englishName: language.english_name,
    iso_639_1: language.iso_639_1,
    name: language.name,
  })),
  seasons: show.seasons.map(mapSeasonResult),
  status: show.status,
  type: show.type,
  voteAverage: show.vote_average,
  voteCount: show.vote_count,
  backdropPath: show.backdrop_path,
  lastEpisodeToAir: show.last_episode_to_air
    ? mapEpisodeResult(show.last_episode_to_air)
    : undefined,
  nextEpisodeToAir: show.next_episode_to_air
    ? mapEpisodeResult(show.next_episode_to_air)
    : undefined,
  posterPath: show.poster_path,
  credits: {
    cast: show.aggregate_credits.cast.map(mapAggregateCast),
    crew: show.credits.crew.map(mapCrew),
  },
  externalIds: mapExternalIds(show.external_ids),
  keywords: show.keywords.results.map((keyword) => ({
    id: keyword.id,
    name: keyword.name,
  })),
  mediaInfo: media,
  currentOrdering,
  watchProviders: mapWatchProviders(show['watch/providers']?.results ?? {}),
  onUserWatchlist: userWatchlist,
});

export const mapTvOrdering = (
  ordering: TmdbTvEpisodeGroupResult,
  isApplied = false
): TvOrderingSummary => ({
  id: ordering.id,
  name: ordering.name,
  description: ordering.description,
  episodeCount: ordering.episode_count,
  groupCount: ordering.group_count,
  type: TV_ORDERING_TYPE_NAMES[ordering.type],
  isApplied,
});

export const mapTvOrderingGroups = (
  ordering: TmdbTvEpisodeGroupDetails
): TvOrdering => ({
  ...mapTvOrdering(ordering, true),
  groups: [...ordering.groups]
    .sort((group, nextGroup) => group.order - nextGroup.order)
    .map((group) => ({
      episodeCount: group.episodes.length,
      episodes: [...group.episodes]
        .sort((episode, nextEpisode) => episode.order - nextEpisode.order)
        .map((episode, index) => mapTvOrderingEpisode(episode, index + 1)),
      id: group.id,
      name: group.name,
    })),
});
