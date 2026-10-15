import AirDateBadge from '@app/components/AirDateBadge';
import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Transition,
} from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { TvOrdering } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.TvDetails.Ordering', {
  somethingwentwrong:
    'Something went wrong while retrieving the applied episode ordering.',
  noepisodes: 'Episode list unavailable.',
  group: 'Group {groupNumber}',
  episodeCount: '{episodeCount, plural, one {# Episode} other {# Episodes}}',
  canonicalEpisode: 'S{seasonNumber}E{episodeNumber}',
});

type OrderingProps = {
  tvId: number;
};

const Ordering = ({ tvId }: OrderingProps) => {
  const intl = useIntl();
  const { data, error, isLoading } = useSWR<TvOrdering>(
    `/api/v1/tv/${tvId}/ordering`
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex w-full flex-col space-y-2">
      {data.groups.map((group, groupIndex) => (
        <Disclosure key={`ordering-group-${group.id}`}>
          {({ open }) => (
            <>
              <DisclosureButton
                className={`mt-2 flex w-full items-center justify-between space-x-2 border-gray-700 bg-gray-800 px-4 py-2 text-gray-200 ${
                  open
                    ? 'rounded-t-md border-l border-r border-t'
                    : 'rounded-md border'
                }`}
              >
                <div className="flex flex-1 items-center space-x-2 text-lg">
                  <span>
                    {group.name ||
                      intl.formatMessage(messages.group, {
                        groupNumber: groupIndex + 1,
                      })}
                  </span>
                  <Badge badgeType="dark">
                    {intl.formatMessage(messages.episodeCount, {
                      episodeCount: group.episodeCount,
                    })}
                  </Badge>
                </div>
                <ChevronDownIcon
                  className={`${
                    open ? 'rotate-180' : ''
                  } h-6 w-6 text-gray-500`}
                />
              </DisclosureButton>
              <Transition
                as="div"
                show={open}
                enter="transition-opacity duration-100 ease-out"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="transition-opacity duration-75 ease-out"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                style={{ margin: '0px' }}
              >
                <DisclosurePanel className="w-full rounded-b-md border-b border-l border-r border-gray-700 px-4 pb-2">
                  {group.episodes.length === 0 ? (
                    <p>{intl.formatMessage(messages.noepisodes)}</p>
                  ) : (
                    <div className="flex flex-col justify-center divide-y divide-gray-700">
                      {group.episodes.map((episode) => (
                        <div
                          className="flex flex-col space-y-4 py-4 xl:flex-row xl:space-x-4 xl:space-y-4"
                          key={`ordering-group-${group.id}-episode-${episode.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-x-2 xl:space-y-0">
                              <h3 className="text-lg">
                                {episode.position} - {episode.name}
                              </h3>
                              <span className="text-sm text-gray-400">
                                {intl.formatMessage(messages.canonicalEpisode, {
                                  seasonNumber: episode.canonicalSeasonNumber,
                                  episodeNumber: episode.canonicalEpisodeNumber,
                                })}
                              </span>
                              {episode.airDate && (
                                <AirDateBadge airDate={episode.airDate} />
                              )}
                            </div>
                            {episode.overview && <p>{episode.overview}</p>}
                          </div>
                          {episode.stillPath && (
                            <div className="relative aspect-video xl:h-32">
                              <CachedImage
                                type="tmdb"
                                className="rounded-lg object-contain"
                                src={episode.stillPath}
                                alt=""
                                fill
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </DisclosurePanel>
              </Transition>
            </>
          )}
        </Disclosure>
      ))}
    </div>
  );
};

export default Ordering;
