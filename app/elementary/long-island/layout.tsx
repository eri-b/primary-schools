import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Long Island Elementary Schools',
  description: 'Explore Nassau and Suffolk public elementary schools, district boundaries, demographics, and 2024–25 NYSED assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
