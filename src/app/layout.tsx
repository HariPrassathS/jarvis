import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Mono, Rajdhani } from 'next/font/google';
import './globals.css';
import ClientProviders from './providers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
});

const rajdhani = Rajdhani({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-rajdhani',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'J.A.R.V.I.S — Personal AI Assistant',
  description:
    'Your personal AI assistant — voice-enabled, built by Stark Industries, with an authentic JARVIS-inspired HUD interface.',
  keywords: ['AI', 'assistant', 'JARVIS', 'FRIDAY', 'voice', 'Stark Industries'],
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/jarvis-friday-logo.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/jarvis-friday-logo.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'J.A.R.V.I.S — Personal AI Assistant',
    description: 'Autonomous voice-enabled intelligence assistant featuring JARVIS and FRIDAY personas.',
    images: [{ url: '/jarvis-friday-logo.png', width: 836, height: 836, alt: 'JARVIS & FRIDAY Logo' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${spaceMono.variable} ${rajdhani.variable}`}
    >
      <body className="antialiased font-mono bg-black text-white selection:bg-cyan-500/30 selection:text-white">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
