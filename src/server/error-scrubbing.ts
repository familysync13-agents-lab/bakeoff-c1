import "server-only";

const FILTERED = "[Filtered]";

/**
 * Replaces every occurrence of the given secret values in an error event (messages, stack frames, request data,
 * breadcrumbs, contexts) with "[Filtered]", in place. Defence in depth: data collection is already minimal.
 */
export function scrubSecrets<T>(event: T, secrets: readonly (string | undefined)[]): T {
  const values = secrets.filter((secret): secret is string => typeof secret === "string" && secret.length > 0);
  if (values.length === 0) return event;
  const redact = (text: string): string => values.reduce((out, secret) => out.split(secret).join(FILTERED), text);
  const seen = new WeakSet<object>();
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return redact(value);
    if (typeof value !== "object" || value === null || seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = walk(value[i]);
      return value;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const scrubbedKey = redact(key);
      const scrubbedValue = walk(record[key]);
      if (scrubbedKey !== key) delete record[key];
      record[scrubbedKey] = scrubbedValue;
    }
    return value;
  };
  return walk(event) as T;
}
