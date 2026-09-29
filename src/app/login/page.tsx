import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageCard } from "@/components/page-card";
import { getCurrentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in - Shared Reading Lists" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/lists");
  return (
    <PageCard title="Sign in" intro="Welcome back. Sign in to see your reading lists.">
      <LoginForm />
      <p className="mt-6 text-sm text-stone-700">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
          Create an account
        </Link>
      </p>
    </PageCard>
  );
}
