// ============================================================
// CRM — Unified client activity timeline
// ============================================================
// Builds a single, real-data timeline per client by combining the
// actual CRMActivityLog rows with synthetic entries derived from
// other real fields (lastEnriched, updatedAt/stage, createdAt) that
// don't have their own log row. Always returns at least one entry
// (the "created" event), sorted newest first.
// ============================================================

export interface CRMActivityLog {
  id: string;
  type: string;
  title: string;
  description: string;
  metadata?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export function getUnifiedActivities(c: any, stageLabel: string): CRMActivityLog[] {
  const baseLogs = c.activityLogs && c.activityLogs.length > 0 ? [...c.activityLogs] : [];

  if (c.lastEnriched && !baseLogs.some((l: any) => l.type === "osint_enrichment")) {
    baseLogs.push({
      id: "last-enriched",
      type: "osint_enrichment",
      title: "Escaneo web y redes sociales",
      description: "La inteligencia artificial completó el perfil con web scraping.",
      createdAt: c.lastEnriched,
    });
  }

  if (c.updatedAt && c.updatedAt !== c.createdAt && !baseLogs.some((l: any) => l.type === "status_changed")) {
    baseLogs.push({
      id: "status-changed",
      type: "status_changed",
      title: `Estado cambiado a ${stageLabel}`,
      description: "Modificado en el CRM",
      createdAt: c.updatedAt,
    });
  }

  if (!baseLogs.some((l: any) => l.type === "created")) {
    baseLogs.push({
      id: "created",
      type: "created",
      title: "Lead creado en base de datos",
      description: "Asesor asignado registró el cliente.",
      createdAt: c.createdAt,
    });
  }

  baseLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return baseLogs;
}
