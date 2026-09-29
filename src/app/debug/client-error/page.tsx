import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageCard } from "@/components/page-card";
import { debugRoutesEnabled } from "@/server/config";
import { TriggerClientErrorButton } from "./trigger-client-error";

export const metadata: Metadata = { title: "Client error test - Shared Reading Lists", robots: { index: false } };

export default async function ClientErrorPage() {
  await connection();
  if (!debugRoutesEnabled()) notFound();
  return (
    <PageCard
      title="Client error test"
      intro="Pressing the button throws an unhandled error in the browser so that error monitoring can be verified."
    >
      <TriggerClientErrorButton />
    </PageCard>
  );
}
