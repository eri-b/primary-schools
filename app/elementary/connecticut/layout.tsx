import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('connecticut', 'elementary'),
  description: 'Explore public elementary schools, districts, demographics, and 2024–25 performance indexes in southwestern Connecticut planning regions.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
