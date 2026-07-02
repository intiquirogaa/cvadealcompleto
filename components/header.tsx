'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingCart, Home, Heart, CalendarCheck, Grid3X3, User, HeadphonesIcon, Shield, Users, LogOut, Menu, X, Palette, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';

export function Header() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const userRole = (session?.user as any)?.role ?? 'user';
  const isAdmin = userRole === 'admin';
  const isAdvisor = userRole === 'advisor';
  const canAccessCRM = isAdmin || isAdvisor;

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/cart').then(r => r.json()).then(d => {
        if (Array.isArray(d)) setCartCount(d.length);
      }).catch(() => {});
    }
  }, [status, pathname]);

  const navItems = [
    { href: '/', label: 'Inicio', icon: Home },
    { href: '/favorites', label: 'Guardados', icon: Heart },
    { href: '/entregas', label: 'Entregas', icon: CalendarCheck },
    { href: '/modelos', label: 'Modelos', icon: Grid3X3 },
    { href: '/dashboard', label: 'Mi cuenta', icon: User },
    { href: '/simulator', label: 'Simulador', icon: Palette },
    { href: '/asesoria', label: 'Asesoría', icon: HeadphonesIcon },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div className="leading-none">
            <span className="font-black text-xl tracking-tight">CVA</span>
            <span className="block text-[10px] font-medium tracking-[0.25em] text-muted-foreground">D E A L</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 lg:px-4 py-1.5 rounded-md transition-colors relative group ${
                  active ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
                {active && (
                  <span className="absolute -bottom-[13px] sm:-bottom-[17px] left-2 right-2 h-[2px] bg-orange-500 rounded-full" />
                )}
              </Link>
            );
          })}
          {/* CRM link - visible to admin and advisor only */}
          {canAccessCRM && (
            <Link
              href="/crm"
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md transition-colors relative ${
                isActive('/crm') ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs font-medium">CRM</span>
              {isActive('/crm') && <span className="absolute -bottom-[17px] left-2 right-2 h-[2px] bg-orange-500 rounded-full" />}
            </Link>
          )}
          {/* Admin link - visible to admin only */}
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md transition-colors relative ${
                isActive('/admin') ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span className="text-xs font-medium">Admin</span>
              {isActive('/admin') && <span className="absolute -bottom-[17px] left-2 right-2 h-[2px] bg-orange-500 rounded-full" />}
            </Link>
          )}
        </nav>

        {/* Right side: Cart + Auth + Mobile menu */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cambiar tema"
          >
            <Sun className="w-5 h-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute w-5 h-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </button>

          {status === 'authenticated' && (
            <button
              onClick={() => router.push('/cart')}
              className="relative w-11 h-11 rounded-full border-2 border-orange-500 flex items-center justify-center text-orange-500 hover:bg-orange-500/10 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {status === 'authenticated' && (
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="hidden md:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {status === 'unauthenticated' && (
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => router.push('/login')}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
              >
                Ingresar
              </button>
              <button
                onClick={() => router.push('/register')}
                className="text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                Registrarse
              </button>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center text-foreground"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active ? 'text-orange-500 bg-orange-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
          {canAccessCRM && (
            <Link href="/crm" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
              <Users className="w-5 h-5" /><span className="text-sm font-medium">CRM</span>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
              <Shield className="w-5 h-5" /><span className="text-sm font-medium">Admin</span>
            </Link>
          )}
          {status === 'unauthenticated' && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <button onClick={() => { router.push('/login'); setMobileOpen(false); }} className="flex-1 text-sm font-medium text-center py-2.5 rounded-lg border border-border hover:bg-muted transition-colors">
                Ingresar
              </button>
              <button onClick={() => { router.push('/register'); setMobileOpen(false); }} className="flex-1 text-sm font-medium text-center py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                Registrarse
              </button>
            </div>
          )}
          {status === 'authenticated' && (
            <button onClick={() => { signOut({ callbackUrl: '/' }); setMobileOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted w-full">
              <LogOut className="w-5 h-5" /><span className="text-sm font-medium">Cerrar sesión</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
