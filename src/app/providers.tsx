'use client';

// Client-side providers wrapper — isolates Firebase from SSR
import { AuthProvider } from '@/contexts/AuthContext';

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
