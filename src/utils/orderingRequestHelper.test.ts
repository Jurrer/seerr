import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaStatus } from '@server/constants/media';
import type { TvOrdering } from '@server/models/Tv';

import {
  getSelectableOrderingGroups,
  orderingGroupRequestStates,
  storedOrderingGroupRequestStates,
} from './orderingRequestHelper';

const createOrdering = (): TvOrdering => ({
  id: 'ordering-1',
  name: 'Story Arc',
  description: 'Story arc ordering',
  episodeCount: 4,
  groupCount: 2,
  type: 'story_arc',
  isApplied: true,
  groups: [
    {
      id: 'group-1',
      name: 'First Arc',
      episodeCount: 2,
      status: 4,
      status4k: 1,
      availableEpisodeCount: 1,
      available4kEpisodeCount: 0,
      episodes: [
        {
          id: 1,
          name: 'Available episode',
          airDate: null,
          position: 1,
          canonicalSeasonNumber: 1,
          canonicalEpisodeNumber: 1,
          overview: '',
          productionCode: '',
          stillPath: undefined,
          voteAverage: 0,
          voteCount: 0,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.AVAILABLE,
        },
        {
          id: 2,
          name: 'Requestable episode',
          airDate: null,
          position: 2,
          canonicalSeasonNumber: 1,
          canonicalEpisodeNumber: 2,
          overview: '',
          productionCode: '',
          stillPath: undefined,
          voteAverage: 0,
          voteCount: 0,
          status: MediaStatus.PENDING,
          status4k: MediaStatus.PENDING,
        },
      ],
    },
    {
      id: 'group-2',
      name: 'Second Arc',
      episodeCount: 2,
      status: 1,
      status4k: 1,
      availableEpisodeCount: 0,
      available4kEpisodeCount: 0,
      episodes: [
        {
          id: 3,
          name: 'Requested episode',
          airDate: null,
          position: 1,
          canonicalSeasonNumber: 1,
          canonicalEpisodeNumber: 3,
          overview: '',
          productionCode: '',
          stillPath: undefined,
          voteAverage: 0,
          voteCount: 0,
          status: MediaStatus.PENDING,
          status4k: MediaStatus.AVAILABLE,
        },
        {
          id: 4,
          name: 'Unavailable episode',
          airDate: null,
          position: 2,
          canonicalSeasonNumber: 1,
          canonicalEpisodeNumber: 4,
          overview: '',
          productionCode: '',
          stillPath: undefined,
          voteAverage: 0,
          voteCount: 0,
          status: MediaStatus.PENDING,
          status4k: MediaStatus.PENDING,
        },
      ],
    },
  ],
});

const activeRequests = [
  {
    is4k: false,
    status: 2,
    seasons: [],
    orderingGroups: [
      {
        groupId: 'group-2',
        status: 2,
        episodes: [{ seasonNumber: 1, episodeNumber: 3, status: 2 }],
      },
    ],
  },
  {
    is4k: true,
    status: 2,
    seasons: [],
    orderingGroups: [
      {
        groupId: 'group-2',
        status: 2,
        episodes: [{ seasonNumber: 1, episodeNumber: 4, status: 2 }],
      },
    ],
  },
  {
    is4k: false,
    status: 5,
    seasons: [{ seasonNumber: 1, status: 5 }],
    orderingGroups: [],
  },
];

describe('orderingGroupRequestStates', () => {
  it('excludes available and active canonical episodes for the selected quality', () => {
    const states = orderingGroupRequestStates(
      createOrdering(),
      activeRequests,
      false
    );

    assert.deepEqual(
      states.map((group) => ({
        id: group.id,
        availableCount: group.availableCount,
        requestedCount: group.requestedCount,
        requestableCount: group.requestableCount,
      })),
      [
        {
          id: 'group-1',
          availableCount: 1,
          requestedCount: 0,
          requestableCount: 1,
        },
        {
          id: 'group-2',
          availableCount: 0,
          requestedCount: 1,
          requestableCount: 1,
        },
      ]
    );
  });

  it('excludes canonical episodes requested by ordering groups', () => {
    const states = orderingGroupRequestStates(
      createOrdering(),
      activeRequests,
      true
    );

    assert.equal(states[0].requestableCount, 1);
    assert.equal(states[1].requestableCount, 0);
    assert.equal(states[1].availableCount, 1);
  });
});

describe('getSelectableOrderingGroups', () => {
  it('returns only groups with episodes that can be requested', () => {
    const selectable = getSelectableOrderingGroups(
      createOrdering(),
      activeRequests,
      false
    );

    assert.deepEqual(selectable, ['group-1', 'group-2']);
  });
});

describe('storedOrderingGroupRequestStates', () => {
  it('renders stored ordering groups from their request snapshots', () => {
    const states = storedOrderingGroupRequestStates([
      {
        groupId: 'stored-group',
        name: 'Stored Arc',
        episodeCount: 2,
        episodes: [
          { seasonNumber: 1, episodeNumber: 1 },
          { seasonNumber: 2, episodeNumber: 2 },
        ],
      },
    ]);

    assert.deepEqual(states, [
      {
        id: 'stored-group',
        name: 'Stored Arc',
        episodeCount: 2,
        episodes: [
          { seasonNumber: 1, episodeNumber: 1 },
          { seasonNumber: 2, episodeNumber: 2 },
        ],
        availableCount: 0,
        requestedCount: 2,
        requestableCount: 0,
        status: 'requested',
      },
    ]);
  });
});
