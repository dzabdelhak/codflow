export function uniqueViolation(err: unknown): { constraint: string | null } | null {
  let cause: unknown = err;
  for (let depth = 0; cause && typeof cause === "object" && depth < 5; depth++) {
    const { code, constraint } = cause as { code?: unknown; constraint?: unknown };
    if (code === "23505") return { constraint: typeof constraint === "string" ? constraint : null };
    cause = (cause as { cause?: unknown }).cause;
  }
  return null;
}

export function violatesUnique(err: unknown, constraint: string): boolean {
  return uniqueViolation(err)?.constraint === constraint;
}
