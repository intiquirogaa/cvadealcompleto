'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Send, Loader2, MessageSquare, Search, RefreshCw, LogOut, Smile, FileText, Download, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: string;
  timestamp: number | null;
}

type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

interface Message {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  author: string;
  mediaType?: MediaType;
  mimetype?: string;
  fileName?: string;
  width?: number;
  height?: number;
}

interface StatusUpdate {
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

interface StatusGroup {
  posterJid: string;
  posterName: string;
  updates: StatusUpdate[];
}

// Profile pictures are lazy-fetched per row via IntersectionObserver (there
// are 1714+ chats in a real account — fetching all of them eagerly would
// hammer the WhatsApp API and jank up the initial render) and cached here
// so scrolling back up doesn't re-fetch what's already resolved.
const avatarUrlCache = new Map<string, string | null>();

function ChatAvatar({
  jid,
  name,
  className,
}: {
  jid: string;
  name: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(avatarUrlCache.get(jid) ?? null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (avatarUrlCache.has(jid)) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        fetch(`/api/whatsapp/avatar?jid=${encodeURIComponent(jid)}`)
          .then((res) => res.json())
          .then((data) => {
            avatarUrlCache.set(jid, data.url ?? null);
            setUrl(data.url ?? null);
          })
          .catch(() => avatarUrlCache.set(jid, null));
      },
      { rootMargin: '150px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [jid]);

  return (
    <div ref={containerRef}>
      <Avatar className={className}>
        {url && <AvatarImage src={url} alt={name} />}
        <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    </div>
  );
}

const COMMON_EMOJIS = [
  '😀', '😂', '🥰', '😍', '😊', '😉', '😎', '🤔',
  '😢', '😭', '😡', '🥳', '😴', '🤗', '👍', '👎',
  '👏', '🙏', '💪', '🔥', '✨', '🎉', '❤️', '💔',
  '👀', '✅', '❌', '⚠️', '📌', '💬', '☕', '🍕',
];

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <PopoverContent className="w-64 p-2" align="end">
      <div className="grid grid-cols-8 gap-1">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl p-1 rounded hover:bg-muted transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </PopoverContent>
  );
}

function MessageContent({
  message,
  onOpenLightbox,
}: {
  message: Message;
  onOpenLightbox: () => void;
}) {
  const mediaUrl = message.mediaType
    ? `/api/whatsapp/media?id=${encodeURIComponent(message.id)}`
    : null;

  switch (message.mediaType) {
    case 'image':
      return (
        <div className="space-y-1">
          <img
            src={mediaUrl!}
            alt={message.body || 'Imagen'}
            onClick={onOpenLightbox}
            className="rounded-lg max-w-[240px] max-h-[240px] object-cover cursor-pointer"
          />
          {message.body && (
            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          )}
        </div>
      );
    case 'sticker':
      return (
        <img src={mediaUrl!} alt="Sticker" className="w-28 h-28 object-contain" />
      );
    case 'video':
      return (
        <div className="space-y-1">
          <video
            src={mediaUrl!}
            controls
            className="rounded-lg max-w-[240px] max-h-[240px] cursor-pointer"
            onClick={onOpenLightbox}
          />
          {message.body && (
            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          )}
        </div>
      );
    case 'audio':
      return <audio src={mediaUrl!} controls className="max-w-[240px]" />;
    case 'document':
      return (
        <a
          href={mediaUrl!}
          download={message.fileName || 'documento'}
          className="flex items-center gap-2 p-2 rounded-lg bg-black/10 hover:bg-black/20 transition-colors"
        >
          <FileText className="w-8 h-8 flex-shrink-0" />
          <span className="text-sm truncate">{message.fileName || 'Documento'}</span>
          <Download className="w-4 h-4 flex-shrink-0 ml-auto" />
        </a>
      );
    default:
      return <p className="text-sm whitespace-pre-wrap">{message.body}</p>;
  }
}

function Lightbox({ message, onClose }: { message: Message; onClose: () => void }) {
  const mediaUrl = `/api/whatsapp/media?id=${encodeURIComponent(message.id)}`;
  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300"
      >
        <X className="w-8 h-8" />
      </button>
      {message.mediaType === 'video' ? (
        <video
          src={mediaUrl}
          controls
          autoPlay
          className="max-w-full max-h-full"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={mediaUrl}
          alt={message.body || 'Imagen'}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

function StatusViewer({
  group,
  onClose,
}: {
  group: StatusGroup;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const current = group.updates[index];
  const mediaUrl = `/api/whatsapp/media?id=${encodeURIComponent(current.id)}`;

  const goNext = () => {
    if (index < group.updates.length - 1) setIndex(index + 1);
    else onClose();
  };
  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 left-4 right-4 flex items-center gap-3 text-white">
        <div className="flex-1 flex gap-1">
          {group.updates.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white transition-all"
                style={{ width: i < index ? '100%' : i === index ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute top-10 left-4 flex items-center gap-2 text-white">
        <span className="font-medium text-sm">{group.posterName}</span>
      </div>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300"
      >
        <X className="w-8 h-8" />
      </button>

      <div className="flex items-center justify-center gap-2 w-full max-w-2xl">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="text-white disabled:opacity-20 p-2"
        >
          ‹
        </button>
        <div className="flex-1 flex flex-col items-center gap-2">
          {current.mediaType === 'video' ? (
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="max-h-[70vh] max-w-full rounded-lg"
            />
          ) : current.mediaType === 'image' ? (
            <img
              src={mediaUrl}
              alt={current.body || 'Estado'}
              className="max-h-[70vh] max-w-full object-contain rounded-lg"
            />
          ) : (
            <div className="bg-muted text-foreground rounded-lg p-8 max-w-md text-center">
              {current.body || '(sin contenido)'}
            </div>
          )}
          {current.body && current.mediaType && (
            <p className="text-white text-sm">{current.body}</p>
          )}
        </div>
        <button onClick={goNext} className="text-white p-2">
          ›
        </button>
      </div>
    </div>
  );
}

interface WhatsAppChatProps {
  onDisconnected?: () => void;
}

export function WhatsAppChat({ onDisconnected }: WhatsAppChatProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [lightboxMessage, setLightboxMessage] = useState<Message | null>(null);
  const [statusGroups, setStatusGroups] = useState<StatusGroup[]>([]);
  const [viewingStatusGroup, setViewingStatusGroup] = useState<StatusGroup | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const insertEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
  };

  console.log('[WhatsAppChat] Component mounted');

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect');
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
        fetchChats();
        fetchStatusGroups();
      } else if (data.status === 'qr' && data.qrCode) {
        setConnectionStatus('qr');
        setQrCode(data.qrCode);
      } else {
        setConnectionStatus(data.status || 'disconnected');
      }
    } catch(e) {
      setConnectionStatus('disconnected');
    }
  };

  const connectWhatsApp = async () => {
    setConnectionStatus('connecting');
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' })
      });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
      if (data.qrCode) setQrCode(data.qrCode);
    } catch(e) {
      setConnectionStatus('disconnected');
    }
  };

