import type { Metadata } from "next";
import { connection } from "next/server";
import { SENTRY_META } from "@/client/sentry-config";
import { getPublicClientConfig } from "@/server/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shared Reading Lists",
  description: "Create reading lists and share them with others.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Runtime configuration (APP_ENV, DSN) must be read per request, not frozen at build time.
  await connection();
  const client = getPublicClientConfig();
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta name={SENTRY_META.dsn} content={client.sentryDsn} />
        <meta name={SENTRY_META.release} content={client.release} />
        <meta name={SENTRY_META.environment} content={client.environment} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
