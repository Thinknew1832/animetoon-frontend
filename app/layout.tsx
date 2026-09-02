import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AnimeToon',
  description: 'Streaming platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
        <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js" defer></script>
      </head>
      <body style={{ margin: 0, backgroundColor: '#06070a', color: '#fff', fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