  const disconnectWhatsApp = async () => {
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      setConnectionStatus('disconnected');
      setQrCode(null);
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
      onDisconnected?.();
    } catch (e) {
      console.error('Error disconnecting', e);
    }
  };

  const fetchChats = async () => {
    console.log('[WhatsAppChat] fetchChats called');
    setIsLoadingChats(true);
    try {
      const response = await fetch('/api/whatsapp/chats');
      const data = await response.json();
      console.log('[WhatsAppChat] Response:', data);

      if (!response.ok) {
        console.error('[WhatsAppChat] API Error:', data.error);
        onDisconnected?.();
        return;
      }

      console.log('[WhatsAppChat] Chats received:', data.chats?.length);
      setChats(data.chats || []);
    } catch (error) {
      console.error('[WhatsAppChat] Error fetching chats:', error);
      onDisconnected?.();
    } finally {
      setIsLoadingChats(false);
    }
  };

  const fetchStatusGroups = async () => {
    try {
      const response = await fetch('/api/whatsapp/statuses');
      if (!response.ok) return;
      const data = await response.json();
      setStatusGroups(data.groups || []);
    } catch (error) {
      console.error('[WhatsAppChat] Error fetching statuses:', error);
    }
  };

  const fetchMessages = async (chatId: string) => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/whatsapp/messages?id=${encodeURIComponent(chatId)}`);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || isSending) return;

    setIsSending(true);
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat.id,
          message: newMessage,
        }),
      });

      // Add message to local state
      const tempMessage: Message = {
        id: Date.now().toString(),
        fromMe: true,
        body: newMessage,
        timestamp: Math.floor(Date.now() / 1000),
        author: 'Yo',
      };
      setMessages([...messages, tempMessage]);
      setNewMessage('');
      
      // Refresh messages after a short delay
      setTimeout(() => {
        if (selectedChat) fetchMessages(selectedChat.id);
      }, 1000);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    checkStatus();

    const eventSource = new EventSource('/api/whatsapp/events');
    eventSource.addEventListener('state', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.state === 'connected') {
        setConnectionStatus('connected');
        void fetchChats();
        void fetchStatusGroups();
      } else if (payload.state === 'qr') {
        setConnectionStatus('qr');
        void checkStatus(); // refresh qr code
      } else {
        setConnectionStatus(payload.state as ConnectionStatus);
      }
    });

    eventSource.addEventListener('message', () => {
      if (selectedChat) {
        void fetchMessages(selectedChat.id);
      }
      void fetchStatusGroups();
    });

    return () => {
      eventSource.close();
    };
  }, [selectedChat]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es-ES');
  };

  if (connectionStatus !== 'connected') {
    return (
      <Card className="w-full h-[600px] flex items-center justify-center">
        <div className="text-center space-y-6 max-w-sm w-full p-6">
          <MessageSquare className="w-16 h-16 mx-auto text-primary opacity-80" />
          <h2 className="text-2xl font-bold">Conectar WhatsApp</h2>
          
          {connectionStatus === 'connecting' && (
            <div className="space-y-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Estableciendo conexión...</p>
            </div>
          )}

          {connectionStatus === 'qr' && qrCode && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl inline-block border shadow-sm">
                <QRCodeSVG value={qrCode} size={256} />
              </div>
              <p className="text-sm text-muted-foreground">Escanea el código QR con tu aplicación de WhatsApp para iniciar sesión.</p>
            </div>
          )}

          {connectionStatus === 'disconnected' && (
            <Button onClick={connectWhatsApp} className="w-full" size="lg">
              Iniciar Sesión
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {statusGroups.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {statusGroups.map((group) => (
            <button
              key={group.posterJid}
              onClick={() => setViewingStatusGroup(group)}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-16"
            >
              <div className="p-0.5 rounded-full ring-2 ring-primary">
                <ChatAvatar jid={group.posterJid} name={group.posterName} className="h-14 w-14" />
              </div>
              <span className="text-xs truncate w-full text-center">
                {group.posterName}
              </span>
            </button>
          ))}
        </div>
      )}
    <div className="flex h-[600px] gap-4">
      {/* Chats List */}
      <Card className="w-80 flex flex-col min-h-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chats
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchChats}
                disabled={isLoadingChats}
                title="Actualizar chats"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingChats ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={disconnectWhatsApp}
                title="Desconectar WhatsApp"
              >
                <LogOut className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
          <ScrollArea className="h-full">
            {isLoadingChats ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No hay chats
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`w-full p-3 rounded-lg text-left transition-colors ${
                      selectedChat?.id === chat.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <ChatAvatar jid={chat.id} name={chat.name} className="h-10 w-10" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate text-sm">
                            {chat.name}
                          </span>
                          {chat.timestamp && (
                            <span className="text-xs opacity-70">
                              {formatTimestamp(chat.timestamp)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs opacity-80 truncate">
                            {chat.lastMessage}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Chat View */}
      <Card className="flex-1 flex flex-col min-h-0">
        {selectedChat ? (
          <>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-3">
                <ChatAvatar jid={selectedChat.id} name={selectedChat.name} className="h-10 w-10" />
                <div>
                  <div className="font-medium">{selectedChat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedChat.isGroup ? 'Grupo' : 'Chat individual'}
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              <ScrollArea className="flex-1 p-4">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    No hay mensajes
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-2 ${
                            message.fromMe
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {!message.fromMe && (
                            <div className="text-xs font-medium mb-1 opacity-70">
                              {message.author}
                            </div>
                          )}
                          <MessageContent
                            message={message}
                            onOpenLightbox={() => setLightboxMessage(message)}
                          />
                          <div className="text-xs opacity-70 mt-1 text-right">
                            {formatTimestamp(message.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isSending}>
                        <Smile className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <EmojiPicker onSelect={insertEmoji} />
                  </Popover>
                  <Input
                    placeholder="Escribe un mensaje..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSending}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Selecciona un chat para comenzar</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>

      {lightboxMessage && (
        <Lightbox message={lightboxMessage} onClose={() => setLightboxMessage(null)} />
      )}
      {viewingStatusGroup && (
        <StatusViewer group={viewingStatusGroup} onClose={() => setViewingStatusGroup(null)} />
      )}
    </div>
  );
}
