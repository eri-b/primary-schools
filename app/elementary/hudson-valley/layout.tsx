import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hudson Valley Elementary Schools',
  description: 'Explore public elementary schools in Dutchess, Orange, Putnam, Rockland, Sullivan, and Ulster counties, with district boundaries, demographics, and 2024–25 NYSED assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
