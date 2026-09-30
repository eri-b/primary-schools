import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NYC Elementary Schools',
  description: 'Explore New York City public elementary schools, zones, districts, and 2026 assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
