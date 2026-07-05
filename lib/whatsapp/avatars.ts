import whatsappService from './service';

// Profile picture URLs are plain (signed, non-encrypted) links straight to
// WhatsApp's CDN — unlike message media there's nothing to decrypt, so the
// frontend can just point an <img> at the URL directly once we've fetched
// it via the authenticated socket. Cached in memory (globalThis-backed,
// same reasoning as the other caches in this module) keyed by jid; `null`
// means "no picture" so we don't keep re-querying the same jid.
const globalForAvatars = globalThis as unknown as {
  whatsappAvatarCache: Map<string, string | null> | undefined;
};
const avatarCache = globalForAvatars.whatsappAvatarCache ?? new Map<string, string | null>();
if (process.env.NODE_ENV !== 'production') {
  globalForAvatars.whatsappAvatarCache = avatarCache;
}

export async function getAvatarUrl(jid: string): Promise<string | null> {
  if (avatarCache.has(jid)) {
    return avatarCache.get(jid) ?? null;
  }

  try {
    const socket = await whatsappService.getClient();
    const url = await socket.profilePictureUrl(jid, 'preview');
    avatarCache.set(jid, url ?? null);
    return url ?? null;
  } catch {
    // No picture set, or privacy settings block it — either way, not an
    // error worth surfacing, just remember there's nothing to show.
    avatarCache.set(jid, null);
    return null;
  }
}
