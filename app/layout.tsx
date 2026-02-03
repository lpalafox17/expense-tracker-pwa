import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track income, expenses, budgets, and debts.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Expense Tracker",
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
      className="h-full"
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Expense Tracker" />
      </head>

      <body className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}