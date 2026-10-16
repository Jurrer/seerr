import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import type { TvOrderingSummary } from '@server/models/Tv';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.TvDetails', {
  ordering: 'Ordering',
});

interface OrderingSelectorButtonProps {
  show: boolean;
  onClick: () => void;
}

export const shouldShowOrderingButton = ({
  hasPermission,
  orderings,
  orderingsError,
  currentOrdering,
  orderingError,
}: {
  hasPermission: boolean;
  orderings?: TvOrderingSummary[];
  orderingsError?: unknown;
  currentOrdering?: TvOrderingSummary;
  orderingError?: string;
}): boolean => {
  const currentOrderingIsUnavailable =
    !!orderingError ||
    (!!currentOrdering?.id &&
      !orderings?.some((ordering) => ordering.id === currentOrdering.id));

  return (
    hasPermission &&
    (!!orderingsError ||
      (!!orderings && (orderings.length > 1 || currentOrderingIsUnavailable)))
  );
};

const OrderingSelectorButton = ({
  show,
  onClick,
}: OrderingSelectorButtonProps) => {
  const intl = useIntl();

  if (!show) return null;

  return (
    <Button
      buttonSize="sm"
      buttonType="ghost"
      onClick={onClick}
      data-testid="ordering-selector-button"
    >
      {intl.formatMessage(messages.ordering)}
    </Button>
  );
};

export default OrderingSelectorButton;
