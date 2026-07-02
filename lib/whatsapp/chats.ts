import type { Chat } from './types';

const chatsCache = new Map<string, Chat>();

export async function getChats(): Promise<Chat[]> {
  return Array.from(chatsCache.values()).sort((a: Chat, b: Chat) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp - a.timestamp;
  });
}

export function updateChat(chat: Chat) {
  chatsCache.set(chat.id, chat);
}

export function getChat(id: string): Chat | undefined {
  return chatsCache.get(id);
}

export function clearChats() {
  chatsCache.clear();
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
