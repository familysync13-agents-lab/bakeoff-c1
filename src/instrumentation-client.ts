import * as Sentry from "@sentry/nextjs";
import { dataCollection } from "./monitoring/sentry-options";
import { readClientSentryConfig, SENTRY_META } from "./client/sentry-config";

function initSentry(): void {
  const config = readClientSentryConfig(
    (name) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content,
  );
  if (!config) return;
  Sentry.init({ ...config, dataCollection });
}

try {
  if (document.readyState === "loading" && !document.querySelector(`meta[name="${SENTRY_META.environment}"]`)) {
    document.addEventListener("DOMContentLoaded", initSentry, { once: true });
  } else {
    initSentry();
  }
} catch (error) {
  console.error("Error monitoring could not be initialised", error);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
