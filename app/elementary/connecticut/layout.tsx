import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Southwest Connecticut Elementary Schools',
  description: 'Explore public elementary schools, districts, demographics, and 2024–25 performance indexes in southwestern Connecticut planning regions.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
