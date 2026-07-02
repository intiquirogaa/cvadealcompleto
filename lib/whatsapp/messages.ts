import whatsappService from './service';
import type { Message } from './types';

const messagesCache = new Map<string, Message[]>();

export async function getMessages(chatId: string): Promise<Message[]> {
  const socket = await whatsappService.getClient();

  if (!messagesCache.has(chatId)) {
    try {
      const messages = await socket.fetchMessages(chatId, 50);

      const formattedMessages = messages.map((msg: any) => ({
        id: msg.key.id,
        fromMe: msg.key.fromMe,
        body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
        timestamp: msg.messageTimestamp,
        author: msg.key.participant || msg.key.remoteJid,
        chatId: msg.key.remoteJid,
      }));

      messagesCache.set(chatId, formattedMessages);
    } catch (error) {
      console.error('[WhatsApp Messages] Error fetching messages:', error);
      return [];
    }
  }

  return messagesCache.get(chatId) || [];
}

export function addMessage(chatId: string, message: Message) {
  const messages = messagesCache.get(chatId) || [];
  messages.push(message);
  messagesCache.set(chatId, messages);
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const socket = await whatsappService.getClient();
  await socket.sendMessage(chatId, { text });
}
