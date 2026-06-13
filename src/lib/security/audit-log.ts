type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";
type SecurityOutcome = "allowed" | "denied" | "failed" | "ignored";

interface SecurityAuditEvent {
  type: string;
  severity: SecuritySeverity;
  route: string;
  outcome: SecurityOutcome;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

const sensitiveKeyPattern = /authorization|cookie|password|secret|session|token|api[_-]?key|hash/i;

export function logSecurityEvent(event: SecurityAuditEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    source: "rift-daily",
    ...event,
    metadata: sanitizeMetadata(event.metadata ?? {})
  };
  const line = JSON.stringify(payload);

  if (event.severity === "critical" || event.severity === "high") {
    console.error(`[security] ${line}`);
    return;
  }

  if (event.severity === "medium") {
    console.warn(`[security] ${line}`);
    return;
  }

  console.info(`[security] ${line}`);
}

export function requestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export function requestUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : sanitizeMetadata(nestedValue, depth + 1)
    ])
  );
}
