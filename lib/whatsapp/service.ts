import { EventEmitter } from 'events';
import makeWASocket, {
  DisconnectReason,
  WASocket,
  type ConnectionState as BaileysConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { clearSession as clearSessionDir, getSessionAuth } from './session';
import { clearChats, handleChatUpdate } from './chats';
import { addMessage, clearMessages, formatMessage } from './messages';
import { addStatus, clearStatuses } from './statuses';
import { updateContact } from './contacts';
import type { ConnectionState as ConnState } from './types';

// WhatsApp Status updates ("Stories") are delivered as regular messages
// addressed to this broadcast JID, not through a separate API — see
// statuses.ts. Hardcoded (matches Baileys' own internal STORIES_JID)
// rather than imported since it's just a string constant.
const STATUS_BROADCAST_JID = 'status@broadcast';

class WhatsAppService extends EventEmitter {
  private socket: WASocket | null = null;
  private connectionState: ConnState = 'disconnected';
  private qrCode: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isDisconnecting = false;

  constructor() {
    super();
  }

  getConnectionState(): ConnState {
    return this.connectionState;
  }

  getQRCode(): string | null {
    return this.qrCode;
  }

  onConnectionStateChange(callback: (state: ConnState) => void): () => void {
    this.on('state', callback);
    return () => this.off('state', callback);
  }

  onMessage(callback: (message: any) => void): () => void {
    this.on('message', callback);
    return () => this.off('message', callback);
  }

  async getClient(): Promise<WASocket> {
    if (this.socket) {
      return this.socket;
    }

    if (this.connectPromise) {
      await this.connectPromise;
      if (!this.socket) {
        throw new Error('WhatsApp client is not available');
      }
      return this.socket;
    }

    await this.connect();

    if (!this.socket) {
      throw new Error('WhatsApp client is not available');
    }

    return this.socket;
  }

  async connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.socket && this.connectionState === 'connected') {
      return;
    }

    if (this.connectionState === 'connecting' || this.connectionState === 'qr') {
      return;
    }

    this.isDisconnecting = false;
    this.clearReconnectTimer();
    this.setConnectionState('connecting');
    this.qrCode = null;

    this.connectPromise = this.createSocket().catch((error) => {
      console.error('[WhatsApp Service] Connection failed:', error);
      this.setConnectionState('disconnected');
      this.clearSocket();
      throw error;
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.isDisconnecting = true;
    this.clearReconnectTimer();
    this.clearSocket();
    this.qrCode = null;
    clearChats();
    clearMessages();
    clearStatuses();
    this.setConnectionState('disconnected');
  }

  async logout(): Promise<void> {
    this.isDisconnecting = true;
    this.clearReconnectTimer();

    if (this.socket) {
      try {
        await (this.socket as any).logout?.();
      } catch (error) {
        console.error('[WhatsApp Service] Error logging out:', error);
      }
    }

    this.clearSocket();
    this.qrCode = null;
    clearChats();
    clearMessages();
    clearStatuses();
    clearSessionDir();
    this.setConnectionState('disconnected');
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.socket !== null;
  }

  private async createSocket(): Promise<void> {
    const { state, saveCreds } = await getSessionAuth();

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    this.socket = socket;

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update: Partial<BaileysConnectionState>) => {
      void this.handleConnectionUpdate(update);
    });

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type === 'notify') {
        messages.forEach((message: any) => {
          if (message.key.remoteJid === STATUS_BROADCAST_JID) {
            addStatus(message);
          } else if (message.key.remoteJid) {
            addMessage(message.key.remoteJid, formatMessage(message), message);
          }
          this.emit('message', message);
        });
      }
    });

    // Baileys v7 renamed the old `chats.set` bulk-history event to
    // `messaging-history.set` — it never fires under the old name, which
    // silently left the chat list (and message history) empty after every
    // fresh QR pairing. This is the event that actually delivers chats +
    // messages right after scanning. It also carries `contacts` (names for
    // people you've never 1:1 chatted with — needed to label Status
    // posters) and status@broadcast entries mixed into `chats`/`messages`,
    // which get filtered out here instead of polluting the real chat list
    // (confirmed live: it showed up as a fake chat literally named
    // "status").
    socket.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
      contacts.forEach((contact: any) => updateContact(contact));
      chats
        .filter((chat: any) => chat.id !== STATUS_BROADCAST_JID)
        .forEach((chat: any) => handleChatUpdate(chat));
      messages.forEach((message: any) => {
        if (message.key.remoteJid === STATUS_BROADCAST_JID) {
          addStatus(message);
        } else if (message.key.remoteJid) {
          addMessage(message.key.remoteJid, formatMessage(message), message);
        }
      });
    });

    socket.ev.on('chats.upsert', (chats: any[]) => {
      chats
        .filter((chat: any) => chat.id !== STATUS_BROADCAST_JID)
        .forEach((chat: any) => handleChatUpdate(chat));
    });

    socket.ev.on('chats.update', (chats: any[]) => {
      chats
        .filter((chat: any) => chat.id !== STATUS_BROADCAST_JID)
        .forEach((chat: any) => handleChatUpdate(chat));
    });
  }

  private async handleConnectionUpdate(update: Partial<BaileysConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCode = qr;
      this.setConnectionState('qr');
      return;
    }

    if (connection === 'open') {
      this.reconnectAttempts = 0;
      this.qrCode = null;
      this.setConnectionState('connected');
      return;
    }

    if (connection === 'connecting') {
      this.setConnectionState('connecting');
      return;
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

      this.clearSocket();
      this.qrCode = null;
      this.setConnectionState('disconnected');

      if (this.isDisconnecting) {
        return;
      }

      if (reason === DisconnectReason.restartRequired) {
        // Baileys always closes the socket right after a QR gets scanned
        // and requires a brand-new one to finish the handshake — this is
        // guaranteed to happen on every fresh pairing, not a failure, so
        // it always reconnects and isn't subject to the retry cap below
        // (that cap is for real connection errors). Previously this fell
        // through to scheduleReconnect(), which set state to 'connecting'
        // *before* the timer fired — connect()'s own guard then saw that
        // stale 'connecting' state and silently no-opped, so the
        // reconnect never actually happened and pairing could never
        // complete.
        //
        // A short delay (rather than reconnecting in the same tick) is
        // still needed: reconnecting instantly raced the old socket's
        // teardown on WhatsApp's server and got rejected with a 440
        // "conflict/replaced" — confirmed live, it opened and got kicked
        // in a loop every ~4s, never stabilizing.
        setTimeout(() => void this.connect(), 1200);
        return;
      }

      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      if (shouldReconnect && this.reconnectAttempts < 1) {
        this.reconnectAttempts += 1;
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 3000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearSocket(): void {
    if (this.socket) {
      try {
        // `end()` is Baileys' own graceful-teardown path (same one it
        // calls internally on every disconnect) — it synchronously marks
        // the socket closed and tears down its internal listeners before
        // the network close finishes. A raw `ws.close()` skips all of
        // that: WhatsApp's server can still consider the old socket "live"
        // for a moment, and opening a new one right away for the same
        // device got rejected with a 440 "conflict/replaced" error in a
        // fast reconnect loop, confirmed live (reconnect → open → kicked
        // by conflict → reconnect → ... every ~4s, never stabilizing).
        (this.socket as any).end?.(new Error('Client reconnect'));
      } catch (error) {
        console.error('[WhatsApp Service] Error cleaning socket:', error);
      }

      try {
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.ev.removeAllListeners('messaging-history.set');
        this.socket.ev.removeAllListeners('chats.upsert');
        this.socket.ev.removeAllListeners('chats.update');
      } catch (error) {
        console.error('[WhatsApp Service] Error removing listeners:', error);
      }

      this.socket = null;
    }
  }

  private setConnectionState(nextState: ConnState): void {
    this.connectionState = nextState;
    this.emit('state', nextState);
  }
}

// Next.js dev compiles each API route into its own module graph on first
// request — a plain module-level singleton (`let instance`) ends up
// duplicated, one independent copy per route. Confirmed live: /connect,
// /chats and /events each got their own WhatsAppService instance, so a
// connection established via /connect was invisible to /chats (always
// "not connected", never any chats) and to /events (SSE never reflected
// the real state). `globalThis` is process-wide regardless of how many
// module copies exist — same fix already used for the Prisma client in
// lib/db.ts.
const globalForWhatsApp = globalThis as unknown as {
  whatsappService: WhatsAppService | undefined;
};

export const whatsappService =
  globalForWhatsApp.whatsappService ?? new WhatsAppService();

if (process.env.NODE_ENV !== 'production') {
  globalForWhatsApp.whatsappService = whatsappService;
}

export type { ConnState as WhatsAppConnectionState };
export default whatsappService;
