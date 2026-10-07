import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('new-jersey', 'elementary'),
  description: 'Explore public elementary schools in nearby New Jersey counties.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
