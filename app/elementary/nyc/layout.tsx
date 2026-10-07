import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('nyc', 'elementary'),
  description: 'Explore New York City public elementary schools, zones, districts, and 2026 assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
