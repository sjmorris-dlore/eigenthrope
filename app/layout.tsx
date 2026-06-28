import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/app/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eigenthrope",
  description: "A collaborative mystery across collapsing universes. Connect your Xaman wallet to join the Observer community on the XRP Ledger.",
  openGraph: {
    title: "Eigenthrope",
    description: "A collaborative mystery across collapsing universes. Connect your Xaman wallet to join the Observer community on the XRP Ledger.",
    siteName: "Eigenthrope",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Eigenthrope",
    description: "A collaborative mystery across collapsing universes. Connect your Xaman wallet to join the Observer community on the XRP Ledger.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" type="image/png" href="/favicon-96x96.png?v=20260628" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=20260628" />
        <link rel="shortcut icon" href="/favicon.ico?v=20260628" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=20260628" />
        <link rel="manifest" href="/site.webmanifest?v=20260628" />
        {/* Runs before React hydrates — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var stored = localStorage.getItem('eigenthrope-theme');
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (stored === 'dark' || (!stored && prefersDark)) {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="flex min-h-full flex-col pt-12">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
