export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'qr';

export interface WhatsAppStatus {
  connected: boolean;
  connecting: boolean;
  qrAvailable: boolean;
  authenticated: boolean;
  phone?: string;
  user?: {
    id: string;
    name: string;
  };
}

export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: string;
  timestamp?: number;
  profilePictureUrl?: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface Message {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  author?: string;
  chatId: string;
  mediaType?: MediaType;
  mimetype?: string;
  fileName?: string;
  /** Dimensions when known (image/video/sticker) — lets the UI reserve
   *  layout space before the media itself has loaded. */
  width?: number;
  height?: number;
}

export interface StatusUpdate {
  id: string;
  posterJid: string;
  posterName: string;
  timestamp: number;
  body: string;
  mediaType?: MediaType;
  mimetype?: string;
  width?: number;
  height?: number;
}
