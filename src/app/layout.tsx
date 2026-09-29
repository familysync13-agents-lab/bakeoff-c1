import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { SENTRY_META } from "@/client/sentry-config";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { getPublicClientConfig } from "@/server/config";
import { getCurrentUser } from "@/server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shared Reading Lists",
  description: "Create reading lists, add books and share them with a read-only link.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f4",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Runtime configuration (APP_ENV, DSN) must be read per request, not frozen at build time.
  await connection();
  const client = getPublicClientConfig();
  const user = await getCurrentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta name={SENTRY_META.dsn} content={client.sentryDsn} />
        <meta name={SENTRY_META.release} content={client.release} />
        <meta name={SENTRY_META.environment} content={client.environment} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppShell user={user} signOutAction={signOut}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
