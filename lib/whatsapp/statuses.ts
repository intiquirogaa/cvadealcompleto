import { formatMessage, cacheRawMessage } from './messages';
import { getContactName } from './contacts';
import type { StatusUpdate } from './types';

const MAX_PER_POSTER = 30;
const EXPIRY_MS = 24 * 60 * 60 * 1000;

// Status updates (WhatsApp "Stories") arrive as regular messages sent to
// the special status@broadcast JID — see service.ts for where they get
// routed here instead of into the normal chat list. Kept in memory only:
// they expire in 24h anyway, and the underlying raw message (needed to
// decrypt the photo/video) is already memory-only for the same reason as
// lib/whatsapp/messages.ts.
const globalForStatuses = globalThis as unknown as {
  whatsappStatusCache: Map<string, StatusUpdate[]> | undefined;
};
const statusCache = globalForStatuses.whatsappStatusCache ?? new Map<string, StatusUpdate[]>();
if (process.env.NODE_ENV !== 'production') {
  globalForStatuses.whatsappStatusCache = statusCache;
}

export function addStatus(rawMsg: any) {
  const posterJid: string = rawMsg.key.participant || rawMsg.key.remoteJid;
  const formatted = formatMessage(rawMsg);

  const update: StatusUpdate = {
    id: formatted.id,
    posterJid,
    posterName: getContactName(posterJid),
    timestamp: formatted.timestamp,
    body: formatted.body,
    mediaType: formatted.mediaType,
    mimetype: formatted.mimetype,
    width: formatted.width,
    height: formatted.height,
  };

  const existing = statusCache.get(posterJid) || [];
  existing.push(update);
  existing.sort((a, b) => a.timestamp - b.timestamp);
  if (existing.length > MAX_PER_POSTER) {
    existing.splice(0, existing.length - MAX_PER_POSTER);
  }
  statusCache.set(posterJid, existing);

  if (update.mediaType) {
    cacheRawMessage(update.id, rawMsg);
  }
}

/** Grouped by poster, pruned to the last 24h, most-recently-active poster first. */
export function getStatusGroups(): { posterJid: string; posterName: string; updates: StatusUpdate[] }[] {
  const cutoff = Date.now() / 1000 - EXPIRY_MS / 1000;
  const groups: { posterJid: string; posterName: string; updates: StatusUpdate[] }[] = [];

  for (const [posterJid, updates] of statusCache.entries()) {
    const fresh = updates.filter((u) => u.timestamp >= cutoff);
    if (fresh.length === 0) {
      statusCache.delete(posterJid);
      continue;
    }
    statusCache.set(posterJid, fresh);
    groups.push({ posterJid, posterName: fresh[0].posterName, updates: fresh });
  }

  groups.sort((a, b) => {
    const aLatest = a.updates[a.updates.length - 1].timestamp;
    const bLatest = b.updates[b.updates.length - 1].timestamp;
    return bLatest - aLatest;
  });

  return groups;
}

export function clearStatuses() {
  statusCache.clear();
}
