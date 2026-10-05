import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nearby New Jersey Elementary Schools',
  description: 'Explore public elementary schools, districts, demographics, and 2024–25 NJSLA proficiency in nearby New Jersey counties.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
