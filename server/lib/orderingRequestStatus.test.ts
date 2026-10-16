import { MediaRequestStatus } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveOrderingStatusFromEpisodes,
  isOrderingRequestComplete,
} from './orderingRequestStatus';

describe('deriveOrderingStatusFromEpisodes', () => {
  it('derives status from episode states', () => {
    assert.equal(deriveOrderingStatusFromEpisodes([]), undefined);
    assert.equal(
      deriveOrderingStatusFromEpisodes([
        { status: MediaRequestStatus.COMPLETED },
      ]),
      MediaRequestStatus.COMPLETED
    );
    assert.equal(
      deriveOrderingStatusFromEpisodes([
        { status: MediaRequestStatus.APPROVED },
      ]),
      MediaRequestStatus.APPROVED
    );
    assert.equal(
      deriveOrderingStatusFromEpisodes([
        { status: MediaRequestStatus.APPROVED },
        { status: MediaRequestStatus.PENDING },
      ]),
      MediaRequestStatus.PENDING
    );
  });
});

describe('isOrderingRequestComplete', () => {
  it('requires every group and episode to be complete', () => {
    assert.equal(
      isOrderingRequestComplete([
        {
          episodes: [
            { status: MediaRequestStatus.COMPLETED },
            { status: MediaRequestStatus.COMPLETED },
          ],
        },
      ]),
      true
    );
    assert.equal(
      isOrderingRequestComplete([
        {
          episodes: [
            { status: MediaRequestStatus.COMPLETED },
            { status: MediaRequestStatus.APPROVED },
          ],
        },
      ]),
      false
    );
  });
});
