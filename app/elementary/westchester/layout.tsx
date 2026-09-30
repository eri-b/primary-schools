import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Westchester Elementary Schools',
  description: 'Explore Westchester County public elementary schools, school districts, historical attendance zones, and 2024–25 assessment results.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
