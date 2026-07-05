// ============================================================
// CRM — Relationship stage steps
// ============================================================
// Separate from the sales pipeline `stage` (Kanban/funnel). Tracks where
// the client is in the relationship itself, including the post-sale
// referral step that the sales pipeline has no equivalent for.
// ============================================================

export const RELATIONSHIP_STAGES = [
  { key: 'contacto_unico', label: 'Contacto único' },
  { key: 'en_conversacion', label: 'En conversación' },
  { key: 'entrevista', label: 'Entrevista' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'seguimiento', label: 'Seguimiento' },
  { key: 'compra', label: 'Compra' },
  { key: 'recomendacion', label: 'Recomendación' },
] as const;

export type RelationshipStageKey = typeof RELATIONSHIP_STAGES[number]['key'];

export function relationshipStageLabel(key: string): string {
  return RELATIONSHIP_STAGES.find(s => s.key === key)?.label ?? RELATIONSHIP_STAGES[0].label;
}
