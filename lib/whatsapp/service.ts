import { EventEmitter } from 'events';
import makeWASocket, {
  DisconnectReason,
  WASocket,
  type ConnectionState as BaileysConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { clearSession as clearSessionDir, getSessionAuth } from './session';
import { clearChats, handleChatUpdate } from './chats';
import type { ConnectionState as ConnState } from './types';

class WhatsAppService extends EventEmitter {
  private static instance: WhatsAppService | null = null;

  private socket: WASocket | null = null;
  private connectionState: ConnState = 'disconnected';
  private qrCode: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isDisconnecting = false;

  private constructor() {
    super();
  }

  static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }

    return WhatsAppService.instance;
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

    if (this.socket) {
      try {
        (this.socket as any).ws?.close?.();
      } catch (error) {
        console.error('[WhatsApp Service] Error closing socket:', error);
      }
    }

    this.clearSocket();
    this.qrCode = null;
    clearChats();
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
          this.emit('message', message);
        });
      }
    });

    socket.ev.on('chats.set', (chats: any[]) => {
      chats.forEach((chat: any) => handleChatUpdate(chat));
    });

    socket.ev.on('chats.upsert', (chats: any[]) => {
      chats.forEach((chat: any) => handleChatUpdate(chat));
    });

    socket.ev.on('chats.update', (chats: any[]) => {
      chats.forEach((chat: any) => handleChatUpdate(chat));
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
      const shouldReconnect = !this.isDisconnecting && reason !== DisconnectReason.loggedOut;

      this.clearSocket();
      this.qrCode = null;
      this.setConnectionState('disconnected');

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

    this.setConnectionState('connecting');
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
        (this.socket as any).ws?.close?.();
      } catch (error) {
        console.error('[WhatsApp Service] Error cleaning socket:', error);
      }

      try {
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.ev.removeAllListeners('chats.set');
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

export const whatsappService = WhatsAppService.getInstance();
export type { ConnState as WhatsAppConnectionState };
export default whatsappService;
