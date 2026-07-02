import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const SESSION_DIR = join(process.cwd(), 'data', 'whatsapp');

export async function getSessionAuth() {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  return {
    state,
    saveCreds,
  };
}

export function clearSession() {
  const fs = require('fs');
  const path = require('path');

  if (existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    console.log('[WhatsApp Session] Session directory deleted');
  }
}
