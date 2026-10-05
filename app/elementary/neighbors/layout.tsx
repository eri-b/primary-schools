import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Jersey Elementary Schools',
  description: 'Explore public elementary schools in nearby New Jersey counties.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
