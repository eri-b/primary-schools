import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'School Sampler',
  description: 'Explore 2024–25 public high schools, grade spans, enrollment, and district boundaries across the NYC metro area.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
