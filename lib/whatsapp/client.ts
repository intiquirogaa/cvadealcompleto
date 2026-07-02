import type { WASocket } from '@whiskeysockets/baileys';
import whatsappService from './service';
import type { ConnectionState as ConnState } from './types';

export function getConnectionState(): ConnState {
  return whatsappService.getConnectionState();
}

export function getQRCode(): string | null {
  return whatsappService.getQRCode();
}

export function onConnectionStateChange(callback: (state: ConnState) => void) {
  return whatsappService.onConnectionStateChange(callback);
}

export function onMessage(callback: (message: any) => void) {
  return whatsappService.onMessage(callback);
}

export async function getClient(): Promise<WASocket> {
  return whatsappService.getClient();
}

export async function connect(): Promise<void> {
  await whatsappService.connect();
}

export async function disconnect(): Promise<void> {
  await whatsappService.disconnect();
}

export async function logout(): Promise<void> {
  await whatsappService.logout();
}

export function isConnected(): boolean {
  return whatsappService.isConnected();
}
