'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  LayoutDashboard, Calendar, MessageSquare, Heart,
  HeadphonesIcon, CalendarCheck, HelpCircle, Zap, TrendingDown, ChevronRight,
  Clock, MapPin, ShoppingCart, FileText, Eye, XCircle, CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';

const formatARS = (n: number) => `$ ${n.toLocaleString('es-AR')}`;

const SIDEBAR_ITEMS = [
  { id: 'panel', label: 'Mi Panel', icon: LayoutDashboard, href: '#panel' },
  { id: 'consultas', label: 'Mis Consultas', icon: MessageSquare, href: '#consultas' },
  { id: 'guardados', label: 'Mis Modelos Guardados', icon: Heart, href: '/favorites' },
];

interface EnergyConfig {
  id: string;
  sizeM2: number;
  label: string;
  tradCost: number;
  secoCost: number;
}

export function DashboardContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('panel');
  const [selectedSize, setSelectedSize] = useState('70');
  const [energyConfigs, setEnergyConfigs] = useState<EnergyConfig[]>([]);
  const [consultasTab, setConsultasTab] = useState<'reservas' | 'entrevistas' | 'consultas'>('reservas');

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch('/api/orders').then(r => r.json()).then(d => { setOrders(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
      fetch('/api/energy-config').then(r => r.json()).then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setEnergyConfigs(d);
          setSelectedSize(String(d[0].sizeM2));
        }
      }).catch(() => {});
    }
  }, [status, router]);

  const appointments = useMemo(() => {
    return orders.flatMap((o: any) => (o.appointments ?? []).map((a: any) => ({ ...a, orderNumber: o.orderNumber, propertyAddress: a.property?.address || 'Propiedad' })));
  }, [orders]);

  const reservas = appointments.filter((a: any) => a.status === 'pending' || a.status === 'confirmed');
  const entrevistas = appointments.filter((a: any) => a.status === 'completed' || a.status === 'confirmed');
  const upcomingAppts = appointments.filter((a: any) => a.status !== 'cancelled');
  const completedInterviews = appointments.filter((a: any) => a.status === 'confirmed');

  const currentConfig = energyConfigs.find(c => String(c.sizeM2) === selectedSize);
  const tradMonthly = currentConfig ? Math.round(currentConfig.tradCost) : Math.round(28450 * (Number(selectedSize) / 70));
  const secoMonthly = currentConfig ? Math.round(currentConfig.secoCost) : Math.round(14120 * (Number(selectedSize) / 70));
  const savings = tradMonthly - secoMonthly;
  const savingsPercent = tradMonthly > 0 ? Math.round((savings / tradMonthly) * 100) : 0;

  const sizeOptions = energyConfigs.length > 0
    ? energyConfigs.map(c => ({ value: String(c.sizeM2), label: c.label || `Vivienda ${c.sizeM2} m²` }))
    : [{ value: '48', label: 'Vivienda 48 m²' }, { value: '70', label: 'Vivienda 70 m²' }, { value: '90', label: 'Vivienda 90 m²' }, { value: '110', label: 'Vivienda 110 m²' }, { value: '130', label: 'Vivienda 130 m²' }];

  if (loading) return <main className="flex-1 flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" /></main>;

  const getStatusBadge = (s: string) => {
    const map: Record<string, { label: string; color: string; icon: any }> = {
      pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
      confirmed: { label: 'Confirmada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
      completed: { label: 'Completada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CalendarCheck },
      cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
    };
    const info = map[s] || map.pending;
    const Icon = info.icon;
    return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${info.color}`}><Icon className="w-3 h-3" />{info.label}</span>;
  };

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-24 space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">MI CUENTA</div>
                <nav className="space-y-0.5">
                  {SIDEBAR_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    if (item.href.startsWith('/')) {
                      return (
                        <Link key={item.id} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Icon className="w-4 h-4" /> {item.label}
                        </Link>
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isActive ? 'bg-orange-500 text-white font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {item.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Help card */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HelpCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-semibold">¿Necesitás ayuda?</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Nuestro equipo de asesores está para acompañarte.</p>
                <Link href="/asesoria" className="flex items-center justify-center gap-2 w-full border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium py-2 rounded-lg transition-colors text-sm">
                  <HeadphonesIcon className="w-4 h-4" /> Contactar asesor
                </Link>
              </div>

              {/* Visit CTA */}
              <div className="rounded-xl overflow-hidden">
                <div className="relative aspect-[4/3] bg-muted">
                  <Image src="/hero-house.jpg" alt="Visitar modelo" fill className="object-cover" />
                </div>
                <div className="bg-card border border-border border-t-0 rounded-b-xl p-4">
                  <div className="text-sm font-semibold mb-1">¿Querés ver tu modelo en persona?</div>
                  <p className="text-xs text-muted-foreground mb-3">Coordiná una entrevista personalizada sin compromiso.</p>
                  <Link href="/asesoria" className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-lg transition-colors text-sm">
                    <Calendar className="w-4 h-4" /> Agendar entrevista
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1">
            {activeSection === 'panel' && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <LayoutDashboard className="w-6 h-6 text-orange-500" />
                  <h1 className="text-2xl font-black">Mi Panel</h1>
                </div>
                <p className="text-muted-foreground text-sm mb-8">
                  Bienvenido, {session?.user?.name ?? 'Usuario'}. Acá podés ver tus reservas, entrevistas, consultas y más.
                </p>

                {/* Stats cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { icon: Calendar, label: 'Próximas citas', value: upcomingAppts.length, sub: upcomingAppts.length === 0 ? 'No tenés citas programadas' : 'Ver agenda' },
                    { icon: CalendarCheck, label: 'Entrevistas realizadas', value: completedInterviews.length, sub: 'Ver historial' },
                    { icon: MessageSquare, label: 'Consultas', value: 0, sub: 'Ver historial' },
                    { icon: Heart, label: 'Modelos guardados', value: '-', sub: 'Ver mis modelos', color: true },
                  ].map((s, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <s.icon className="w-5 h-5 text-orange-500" />
                        <span className="text-sm font-medium">{s.label}</span>
                      </div>
                      <div className="text-2xl font-black">{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Two columns: Orders + Energy Simulator */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Orders History */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ShoppingCart className="w-5 h-5 text-orange-500" />
                      <h2 className="text-lg font-bold">Historial de pedidos</h2>
                    </div>
                    {orders.length === 0 ? (
                      <div className="text-center py-12">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="font-medium text-sm">No tenés pedidos aún</p>
                        <p className="text-xs text-muted-foreground mb-4">Cuando realices una reserva, aparecerá aquí tu historial.</p>
                        <Link href="/" className="inline-flex items-center gap-1 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
                          Explorar modelos
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orders.slice(0, 5).map((o: any) => (
                          <div key={o.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <div>
                              <div className="text-sm font-medium">Orden #{o.orderNumber}</div>
                              <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString('es-AR')}</div>
                            </div>
                            <div className="text-sm font-bold text-orange-500">{formatARS(o.totalAmount)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Energy Simulator */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-orange-500" />
                        <h2 className="text-lg font-bold">Simulá tu ahorro energético</h2>
                      </div>
                      <select
                        value={selectedSize}
                        onChange={(e) => setSelectedSize(e.target.value)}
                        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                      >
                        {sizeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Compará el consumo mensual estimado entre una construcción tradicional y en seco.
                    </p>

                    {/* Comparison cards */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Tradicional</div>
                        <div className="text-lg font-bold text-red-500">{formatARS(tradMonthly)}<span className="text-xs font-normal">/mes</span></div>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Construcción en seco</div>
                        <div className="text-lg font-bold text-blue-500">{formatARS(secoMonthly)}<span className="text-xs font-normal">/mes</span></div>
                      </div>
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Ahorro mensual</div>
                        <div className="text-lg font-bold text-green-500">{formatARS(savings)}</div>
                        <div className="text-xs text-green-500">{savingsPercent}% menos</div>
                      </div>
                    </div>

                    {/* Visual bar comparison */}
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Tradicional</span><span>{formatARS(tradMonthly)}</span></div>
                        <div className="h-4 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-500/60 rounded-full" style={{ width: '100%' }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Construcción en seco</span><span>{formatARS(secoMonthly)}</span></div>
                        <div className="h-4 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500/60 rounded-full" style={{ width: tradMonthly > 0 ? `${(secoMonthly / tradMonthly) * 100}%` : '50%' }} /></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Zap className="w-3 h-3 text-green-500" />
                        Una construcción en seco puede reducir hasta un 50% el consumo energético anual.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-orange-500" />
                      <h2 className="text-lg font-bold">Actividad reciente</h2>
                    </div>
                  </div>
                  {appointments.length === 0 && orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No hay actividad reciente.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {appointments.slice(0, 4).map((a: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                            <CalendarCheck className="w-4 h-4 text-orange-500" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{a.status === 'confirmed' ? 'Entrevista completada' : 'Reserva realizada'}</div>
                            <div className="text-[10px] text-muted-foreground">{a.scheduledDate} · {a.scheduledTime} hs</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ======= MIS CONSULTAS (unified) ======= */}
            {activeSection === 'consultas' && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <MessageSquare className="w-6 h-6 text-orange-500" />
                  <h1 className="text-2xl font-black">Mis Consultas</h1>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                  Accedé al historial de tus reservas, entrevistas y consultas en un solo lugar.
                </p>

                {/* Sub-tabs */}
                <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
                  {[
                    { key: 'reservas' as const, label: 'Reservas', icon: Calendar },
                    { key: 'entrevistas' as const, label: 'Entrevistas', icon: CalendarCheck },
                    { key: 'consultas' as const, label: 'Consultas', icon: FileText },
                  ].map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setConsultasTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors ${
                          consultasTab === tab.key
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Reservas tab */}
                {consultasTab === 'reservas' && (
                  <div className="space-y-3">
                    {reservas.length === 0 ? (
                      <div className="text-center py-16">
                        <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="font-semibold">No tenés reservas activas</p>
                        <p className="text-sm text-muted-foreground mt-1">Cuando realices una reserva, aparecerá aquí.</p>
                      </div>
                    ) : (
                      reservas.map((a: any, i: number) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-orange-500" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{a.propertyAddress}</p>
                                <p className="text-xs text-muted-foreground">{a.scheduledDate} · {a.scheduledTime} hs — Orden #{a.orderNumber}</p>
                              </div>
                            </div>
                            {getStatusBadge(a.status)}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                )}

                {/* Entrevistas tab */}
                {consultasTab === 'entrevistas' && (
                  <div className="space-y-3">
                    {entrevistas.length === 0 ? (
                      <div className="text-center py-16">
                        <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="font-semibold">No tenés entrevistas registradas</p>
                        <p className="text-sm text-muted-foreground mt-1">Las entrevistas confirmadas y completadas aparecerán aquí.</p>
                      </div>
                    ) : (
                      entrevistas.map((a: any, i: number) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                                <CalendarCheck className="w-5 h-5 text-green-500" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{a.propertyAddress}</p>
                                <p className="text-xs text-muted-foreground">{a.scheduledDate} · {a.scheduledTime} hs</p>
                              </div>
                            </div>
                            {getStatusBadge(a.status)}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                )}

                {/* Consultas tab */}
                {consultasTab === 'consultas' && (
                  <div className="text-center py-16">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="font-semibold">No tenés consultas registradas</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">Las consultas realizadas a nuestros asesores aparecerán aquí.</p>
                    <Link href="/asesoria" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm">
                      <HeadphonesIcon className="w-4 h-4" /> Contactar un asesor
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
