import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk'
});

export const metadata: Metadata = {
  title: 'HSN+',
  description: 'A clean football and Formula 1 match browser powered by external API data.'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>
        <header className="topbar">
          <div className="topbar-inner shell">
            <div className="brand">
              <span className="brand-mark">HSN+</span>
              <strong className="brand-title">HSN+ Feed</strong>
            </div>
          </div>
        </header>

        <div style={{ paddingTop: 72 }}>{children}</div>
      </body>
    </html>
  );
}
