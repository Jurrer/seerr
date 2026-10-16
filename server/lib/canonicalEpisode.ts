import { MediaStatus } from '@server/constants/media';

export interface CanonicalEpisodeIdentity {
  seasonNumber: number;
  episodeNumber: number;
}

declare const canonicalEpisodeKeyBrand: unique symbol;

export type CanonicalEpisodeKey = string & {
  readonly [canonicalEpisodeKeyBrand]: true;
};

export interface CanonicalEpisodeStatuses {
  status: MediaStatus;
  status4k: MediaStatus;
}

export const canonicalEpisodeKey = ({
  seasonNumber,
  episodeNumber,
}: CanonicalEpisodeIdentity): CanonicalEpisodeKey =>
  `${seasonNumber}-${episodeNumber}` as CanonicalEpisodeKey;

export const canonicalEpisodeKeys = (
  episodes: readonly CanonicalEpisodeIdentity[]
): Set<CanonicalEpisodeKey> =>
  new Set(episodes.map((episode) => canonicalEpisodeKey(episode)));

export const canonicalEpisodeStatus = (
  episode: CanonicalEpisodeStatuses,
  is4k: boolean
): MediaStatus => episode[is4k ? 'status4k' : 'status'];

export const canonicalEpisodeAvailable = (
  episode: CanonicalEpisodeStatuses,
  is4k: boolean
): boolean => canonicalEpisodeStatus(episode, is4k) === MediaStatus.AVAILABLE;
