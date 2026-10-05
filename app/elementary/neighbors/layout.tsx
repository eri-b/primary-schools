import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nearby NJ and CT Elementary Schools',
  description: 'Explore public elementary schools, districts, and demographics in nearby New Jersey counties and southwest Connecticut planning regions.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
