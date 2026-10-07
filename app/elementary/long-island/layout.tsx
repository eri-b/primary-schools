import type { Metadata } from 'next';
import { schoolMapTitle } from '@/lib/map-title';

export const metadata: Metadata = {
  title: schoolMapTitle('long-island', 'elementary'),
  description: 'Explore Nassau and Suffolk public elementary schools, district boundaries, demographics, and 2024–25 NYSED assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
