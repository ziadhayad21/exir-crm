// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'El-Exir ERP — Tourism Company Management',
  description: 'Complete CRM & Business Management System for Tourism Companies',
};

export const viewport: Viewport = {
  themeColor: '#FFFCF6',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} style={{ colorScheme: 'light' }}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
