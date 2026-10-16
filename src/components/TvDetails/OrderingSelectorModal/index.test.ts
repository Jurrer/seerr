import type { TvOrderingSummary } from '@server/models/Tv';
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from '@testing-library/react';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import React from 'react';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';

import OrderingSelectorButton, {
  shouldShowOrderingButton,
} from '@app/components/TvDetails/OrderingSelectorButton';
import type OrderingSelectorModalType from './index';
import type { applyOrderingRequest as OrderingApplyRequest } from './index';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const window = dom.window;
globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.document = window.document;
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.requestAnimationFrame(callback);
globalThis.cancelAnimationFrame = (handle: number) =>
  window.cancelAnimationFrame(handle);
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  get: () => window.navigator,
});

const axiosPut = mock.method(axios, 'put', async () => ({ status: 204 }));

let OrderingSelectorModal: typeof OrderingSelectorModalType;
let applyOrderingRequest: typeof OrderingApplyRequest;
before(async () => {
  ({ applyOrderingRequest, default: OrderingSelectorModal } =
    await import('./index'));
});

const standardOrdering: TvOrderingSummary = {
  id: 'default',
  name: 'Seasons',
  episodeCount: 4,
  groupCount: 1,
  isApplied: true,
};
const alternateOrdering: TvOrderingSummary = {
  id: 'absolute',
  name: 'Absolute Order',
  description: 'Watch in absolute episode order',
  episodeCount: 4,
  groupCount: 1,
  type: 'Absolute',
  isApplied: false,
};

const messages = {
  'components.TvDetails.OrderingSelectorModal.apply': 'Apply',
  'components.TvDetails.OrderingSelectorModal.applyError':
    'Unable to apply the selected ordering.',
  'components.TvDetails.OrderingSelectorModal.brokenOrdering':
    'The applied ordering is unavailable on TMDB.',
  'components.TvDetails.OrderingSelectorModal.episodes':
    '{episodeCount, plural, one {# episode} other {# episodes}}',
  'components.TvDetails.OrderingSelectorModal.fetchError':
    'Unable to retrieve available orderings.',
  'components.TvDetails.OrderingSelectorModal.groups':
    '{groupCount, plural, one {# group} other {# groups}}',
  'components.TvDetails.OrderingSelectorModal.orderingExplanation':
    'Changing the ordering affects display and future requests.',
  'components.TvDetails.OrderingSelectorModal.standardOrdering': 'Seasons',
  'components.TvDetails.OrderingSelectorModal.success':
    'Ordering applied successfully.',
  'components.TvDetails.OrderingSelectorModal.title': 'Ordering',
};

const renderWithIntl = (
  element: React.ReactElement,
  fetcher: (key: string) => Promise<unknown>
): RenderResult =>
  render(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages },
      React.createElement(
        SWRConfig,
        { value: { fetcher, dedupingInterval: 0, provider: () => new Map() } },
        element
      )
    )
  );

const renderButton = (show: boolean) =>
  render(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages },
      React.createElement(OrderingSelectorButton, {
        show,
        onClick: () => undefined,
      })
    )
  );

afterEach(() => cleanup());
beforeEach(() => {
  axiosPut.mock.resetCalls();
  axiosPut.mock.mockImplementation(async () => ({ status: 204 }));
});

describe('OrderingSelectorButton', () => {
  it('renders for admins', () => {
    const view = renderButton(true);
    assert.ok(view.getByTestId('ordering-selector-button'));
    assert.equal(
      view.getByTestId('ordering-selector-button').textContent,
      'Ordering'
    );
  });

  it('hides for non-admins', () => {
    assert.equal(
      shouldShowOrderingButton({
        hasPermission: false,
        orderings: [standardOrdering, alternateOrdering],
      }),
      false
    );
    const view = renderButton(false);
    assert.equal(view.queryByTestId('ordering-selector-button'), null);
  });

  it('hides when Seasons is the only ordering', () => {
    assert.equal(
      shouldShowOrderingButton({
        hasPermission: true,
        orderings: [standardOrdering],
      }),
      false
    );
  });

  it('shows when the applied ordering is broken and only Seasons remains', () => {
    assert.equal(
      shouldShowOrderingButton({
        hasPermission: true,
        orderings: [standardOrdering],
        currentOrdering: { id: 'removed-ordering', name: 'Removed Ordering' },
      }),
      true
    );
  });
});

