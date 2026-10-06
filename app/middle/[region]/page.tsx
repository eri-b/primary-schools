import { permanentRedirect } from 'next/navigation';
import { RegionMap, type Region } from '@/components/region-map';

const regions: Region[] = ['nyc', 'westchester', 'long-island', 'hudson-valley', 'new-jersey', 'connecticut'];

export function generateStaticParams() {
  return regions.map((region) => ({ region }));
}

export default async function MiddleRegion({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!regions.includes(region as Region)) permanentRedirect('/middle/nyc');
  return <RegionMap key={region} region={region as Region} level="middle" />;
}
