'use client';
import React from 'react';
import Link from 'next/link';
import { Home, Instagram, Facebook, MessageCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <div className="leading-none">
              <span className="font-black text-lg tracking-tight">CVA</span>
              <span className="block text-[9px] font-medium tracking-[0.25em] text-muted-foreground">D E A L</span>
            </div>
          </Link>

          {/* Links */}
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-orange-500 transition-colors">Inicio</Link>
            <Link href="/modelos" className="hover:text-orange-500 transition-colors">Modelos</Link>
            <Link href="/entregas" className="hover:text-orange-500 transition-colors">Entregas</Link>
            <Link href="/contacto" className="hover:text-orange-500 transition-colors">Contacto</Link>
          </div>

          {/* Social */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="mr-2">Seguinos</span>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:text-orange-500 hover:border-orange-500 transition-colors">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:text-orange-500 hover:border-orange-500 transition-colors">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:text-orange-500 hover:border-orange-500 transition-colors">
              <MessageCircle className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} CVA Deal. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
