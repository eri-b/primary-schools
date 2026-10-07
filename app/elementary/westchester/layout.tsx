import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('westchester', 'elementary'),
  description: 'Explore Westchester County public elementary schools, school districts, historical attendance zones, and 2024–25 assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
