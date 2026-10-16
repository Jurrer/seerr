import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import { useToasts } from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { TvOrderingSummary } from '@server/models/Tv';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const DEFAULT_ORDERING_ID = 'default';

const messages = defineMessages('components.TvDetails.OrderingSelectorModal', {
  title: 'Ordering',
  standardOrdering: 'Seasons',
  apply: 'Apply',
  brokenOrdering: 'The applied ordering is unavailable on TMDB.',
  applyError: 'Unable to apply the selected ordering.',
  fetchError: 'Unable to retrieve available orderings.',
  episodes: '{episodeCount, plural, one {# episode} other {# episodes}}',
  groups: '{groupCount, plural, one {# group} other {# groups}}',
  orderingExplanation:
    'Changing the ordering affects display and future requests. Existing Ordering Group Requests keep their saved Canonical Episode snapshots.',
  success: 'Ordering applied successfully.',
});

interface OrderingSelectorModalProps {
  tvId: number;
  orderingKey: string;
  currentOrdering?: TvOrderingSummary;
  onCancel: () => void;
}

export const applyOrderingRequest = async (
  tvId: number,
  orderingId: string
) => {
  await axios.put(`/api/v1/tv/${tvId}/ordering`, {
    orderingId,
  });
};

const OrderingSelectorModal = ({
  tvId,
  orderingKey,
  currentOrdering,
  onCancel,
}: OrderingSelectorModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const {
    data: orderings,
    error,
    isLoading,
  } = useSWR<TvOrderingSummary[]>(orderingKey, { revalidateOnMount: true });
  const [selectedOrderingId, setSelectedOrderingId] =
    useState(DEFAULT_ORDERING_ID);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  const appliedOrdering = orderings?.find((ordering) => ordering.isApplied);
  const isBrokenOrdering =
    !!currentOrdering?.error ||
    (!!currentOrdering?.id &&
      !orderings?.some((ordering) => ordering.id === currentOrdering.id));

  useEffect(() => {
    setSelectedOrderingId(appliedOrdering?.id ?? DEFAULT_ORDERING_ID);
  }, [appliedOrdering?.id]);

  const applyOrdering = async () => {
    setIsUpdating(true);
    setUpdateError(false);
    try {
      await applyOrderingRequest(tvId, selectedOrderingId);
      await mutate(`/api/v1/tv/${tvId}`);
      await mutate(orderingKey);
      addToast(intl.formatMessage(messages.success), {
        appearance: 'success',
      });
      onCancel();
    } catch {
      setUpdateError(true);
    } finally {
      setIsUpdating(false);
    }
  };

  const availableOrderings = [
    ...(currentOrdering?.id && isBrokenOrdering
      ? [
          {
            id: currentOrdering.id,
            name: currentOrdering.name,
            description: currentOrdering.description,
            episodeCount: currentOrdering.episodeCount,
            groupCount: currentOrdering.groupCount,
            type: currentOrdering.type,
            error: intl.formatMessage(messages.brokenOrdering),
          },
        ]
      : []),
    ...(orderings ?? []),
  ];

  return (
    <Transition show>
      <Modal
        title={intl.formatMessage(messages.title)}
        subTitle={
          currentOrdering?.name ?? intl.formatMessage(messages.standardOrdering)
        }
        loading={isLoading}
        backgroundClickable
        onCancel={onCancel}
        onOk={applyOrdering}
        okText={intl.formatMessage(messages.apply)}
        okDisabled={isUpdating || isLoading || !!error || !selectedOrderingId}
      >
        {error ? (
          <Alert type="error">{intl.formatMessage(messages.fetchError)}</Alert>
        ) : (
          <>
            {updateError && (
              <Alert type="error">
                {intl.formatMessage(messages.applyError)}
              </Alert>
            )}
            {isBrokenOrdering && (
              <Alert type="warning">
                {intl.formatMessage(messages.brokenOrdering)}
              </Alert>
            )}
            <div className="mb-4 space-y-2">
              {availableOrderings.map((ordering) => {
                const isDisabled = !!ordering.error;
                return (
                  <button
                    type="button"
                    key={ordering.id}
                    disabled={isDisabled}
                    aria-pressed={selectedOrderingId === ordering.id}
                    data-testid={`ordering-option-${ordering.id}`}
                    onClick={() => setSelectedOrderingId(ordering.id)}
                    className={`w-full rounded-md border px-4 py-3 text-left transition ${
                      selectedOrderingId === ordering.id
                        ? 'border-indigo-500 bg-indigo-600/20'
                        : 'border-gray-700 bg-gray-800/80 hover:border-gray-500'
                    } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span className="block font-medium text-gray-100">
                      {ordering.name ?? ordering.id}
                    </span>
                    {ordering.description && (
                      <span className="mt-1 block text-sm text-gray-400">
                        {ordering.description}
                      </span>
                    )}
                    {ordering.error && (
                      <span className="mt-1 block text-sm text-yellow-300">
                        {ordering.error}
                      </span>
                    )}
                    <span className="mt-1 block text-sm text-gray-400">
                      {intl.formatMessage(messages.episodes, {
                        episodeCount: ordering.episodeCount ?? 0,
                      })}{' '}
                      ·{' '}
                      {intl.formatMessage(messages.groups, {
                        groupCount: ordering.groupCount ?? 0,
                      })}
                      {ordering.type ? ` · ${ordering.type}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-gray-400">
              {intl.formatMessage(messages.orderingExplanation)}
            </p>
          </>
        )}
      </Modal>
    </Transition>
  );
};

export default OrderingSelectorModal;
