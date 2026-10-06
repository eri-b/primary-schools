/* oxlint-disable next(no-html-link-for-pages) -- vinext's production Link navigation throws when switching regions. */

const regions = [
  { slug: 'nyc', label: 'NYC' },
  { slug: 'westchester', label: 'Westchester' },
  { slug: 'long-island', label: 'Long Island' },
  { slug: 'hudson-valley', label: 'Hudson Valley' },
  { slug: 'new-jersey', label: 'New Jersey' },
  { slug: 'connecticut', label: 'Connecticut' },
] as const;

type Region = (typeof regions)[number]['slug'];

export function RegionNav({ current }: { current: Region }) {
  return (
    <nav className="region-nav" aria-label="Choose region">
      {regions.map(({ slug, label }) => (
        <a
          key={slug}
          href={`/elementary/${slug}`}
          aria-current={current === slug ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