describe('OrderingSelectorModal', () => {
  it('shows a loading state while orderings are retrieved', () => {
    const view = renderWithIntl(
      React.createElement(OrderingSelectorModal, {
        tvId: 66732,
        orderingKey: '/api/v1/tv/66732/orderings',
        currentOrdering: undefined,
        onCancel: () => undefined,
      }),
      () => new Promise(() => undefined)
    );

    assert.equal(view.queryByTestId('ordering-option-default'), null);
    assert.equal(view.queryByTestId('modal-ok-button'), null);
  });

  it('shows an error state when orderings cannot be retrieved', async () => {
    const view = renderWithIntl(
      React.createElement(OrderingSelectorModal, {
        tvId: 66732,
        orderingKey: '/api/v1/tv/66732/orderings',
        currentOrdering: undefined,
        onCancel: () => undefined,
      }),
      async () => {
        throw new Error('Unable to retrieve orderings');
      }
    );

    assert.ok(await view.findByText('Unable to retrieve available orderings.'));
  });

  it('preselects the currently applied ordering', async () => {
    const onCancel = () => undefined;
    const view = renderWithIntl(
      React.createElement(OrderingSelectorModal, {
        tvId: 66732,
        orderingKey: '/api/v1/tv/66732/orderings',
        currentOrdering: alternateOrdering,
        onCancel,
      }),
      async () => [
        { ...standardOrdering, isApplied: false },
        { ...alternateOrdering, isApplied: true },
      ]
    );

    assert.ok(await view.findByTestId('ordering-option-default'));
    await waitFor(() =>
      assert.equal(
        view
          .getByTestId('ordering-option-absolute')
          .getAttribute('aria-pressed'),
        'true'
      )
    );
    assert.equal(
      view.getByTestId('ordering-option-default').getAttribute('aria-pressed'),
      'false'
    );

    await waitFor(() =>
      assert.equal(
        view.getByTestId('modal-ok-button').getAttribute('disabled'),
        null
      )
    );
    assert.equal(
      view.getByTestId('ordering-option-absolute').getAttribute('aria-pressed'),
      'true'
    );
  });

  it('sends the selected ordering to the apply endpoint', async () => {
    await applyOrderingRequest(66732, 'absolute');

    assert.equal(axiosPut.mock.callCount(), 1);
    assert.deepEqual(axiosPut.mock.calls[0].arguments, [
      '/api/v1/tv/66732/ordering',
      { orderingId: 'absolute' },
    ]);
  });

  it('preselects Seasons when the applied ordering is broken', async () => {
    const view = renderWithIntl(
      React.createElement(OrderingSelectorModal, {
        tvId: 66732,
        orderingKey: '/api/v1/tv/66732/orderings',
        currentOrdering: {
          id: 'removed-ordering',
          name: 'Removed Ordering',
          episodeCount: 4,
          groupCount: 1,
        },
        onCancel: () => undefined,
      }),
      async () => [standardOrdering]
    );

    assert.ok(await view.findByTestId('ordering-option-default'));
    assert.equal(
      view.getByTestId('ordering-option-default').getAttribute('aria-pressed'),
      'true'
    );
    assert.equal(
      view.getAllByText('The applied ordering is unavailable on TMDB.').length,
      2
    );
    assert.equal(
      view.queryByTestId('ordering-option-removed-ordering')?.tagName,
      'BUTTON'
    );
    assert.equal(
      view
        .getByTestId('ordering-option-removed-ordering')
        .getAttribute('disabled'),
      ''
    );
  });

  it('shows an apply error without closing the modal', async () => {
    axiosPut.mock.mockImplementation(async () => {
      throw new Error('Unable to apply ordering');
    });
    const view = renderWithIntl(
      React.createElement(OrderingSelectorModal, {
        tvId: 66732,
        orderingKey: '/api/v1/tv/66732/orderings',
        currentOrdering: undefined,
        onCancel: () => undefined,
      }),
      async () => [standardOrdering, alternateOrdering]
    );

    fireEvent.click(await view.findByTestId('ordering-option-absolute'));
    fireEvent.click(view.getByTestId('modal-ok-button'));

    assert.ok(await view.findByText('Unable to apply the selected ordering.'));
  });
});
