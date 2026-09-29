import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageCard } from "@/components/page-card";
import { getCurrentUser } from "@/server/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up - Shared Reading Lists" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/lists");
  return (
    <PageCard title="Create your account" intro="Start collecting the books you want to read.">
      <SignupForm />
      <p className="mt-6 text-sm text-stone-700">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
          Sign in
        </Link>
      </p>
    </PageCard>
  );
}
