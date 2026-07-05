import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { Chat } from './types';

// Baileys only sends the *full* chat history once, right after a fresh QR
// pairing (`messaging-history.set`) — on every later reconnect it assumes
// the client already persisted that locally and just sends incremental
// `chats.upsert`/`update` from then on. We only ever persisted the auth
// creds, not the chats themselves, so every process restart came back to
// an empty chat list even though the WhatsApp side considered us already
// synced. Persisting this cache to disk (alongside the auth session
// files) closes that gap.
const CACHE_DIR = join(process.cwd(), 'data', 'whatsapp');
const CHATS_FILE = join(CACHE_DIR, '_chats_cache.json');

// Same globalThis fix as lib/whatsapp/service.ts: Next.js dev compiles
// each API route into its own module graph, so a plain module-level Map
// gets a separate, empty copy per route — confirmed live, the socket's
// route persisted real chats to disk while /api/whatsapp/chats' own copy
// of this module still read back empty. globalThis is shared process-wide
// regardless of how many module copies exist.
const globalForChats = globalThis as unknown as {
  whatsappChatsCache: Map<string, Chat> | undefined;
};
const chatsCache = globalForChats.whatsappChatsCache ?? new Map<string, Chat>();
if (process.env.NODE_ENV !== 'production') {
  globalForChats.whatsappChatsCache = chatsCache;
}

function loadPersistedChats() {
  try {
    if (existsSync(CHATS_FILE)) {
      const raw: Chat[] = JSON.parse(readFileSync(CHATS_FILE, 'utf-8'));
      for (const chat of raw) {
        chatsCache.set(chat.id, chat);
      }
    }
  } catch (error) {
    console.error('[WhatsApp Chats] Error loading persisted chats:', error);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
      }
      writeFileSync(CHATS_FILE, JSON.stringify(Array.from(chatsCache.values())));
    } catch (error) {
      console.error('[WhatsApp Chats] Error persisting chats:', error);
    }
    // Debounced rather than one write per chat — an initial history sync
    // can upsert hundreds of chats in a burst.
  }, 500);
}

loadPersistedChats();

export async function getChats(): Promise<Chat[]> {
  return Array.from(chatsCache.values()).sort((a: Chat, b: Chat) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp - a.timestamp;
  });
}

export function updateChat(chat: Chat) {
  chatsCache.set(chat.id, chat);
  schedulePersist();
}

export function getChat(id: string): Chat | undefined {
  return chatsCache.get(id);
}

export function clearChats() {
  chatsCache.clear();
  schedulePersist();
}

export function handleChatUpdate(chat: any) {
  const formattedChat: Chat = {
    id: chat.id,
    name: chat.name || chat.id.split('@')[0],
    isGroup: chat.id.endsWith('@g.us'),
    unreadCount: chat.unreadCount || 0,
    lastMessage: chat.lastMessage?.message?.conversation || chat.lastMessage?.message?.extendedTextMessage?.text || undefined,
    timestamp: chat.lastMessage?.messageTimestamp || undefined,
  };

  updateChat(formattedChat);
}
