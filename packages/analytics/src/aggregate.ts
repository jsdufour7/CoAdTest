/**
 * Agrégations pures des événements produit — aucune dépendance Node/BD :
 * testables au carré, réutilisables côté render serveur.
 * engineVersion « analytics-1.0 ».
 */

export interface ProductEventRow {
  occurredAt: Date;
  name: string;
  actorKind: string;
  actorId: string | null;
  sessionHash: string | null;
  props: unknown;
}

/** Jour civil au format ISO (YYYY-MM-DD), fuseau serveur. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyPoint {
  day: string;
  count: number;
}

/** Série continue des `days` derniers jours (zéros inclus) — sparkline. */
export function buildDailySeries(
  rows: readonly ProductEventRow[],
  days: number,
  now = new Date(),
  filter?: (row: ProductEventRow) => boolean,
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (filter && !filter(row)) continue;
    const key = dayKey(row.occurredAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    points.push({ day, count: counts.get(day) ?? 0 });
  }
  return points;
}

/** Utilisateurs actifs distincts (pseudonymes session) sur la fenêtre. */
export function countActiveSessions(rows: readonly ProductEventRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.sessionHash) seen.add(row.sessionHash);
  }
  return seen.size;
}

/** Personnes actives distinctes (actorId) — complément staff/portail. */
export function countActiveActors(rows: readonly ProductEventRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.actorId) seen.add(row.actorId);
  }
  return seen.size;
}

export interface SignatureFunnel {
  sent: number;
  signed: number;
  declined: number;
  resent: number;
  /** Enveloppes closes signées / closes (signées + refusées). */
  completionRate: number | null;
  declineRate: number | null;
}

function envelopeIdOf(row: ProductEventRow): string | null {
  if (typeof row.props !== "object" || row.props === null) return null;
  const value = (row.props as Record<string, unknown>).envelopeId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Entonnoir signature — dédoublonné par enveloppe (props.envelopeId). */
export function signatureFunnel(
  rows: readonly ProductEventRow[],
): SignatureFunnel {
  const sent = new Set<string>();
  const signed = new Set<string>();
  const declined = new Set<string>();
  const resent = new Set<string>();
  for (const row of rows) {
    const id = envelopeIdOf(row);
    if (!id) continue;
    if (row.name === "signature.envelope_sent") sent.add(id);
    if (row.name === "signature.signed") signed.add(id);
    if (row.name === "signature.declined") declined.add(id);
    if (row.name === "signature.envelope_resent") resent.add(id);
  }
  const closed = signed.size + declined.size;
  return {
    sent: sent.size,
    signed: signed.size,
    declined: declined.size,
    resent: resent.size,
    completionRate: closed > 0 ? signed.size / closed : null,
    declineRate: closed > 0 ? declined.size / closed : null,
  };
}

export interface TopEvent {
  name: string;
  count: number;
}

export function topEvents(
  rows: readonly ProductEventRow[],
  limit = 8,
): TopEvent[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface ActorActivity {
  actorId: string;
  count: number;
  lastAt: Date;
}

/** Activité par membre (vue « équipe » du palier Cabinet). */
export function activityByActor(
  rows: readonly ProductEventRow[],
): ActorActivity[] {
  const byActor = new Map<string, { count: number; lastAt: Date }>();
  for (const row of rows) {
    if (!row.actorId) continue;
    const entry = byActor.get(row.actorId);
    if (entry) {
      entry.count += 1;
      if (row.occurredAt > entry.lastAt) entry.lastAt = row.occurredAt;
    } else {
      byActor.set(row.actorId, { count: 1, lastAt: row.occurredAt });
    }
  }
  return [...byActor.entries()]
    .map(([actorId, v]) => ({ actorId, count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count);
}
