import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import whatsappService from './service';
import type { Message, MediaType } from './types';

const MAX_MESSAGES_PER_CHAT = 50;

// Same reasoning as chats.ts: Baileys only pushes message history on a
// fresh pairing (via `messaging-history.set`) or as new messages arrive
// (`messages.upsert`) — it never re-sends what a client should already
// have persisted locally. Without persisting this cache, every process
// restart lost all message history even though WhatsApp considered us
// already synced.
const CACHE_DIR = join(process.cwd(), 'data', 'whatsapp');
const MESSAGES_FILE = join(CACHE_DIR, '_messages_cache.json');

// Same globalThis fix as chats.ts / service.ts — see those for why a
// plain module-level Map isn't safe under Next.js dev's per-route module
// duplication.
const globalForMessages = globalThis as unknown as {
  whatsappMessagesCache: Map<string, Message[]> | undefined;
};
const messagesCache = globalForMessages.whatsappMessagesCache ?? new Map<string, Message[]>();
if (process.env.NODE_ENV !== 'production') {
  globalForMessages.whatsappMessagesCache = messagesCache;
}

function loadPersistedMessages() {
  try {
    if (existsSync(MESSAGES_FILE)) {
      const raw: Record<string, Message[]> = JSON.parse(readFileSync(MESSAGES_FILE, 'utf-8'));
      for (const [chatId, messages] of Object.entries(raw)) {
        messagesCache.set(chatId, messages);
      }
    }
  } catch (error) {
    console.error('[WhatsApp Messages] Error loading persisted messages:', error);
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
      const asObject = Object.fromEntries(messagesCache.entries());
      writeFileSync(MESSAGES_FILE, JSON.stringify(asObject));
    } catch (error) {
      console.error('[WhatsApp Messages] Error persisting messages:', error);
    }
  }, 500);
}

loadPersistedMessages();

// Holds the raw Baileys WAMessage for media messages — needed later to
// actually decrypt the media bytes (downloadMediaMessage() takes the full
// message, not just a URL, since attachments are end-to-end encrypted).
// Deliberately NOT persisted to disk: the mediaKey/fileEncSha256 fields
// are binary (Buffer) and JSON round-tripping them without a custom
// (de)serializer would silently corrupt them, and WhatsApp's CDN direct
// paths expire anyway — media older than the current process's lifetime
// just won't be viewable, same tradeoff as a browser cache.
const globalForRawMessages = globalThis as unknown as {
  whatsappRawMessagesCache: Map<string, any> | undefined;
};
const rawMessagesCache = globalForRawMessages.whatsappRawMessagesCache ?? new Map<string, any>();
if (process.env.NODE_ENV !== 'production') {
  globalForRawMessages.whatsappRawMessagesCache = rawMessagesCache;
}

export function getRawMessage(messageId: string): any {
  return rawMessagesCache.get(messageId);
}

export function cacheRawMessage(messageId: string, rawMsg: any) {
  rawMessagesCache.set(messageId, rawMsg);
}

const MEDIA_FIELD_BY_TYPE: Record<MediaType, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  document: 'documentMessage',
  sticker: 'stickerMessage',
};

function detectMedia(msg: any): { type: MediaType; content: any } | null {
  for (const [type, field] of Object.entries(MEDIA_FIELD_BY_TYPE) as [MediaType, string][]) {
    const content = msg.message?.[field];
    if (content) return { type, content };
  }
  return null;
}

// Baileys v7 has no `socket.fetchMessages(chatId, n)` API to pull history
// on demand (that method was removed) — message history only ever arrives
// pushed from the server, via `messaging-history.set` on initial pairing
// and `messages.upsert` for anything after. So this cache, populated by
// the service's event listeners and persisted to disk above, is the only
// source of truth; there is nothing left to "fetch" here.
export async function getMessages(chatId: string): Promise<Message[]> {
  return messagesCache.get(chatId) || [];
}

export function formatMessage(msg: any): Message {
  const media = detectMedia(msg);
  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    media?.content?.caption ||
    '';

  return {
    id: msg.key.id,
    fromMe: msg.key.fromMe,
    body,
    timestamp: typeof msg.messageTimestamp === 'object'
      ? msg.messageTimestamp?.toNumber?.() ?? 0
      : msg.messageTimestamp ?? 0,
    author: msg.key.participant || msg.key.remoteJid,
    chatId: msg.key.remoteJid,
    ...(media && {
      mediaType: media.type,
      mimetype: media.content.mimetype ?? undefined,
      fileName: media.content.fileName ?? undefined,
      width: media.content.width ?? undefined,
      height: media.content.height ?? undefined,
    }),
  };
}

export function addMessage(chatId: string, message: Message, rawMsg?: any) {
  const messages = messagesCache.get(chatId) || [];
  messages.push(message);
  if (messages.length > MAX_MESSAGES_PER_CHAT) {
    // History sync can push messages out of chronological order (it
    // arrives reverse-chronologically) — sort before trimming so we
    // always keep the most recent ones, not whichever happened to be
    // pushed last.
    messages.sort((a, b) => a.timestamp - b.timestamp);
    messages.splice(0, messages.length - MAX_MESSAGES_PER_CHAT);
  }
  messagesCache.set(chatId, messages);
  schedulePersist();

  if (message.mediaType && rawMsg) {
    cacheRawMessage(message.id, rawMsg);
  }
}

export function clearMessages() {
  messagesCache.clear();
  schedulePersist();
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const socket = await whatsappService.getClient();
  await socket.sendMessage(chatId, { text });
}
