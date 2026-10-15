# Applied TMDB ordering precedes anime virtual seasons

When a TV series has an applied alternate ordering, that ordering controls episode grouping for display and requests. Anime virtual-season splitting is not composed with the alternate ordering. When no alternate ordering is applied, existing virtual-season behavior remains unchanged.

## Considered Options

- **Compose alternate ordering with virtual seasons** (rejected): both systems can repartition the same episodes, producing ambiguous grouping and numbering.
- **Let virtual seasons override alternate ordering** (rejected): it would hide an explicitly applied ordering and leave the alternate ordering unusable for anime series.

## Consequences

- Anime users see the applied TMDB ordering instead of virtual seasons while that ordering is applied.
- Anime virtual-season behavior is preserved only for series without an applied alternate ordering.
- Sonarr mismatches remain a separate integration problem because Sonarr may arrange the same series differently.
