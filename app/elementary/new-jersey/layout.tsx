import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('new-jersey', 'elementary'),
  description: 'Explore public elementary schools, districts, demographics, and 2024–25 NJSLA proficiency in nearby New Jersey counties.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
