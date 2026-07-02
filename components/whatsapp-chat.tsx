'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Loader2, MessageSquare, Search, RefreshCw, LogOut } from 'lucide-react';
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

interface Message {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  author: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  console.log('[WhatsAppChat] Component mounted');

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect');
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
        fetchChats();
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
    <div className="flex h-[600px] gap-4">
      {/* Chats List */}
      <Card className="w-80 flex flex-col">
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
        <CardContent className="flex-1 overflow-hidden p-0">
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
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {chat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
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
      <Card className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {selectedChat.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedChat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedChat.isGroup ? 'Grupo' : 'Chat individual'}
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
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
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
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
  );
}
