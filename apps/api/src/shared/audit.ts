import type { Request } from 'express';
import type { Tx } from '../database/tx';
import type { Actor } from '../middleware/auth';

export interface AuditEntry {
  action: string; // '<entity>.<verb>', e.g. 'member.create'
  entityType: string;
  entityId: string | null;
  diff?: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
}

/** Fields that must never be written into the audit log. */
const REDACTED = new Set(['password', 'token', 'code', 'code_hash', 'codeHash']);

function redact(obj: Record<string, unknown> | undefined) {
  if (!obj) return undefined;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, REDACTED.has(k) ? '[redacted]' : v]),
  );
}

/** Only keys whose value actually changed (keeps the log readable and small). */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

export async function writeAudit(
  tx: Tx,
  actor: Actor,
  req: Request,
  entry: AuditEntry,
): Promise<void> {
  await tx
    .insertInto('audit_logs')
    .values({
      actor_id: actor.userId,
      actor_roles: actor.roles,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      diff: entry.diff
        ? JSON.stringify({ before: redact(entry.diff.before), after: redact(entry.diff.after) })
        : null,
      ip: req.ip ?? null,
      user_agent: req.get('user-agent')?.slice(0, 300) ?? null,
      request_id: String(req.id ?? ''),
    })
    .execute();
}
