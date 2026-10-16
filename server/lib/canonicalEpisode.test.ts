import { MediaStatus } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalEpisodeAvailable,
  canonicalEpisodeKey,
  canonicalEpisodeKeys,
  canonicalEpisodeStatus,
} from './canonicalEpisode';

describe('canonical episode identity', () => {
  it('builds canonical episode keys from canonical identities', () => {
    assert.equal(
      canonicalEpisodeKey({ seasonNumber: 1, episodeNumber: 2 }),
      '1-2'
    );
    assert.deepEqual(
      canonicalEpisodeKeys([
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 2, episodeNumber: 3 },
      ]),
      new Set(['1-1', '2-3'])
    );
  });
});

describe('canonical episode availability', () => {
  it('uses the selected quality status', () => {
    const episode = {
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.PENDING,
    };

    assert.equal(canonicalEpisodeStatus(episode, false), MediaStatus.AVAILABLE);
    assert.equal(canonicalEpisodeStatus(episode, true), MediaStatus.PENDING);
    assert.equal(canonicalEpisodeAvailable(episode, false), true);
    assert.equal(canonicalEpisodeAvailable(episode, true), false);
  });
});
