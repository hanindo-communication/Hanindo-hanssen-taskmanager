import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Hanssen's Workspace",
  description: 'A collaborative task workspace inspired by monday.com',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
