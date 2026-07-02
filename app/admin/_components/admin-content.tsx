'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Shield, Package, Calendar, Users, DollarSign, Building2, TrendingUp,
  CheckCircle2, Clock, Edit, Trash2, Plus, Download, UserPlus, BookOpen,
  BarChart3, MessageSquare, ArrowRight, Save, X, Upload, Loader2,
  Palette, Star, Eye, MapPin, Tag, Image as ImageIcon, Banknote
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PropertyForm } from './property-form';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
const statusLabels: Record<string, string> = {
  pending: 'Pendiente', approved: 'Aprobado', confirmed: 'Confirmada', completed: 'Realizada', cancelled: 'Cancelada', rejected: 'Rechazado',
};

const STAGES = [
  { key: 'new_lead', label: 'Nuevo Lead', color: 'bg-gray-500' },
  { key: 'contacted', label: 'Contactado', color: 'bg-blue-500' },
  { key: 'appointment_scheduled', label: 'Cita Agendada', color: 'bg-yellow-500' },
  { key: 'advisory_done', label: 'Asesoría Realizada', color: 'bg-green-500' },
  { key: 'negotiation', label: 'En Negociación', color: 'bg-purple-500' },
  { key: 'closed', label: 'Cerrado', color: 'bg-orange-500' },
];

const BLOG_CATEGORIES = ['Entrega', 'Novedad', 'Testimonio', 'Evento'];
const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';

export function AdminContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [stats, setStats] = useState<any>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any>({});
  const [constructors, setConstructors] = useState<any[]>([]);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [simCombos, setSimCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProp, setEditProp] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [showAdvisorForm, setShowAdvisorForm] = useState(false);
  const [advisorForm, setAdvisorForm] = useState({ name: '', email: '', password: '', phone: '' });
  // Constructor state
  const [showConstructorForm, setShowConstructorForm] = useState(false);
  const [editConstructor, setEditConstructor] = useState<any>(null);
  // Blog state
  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editBlog, setEditBlog] = useState<any>(null);
  // Simulator state
  const [showSimForm, setShowSimForm] = useState(false);
  const [editSim, setEditSim] = useState<any>(null);
  // Stats popups state
  const [statsPopups, setStatsPopups] = useState<any[]>([]);
  const [showStatsForm, setShowStatsForm] = useState(false);
  const [editStatPopup, setEditStatPopup] = useState<any>(null);
  // Energy config state
  const [energyConfigs, setEnergyConfigs] = useState<any[]>([]);
  const [showEnergyForm, setShowEnergyForm] = useState(false);
  const [editEnergy, setEditEnergy] = useState<any>(null);
  // Advisor profiles state
  const [advisorProfiles, setAdvisorProfiles] = useState<any[]>([]);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editProfile, setEditProfile] = useState<any>(null);
  // Simulator colors & revestimientos
  const [simColors, setSimColors] = useState<any[]>([]);
  const [simRevs, setSimRevs] = useState<any[]>([]);
  // Financing plans
  const [financingPlans, setFinancingPlans] = useState<any[]>([]);
  const [showFinancingForm, setShowFinancingForm] = useState(false);
  const [editFinancing, setEditFinancing] = useState<any>(null);

  const role = (session?.user as any)?.role;
  const isAdmin = role === 'admin';
  const isAdvisor = role === 'advisor';
  // Users management (admin only)
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') {
      // Admin panel: only admins and advisors can access, but only admins see all tabs
      if (!isAdmin && !isAdvisor) { router.replace('/dashboard'); return; }
      fetchAll();
    }
  }, [status]);

  const fetchAll = async () => {
    try {
      const fetches: Promise<any>[] = [
        fetch('/api/admin/stats').then(r => r.json()),
        fetch(`/api/admin/orders?status=${statusFilter}`).then(r => r.json()),
        fetch('/api/properties').then(r => r.json()),
        fetch('/api/admin/crm').then(r => r.json()),
        fetch('/api/constructors').then(r => r.json()),
        fetch('/api/admin/blog').then(r => r.json()),
        fetch('/api/simulator').then(r => r.json()),
        fetch('/api/stats-popups').then(r => r.json()),
        fetch('/api/energy-config').then(r => r.json()),
        fetch('/api/advisor-profiles').then(r => r.json()).catch(() => []),
        fetch('/api/simulator/colors').then(r => r.json()),
        fetch('/api/simulator/revestimientos').then(r => r.json()),
        fetch('/api/financing-plans').then(r => r.json()).catch(() => []),
      ];
      if (isAdmin) {
        fetches.push(fetch('/api/admin/advisors').then(r => r.json()));
        fetches.push(fetch('/api/admin/funnel').then(r => r.json()));
        fetches.push(fetch('/api/admin/users').then(r => r.json()));
      }
      const results = await Promise.all(fetches);
      setStats(results[0] ?? {});
      setOrders(results[1] ?? []);
      setProperties(results[2] ?? []);
      setClients(results[3] ?? []);
      setConstructors(results[4] ?? []);
      setBlogPosts(results[5] ?? []);
      setSimCombos(results[6] ?? []);
      setStatsPopups(results[7] ?? []);
      setEnergyConfigs(results[8] ?? []);
      setAdvisorProfiles(results[9] ?? []);
      setSimColors(results[10] ?? []);
      setSimRevs(results[11] ?? []);
      setFinancingPlans(results[12] ?? []);
      if (isAdmin) {
        setAdvisors(results[13] ?? []);
        setFunnel(results[14] ?? {});
        setAllUsers(results[15] ?? []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (status === 'authenticated' && (isAdmin || isAdvisor)) {
      fetch(`/api/admin/orders?status=${statusFilter}`).then(r => r.json()).then(d => setOrders(d ?? [])).catch(console.error);
    }
  }, [statusFilter]);

  const updateAppointmentStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
      if (res.ok) { toast.success('Estado actualizado'); fetchAll(); } else toast.error('Error');
    } catch { toast.error('Error de conexión'); }
  };

  const deleteProperty = async (id: string) => {
    if (!confirm('¿Eliminar esta propiedad?')) return;
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Propiedad eliminada'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const updateStage = async (userId: string, stage: string) => {
    try {
      await fetch('/api/admin/crm/stage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, stage }) });
      toast.success('Etapa actualizada');
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const addNote = async (clientId: string) => {
    if (!noteText.trim()) return;
    try {
      await fetch('/api/admin/crm/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, content: noteText }) });
      setNoteText('');
      toast.success('Nota agregada');
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const createAdvisor = async () => {
    try {
      const res = await fetch('/api/admin/advisors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(advisorForm) });
      if (res.ok) { toast.success('Asesor creado'); setShowAdvisorForm(false); setAdvisorForm({ name: '', email: '', password: '', phone: '' }); fetchAll(); }
      else { const e = await res.json(); toast.error(e?.error ?? 'Error'); }
    } catch { toast.error('Error'); }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) { toast.success('Rol actualizado'); fetchAll(); }
      else { const e = await res.json(); toast.error(e?.error ?? 'Error al cambiar rol'); }
    } catch { toast.error('Error de conexión'); }
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`¿Eliminar al usuario "${userName}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Usuario eliminado'); fetchAll(); }
      else { const e = await res.json(); toast.error(e?.error ?? 'Error'); }
    } catch { toast.error('Error de conexión'); }
  };



  const deleteConstructor = async (id: string) => {
    if (!confirm('¿Desactivar esta constructora?')) return;
    try {
      const res = await fetch(`/api/constructors/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Constructora desactivada'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteBlogPost = async (id: string) => {
    if (!confirm('¿Eliminar este artículo?')) return;
    try {
      const res = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Artículo eliminado'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteStatsPopup = async (id: string) => {
    if (!confirm('¿Eliminar este popup?')) return;
    try {
      const res = await fetch(`/api/stats-popups/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Popup eliminado'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteEnergyConfig = async (id: string) => {
    if (!confirm('¿Eliminar esta configuración?')) return;
    try {
      const res = await fetch(`/api/energy-config/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Configuración eliminada'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteSimColor = async (id: string) => {
    if (!confirm('¿Eliminar este color?')) return;
    try {
      const res = await fetch(`/api/simulator/colors/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Color eliminado'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteSimRev = async (id: string) => {
    if (!confirm('¿Eliminar este revestimiento?')) return;
    try {
      const res = await fetch(`/api/simulator/revestimientos/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Revestimiento eliminado'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteSimCombo = async (id: string) => {
    if (!confirm('¿Eliminar esta combinación?')) return;
    try {
      const res = await fetch(`/api/simulator/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Combinación eliminada'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const deleteFinancingPlan = async (id: string) => {
    if (!confirm('¿Eliminar este plan de financiación?')) return;
    try {
      const res = await fetch(`/api/financing-plans/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Plan eliminado'); fetchAll(); }
    } catch { toast.error('Error'); }
  };

  const exportCSV = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/export';
    a.download = 'pedidos-cvadeal.csv';
    a.click();
  };

  const getClientStage = (client: any) => client?.crmStages?.[0]?.stage ?? 'new_lead';

  if (status === 'loading' || loading) {
    return <main className="flex-1 flex items-center justify-center py-20"><p className="text-muted-foreground">Cargando...</p></main>;
  }

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-bold">Panel de Administración</h1>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => router.push('/admin/osint')} variant="outline" size="sm" className="border-indigo-500/30 text-indigo-500 font-semibold bg-indigo-50 dark:bg-indigo-900/20">
                <Shield className="w-4 h-4 mr-1" /> OSINT Control Center
              </Button>
              <Button onClick={exportCSV} variant="outline" size="sm" className="border-orange-500/30 text-orange-500">
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
              </Button>
            </div>
          )}
        </div>

        {/* Stats with monthly variation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { icon: DollarSign, label: 'Ingresos', value: `$${(stats?.totalRevenue ?? 0)?.toLocaleString?.('es-AR') ?? '0'}`, color: 'text-green-600 bg-green-50 dark:bg-green-900/20', variation: stats?.revenueVariation },
            { icon: Package, label: 'Pedidos', value: stats?.totalOrders ?? 0, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', variation: stats?.ordersVariation },
            { icon: Calendar, label: 'Citas Pendientes', value: stats?.pendingAppointments ?? 0, color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' },
            { icon: Users, label: 'Usuarios', value: stats?.totalUsers ?? 0, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20', variation: stats?.usersVariation },
          ].map((s: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}><s.icon className="w-5 h-5" /></div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    {s.variation !== undefined && (
                      <span className={`text-xs font-medium ${s.variation >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {s.variation >= 0 ? '↑' : '↓'}{Math.abs(s.variation)}%
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick panels: Upcoming appointments + Recent orders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-orange-500" /> Próximas Citas</h4>
              {(stats?.upcomingAppointments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay citas próximas</p>
              ) : (
                <div className="space-y-2">
                  {(stats.upcomingAppointments ?? []).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{a.client || 'Sin asignar'}</p>
                        <p className="text-xs text-muted-foreground">{a.property} • {a.date} {a.time}</p>
                      </div>
                      <Badge className={statusColors[a.status] ?? ''}>{statusLabels[a.status] ?? a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-3"><Package className="w-4 h-4 text-orange-500" /> Pedidos Recientes</h4>
              {(stats?.recentOrders ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay pedidos recientes</p>
              ) : (
                <div className="space-y-2">
                  {(stats.recentOrders ?? []).map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{o.client || 'Anónimo'}</p>
                        <p className="text-xs text-muted-foreground">{o.orderNumber} • ARS ${(o.amount ?? 0).toLocaleString('es-AR')}</p>
                      </div>
                      <Badge className={statusColors[o.status] ?? ''}>{statusLabels[o.status] ?? o.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="crm" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="crm">CRM</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="properties">Propiedades</TabsTrigger>
            <TabsTrigger value="constructors"><Building2 className="w-4 h-4 mr-1" /> Constructoras</TabsTrigger>
            <TabsTrigger value="blog"><BookOpen className="w-4 h-4 mr-1" /> Entregas</TabsTrigger>
            <TabsTrigger value="simulator"><Palette className="w-4 h-4 mr-1" /> Simulador</TabsTrigger>
            <TabsTrigger value="stats-popups"><MessageSquare className="w-4 h-4 mr-1" /> Popups Stats</TabsTrigger>
            <TabsTrigger value="financing"><Banknote className="w-4 h-4 mr-1" /> Financiación</TabsTrigger>
            {isAdmin && <TabsTrigger value="energy"><span className="flex items-center gap-1">⚡ Energía</span></TabsTrigger>}
            {isAdmin && <TabsTrigger value="advisors">Asesores</TabsTrigger>}
            {isAdmin && <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-1" /> Usuarios</TabsTrigger>}
            {isAdmin && <TabsTrigger value="funnel">Funnel</TabsTrigger>}
          </TabsList>


          {/* ===== CRM TAB ===== */}
          <TabsContent value="crm" className="space-y-6">
            {selectedClient ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)} className="text-orange-500">&larr; Volver al pipeline</Button>
                <Card className="border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-xl font-bold">{selectedClient.name}</h2>
                        <p className="text-muted-foreground">{selectedClient.email} {selectedClient.phone ? ` • ${selectedClient.phone}` : ''}</p>
                      </div>
                      <select value={getClientStage(selectedClient)} onChange={(e) => updateStage(selectedClient.id, e.target.value)} className="text-sm border rounded-md px-3 py-1.5 bg-background border-border">
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                    <h3 className="font-semibold mb-3">Historial de Pedidos</h3>
                    {(selectedClient.orders ?? []).map((o: any) => (
                      <div key={o.id} className="bg-muted/50 rounded-lg p-3 mb-2">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm">{o.orderNumber}</span>
                          <Badge className={statusColors[o.status] ?? ''}>{statusLabels[o.status] ?? o.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Total: ARS ${(o.totalAmount ?? 0).toLocaleString('es-AR')}</p>
                      </div>
                    ))}
                    <h3 className="font-semibold mt-6 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Notas de Seguimiento</h3>
                    {(selectedClient.clientNotes ?? []).map((n: any) => (
                      <div key={n.id} className="bg-muted/50 rounded-lg p-3 mb-2">
                        <p className="text-sm">{n.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">{n.advisor?.name} - {new Date(n.createdAt).toLocaleDateString('es-AR')}</p>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input value={noteText} onChange={(e: any) => setNoteText(e.target.value)} placeholder="Agregar nota..." className="flex-1" />
                      <Button onClick={() => addNote(selectedClient.id)} className="bg-orange-500 hover:bg-orange-600 text-white">Agregar</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-4 min-w-[900px] pb-4">
                  {STAGES.map((stage) => {
                    const stageClients = clients.filter((c: any) => getClientStage(c) === stage.key);
                    return (
                      <div key={stage.key} className="flex-1 min-w-[200px]">
                        <div className={`${stage.color} text-white rounded-t-lg px-3 py-2 text-sm font-semibold flex justify-between`}>
                          {stage.label} <span className="bg-white/20 rounded-full px-2 text-xs">{stageClients.length}</span>
                        </div>
                        <div className="bg-muted/30 rounded-b-lg p-2 min-h-[200px] space-y-2">
                          {stageClients.map((c: any) => (
                            <Card key={c.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedClient(c)}>
                              <CardContent className="p-3">
                                <p className="font-semibold text-sm">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.email}</p>
                                <p className="text-xs text-orange-500 mt-1">{c.orders?.length ?? 0} pedidos</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ===== ORDERS TAB ===== */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {['all', 'pending', 'approved', 'rejected'].map((s) => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}
                  className={statusFilter === s ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}>
                  {s === 'all' ? 'Todos' : statusLabels[s] ?? s}
                </Button>
              ))}
            </div>
            {(orders ?? []).map((order: any, i: number) => (
              <motion.div key={order?.id ?? i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold">{order?.orderNumber}</span>
                        <Badge className={statusColors[order?.status ?? ''] ?? ''}>{statusLabels[order?.status ?? ''] ?? order?.status}</Badge>
                      </div>
                      <span className="font-bold text-orange-500">ARS ${(order?.totalAmount ?? 0).toLocaleString('es-AR')}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      <span className="font-medium">{order?.user?.name}</span> - {order?.user?.email}
                    </div>
                    {(order?.appointments ?? []).map((a: any) => (
                      <div key={a?.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-3 mb-1">
                        <div className="text-sm">
                          <span className="font-medium">{a?.property?.address}</span>
                          <span className="text-muted-foreground ml-2">{a?.scheduledDate} {a?.scheduledTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColors[a?.status ?? ''] ?? ''}>{statusLabels[a?.status ?? ''] ?? a?.status}</Badge>
                          {a?.status === 'confirmed' && (
                            <Button size="sm" variant="ghost" onClick={() => updateAppointmentStatus(a.id, 'completed')} className="text-green-600">
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Realizada
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {orders.length === 0 && <p className="text-center text-muted-foreground py-8">No hay pedidos</p>}
          </TabsContent>

          {/* ===== PROPERTIES TAB ===== */}
          <TabsContent value="properties" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Propiedades ({properties?.length ?? 0})</h3>
              <Button onClick={() => { setEditProp(null); setShowForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Nueva
              </Button>
            </div>
            {showForm && <PropertyForm property={editProp} constructors={constructors} onClose={() => { setShowForm(false); setEditProp(null); }} onSave={() => { setShowForm(false); setEditProp(null); fetchAll(); }} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(properties ?? []).map((p: any) => (
                <Card key={p.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{p.address}</h4>
                        <p className="text-sm text-muted-foreground">{p.constructionCompany} - ARS ${(p.price ?? 0).toLocaleString('es-AR')}</p>
                        <p className="text-sm text-orange-500 font-semibold mt-1">Asesoría: ${(p.consultingPrice ?? 0).toLocaleString('es-AR')}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditProp(p); setShowForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteProperty(p.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ===== CONSTRUCTORS TAB ===== */}
          <TabsContent value="constructors" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Building2 className="w-5 h-5 text-orange-500" /> Constructoras ({constructors.length})</h3>
              <Button onClick={() => { setEditConstructor(null); setShowConstructorForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Nueva Constructora
              </Button>
            </div>
            {showConstructorForm && (
              <ConstructorForm
                constructor={editConstructor}
                onClose={() => { setShowConstructorForm(false); setEditConstructor(null); }}
                onSave={() => { setShowConstructorForm(false); setEditConstructor(null); fetchAll(); }}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {constructors.map((c: any) => (
                <Card key={c.id} className="border-0 shadow-md overflow-hidden">
                  {c.coverCloudPath && (
                    <div className="relative aspect-[16/9] bg-muted">
                      <Image src={c.coverCloudPath.startsWith('http') ? c.coverCloudPath : c.coverCloudPath.startsWith('/') ? c.coverCloudPath : `${S3_BASE}${c.coverCloudPath}`} alt={c.name} fill className="object-cover" />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {c.logoCloudPath && (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border bg-white flex-shrink-0">
                            <Image src={c.logoCloudPath.startsWith('http') ? c.logoCloudPath : c.logoCloudPath.startsWith('/') ? c.logoCloudPath : `${S3_BASE}${c.logoCloudPath}`} alt={c.name} fill className="object-contain p-0.5" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold">{c.name}</h4>
                          <p className="text-xs text-muted-foreground">{c.yearsExperience} años • {c.properties?.length ?? 0} modelos</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditConstructor(c); setShowConstructorForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteConstructor(c.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{c.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(c.styles ?? []).map((s: string) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {constructors.length === 0 && <p className="text-center text-muted-foreground py-8">No hay constructoras registradas</p>}
          </TabsContent>

          {/* ===== BLOG / ENTREGAS TAB ===== */}
          <TabsContent value="blog" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2"><BookOpen className="w-5 h-5 text-orange-500" /> Entregas y Novedades ({blogPosts.length})</h3>
              <Button onClick={() => { setEditBlog(null); setShowBlogForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Nuevo Artículo
              </Button>
            </div>
            {showBlogForm && (
              <BlogForm
                post={editBlog}
                constructors={constructors}
                onClose={() => { setShowBlogForm(false); setEditBlog(null); }}
                onSave={() => { setShowBlogForm(false); setEditBlog(null); fetchAll(); }}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blogPosts.map((post: any) => (
                <Card key={post.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{post.category}</Badge>
                          {post.published ? <Badge className="bg-green-100 text-green-700">Publicado</Badge> : <Badge variant="outline">Borrador</Badge>}
                        </div>
                        <h4 className="font-semibold">{post.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-1">{post.excerpt}</p>
                        {post.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {post.location}</p>}
                        {post.constructorRef && <p className="text-xs text-orange-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" /> {post.constructorRef.name}</p>}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Eye className="w-3 h-3" /> {post.viewCount ?? 0} vistas • {new Date(post.createdAt).toLocaleDateString('es-AR')}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditBlog(post); setShowBlogForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteBlogPost(post.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {blogPosts.length === 0 && <p className="text-center text-muted-foreground py-8">No hay artículos publicados</p>}
          </TabsContent>

          {/* ===== SIMULATOR TAB ===== */}
          <TabsContent value="simulator" className="space-y-6">
            {/* --- Combinaciones --- */}
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Palette className="w-5 h-5 text-orange-500" /> Combinaciones ({simCombos.length})</h3>
              <Button onClick={() => { setEditSim(null); setShowSimForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Nueva Combinación
              </Button>
            </div>
            {showSimForm && (
              <SimulatorForm
                combo={editSim}
                properties={properties}
                onClose={() => { setShowSimForm(false); setEditSim(null); }}
                onSave={() => { setShowSimForm(false); setEditSim(null); fetchAll(); }}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {simCombos.map((combo: any) => (
                <Card key={combo.id} className="border-0 shadow-sm overflow-hidden">
                  <div className="relative aspect-[4/3] bg-muted">
                    <Image
                      src={combo.imageCloudPath.startsWith('http') ? combo.imageCloudPath : combo.imageCloudPath.startsWith('/') ? combo.imageCloudPath : `${S3_BASE}${combo.imageCloudPath}`}
                      alt={combo.name || 'Combinación'}
                      fill
                      className="object-cover"
                    />
                    {combo.isRecommended && <Badge className="absolute top-2 left-2 bg-orange-500 text-white border-0"><Star className="w-3 h-3 mr-1" /> Recomendado</Badge>}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{combo.name || 'Sin nombre'}</h4>
                        <p className="text-xs text-muted-foreground">{combo.property?.address} • {combo.viewType ?? 'exterior'} • {combo.revestimientoCategory ?? 'paredes'}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {combo.colorPrimary && <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: combo.colorPrimary }} />}
                          {combo.colorSecondary && <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: combo.colorSecondary }} />}
                          {combo.revestimiento && <Badge variant="outline" className="text-xs">{combo.revestimiento}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditSim(combo); setShowSimForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteSimCombo(combo.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {simCombos.length === 0 && <p className="text-center text-muted-foreground py-8">No hay combinaciones del simulador</p>}

            {/* --- Colores del Simulador --- */}
            <SimColorsSection colors={simColors} properties={properties} onRefresh={fetchAll} onDelete={deleteSimColor} />

            {/* --- Revestimientos del Simulador --- */}
            <SimRevsSection revs={simRevs} properties={properties} onRefresh={fetchAll} onDelete={deleteSimRev} />
          </TabsContent>

          {/* ===== STATS POPUPS TAB ===== */}
          <TabsContent value="stats-popups" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5 text-orange-500" /> Popups de Estadísticas ({statsPopups.length})</h3>
              <Button onClick={() => { setEditStatPopup(null); setShowStatsForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Nuevo Popup
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Estos popups aparecen al hacer clic en las estadísticas de la barra naranja del Home y la sección Entregas.</p>
            {showStatsForm && (
              <StatsPopupForm
                popup={editStatPopup}
                onClose={() => { setShowStatsForm(false); setEditStatPopup(null); }}
                onSave={() => { setShowStatsForm(false); setEditStatPopup(null); fetchAll(); }}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {statsPopups.map((popup: any) => (
                <Card key={popup.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{popup.section}</Badge>
                          <Badge variant="outline">{popup.statKey}</Badge>
                        </div>
                        <h4 className="font-semibold">{popup.title || '(Sin título)'}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2">{popup.content || '(Sin contenido)'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Valor: <strong>{popup.value}</strong> — Label: {popup.label}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditStatPopup(popup); setShowStatsForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteStatsPopup(popup.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {statsPopups.length === 0 && <p className="text-center text-muted-foreground py-8">No hay popups configurados. Creá uno para personalizar las ventanas emergentes de las estadísticas.</p>}
          </TabsContent>

          {/* ===== FINANCING PLANS TAB ===== */}
          <TabsContent value="financing" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Banknote className="w-5 h-5 text-orange-500" /> Planes de Financiación ({financingPlans.length})</h3>
              <Button onClick={() => { setEditFinancing(null); setShowFinancingForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white"><Plus className="w-4 h-4 mr-1" /> Nuevo Plan</Button>
            </div>
            <p className="text-sm text-muted-foreground">Configurá los planes de financiación que se muestran a los usuarios al consultar cuotas en una propiedad.</p>
            {showFinancingForm && (
              <FinancingPlanForm
                plan={editFinancing}
                onClose={() => { setShowFinancingForm(false); setEditFinancing(null); }}
                onSave={() => { setShowFinancingForm(false); setEditFinancing(null); fetchAll(); }}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {financingPlans.map((fp: any) => (
                <Card key={fp.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{fp.name}</h4>
                        <p className="text-sm text-muted-foreground">{fp.installments} cuotas • Anticipo {fp.downPaymentPct}%</p>
                        {fp.monthlyAmount && <p className="text-sm text-orange-600 font-medium">Cuota: ${fp.monthlyAmount.toLocaleString('es-AR')}</p>}
                        {fp.interestRate != null && <p className="text-xs text-muted-foreground">Tasa: {fp.interestRate}%</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditFinancing(fp); setShowFinancingForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteFinancingPlan(fp.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {financingPlans.length === 0 && <p className="text-center text-muted-foreground py-8">No hay planes de financiación. Creá uno para que aparezca en la consulta de cuotas de las propiedades.</p>}
          </TabsContent>

          {/* ===== ENERGY CONFIG TAB ===== */}
          {isAdmin && (
            <TabsContent value="energy" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">⚡ Simulador Energético ({energyConfigs.length} tamaños)</h3>
                <Button onClick={() => { setEditEnergy(null); setShowEnergyForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                  <Plus className="w-4 h-4 mr-1" /> Nuevo Tamaño
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Configurá los valores de costo energético que se muestran en el panel de "Mi Cuenta" para cada tamaño de vivienda.</p>
              {showEnergyForm && (
                <EnergyConfigForm
                  config={editEnergy}
                  onClose={() => { setShowEnergyForm(false); setEditEnergy(null); }}
                  onSave={() => { setShowEnergyForm(false); setEditEnergy(null); fetchAll(); }}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {energyConfigs.map((ec: any) => (
                  <Card key={ec.id} className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">{ec.label || `${ec.sizeM2} m²`}</h4>
                          <p className="text-sm text-muted-foreground">Tradicional: $ {ec.tradCost?.toLocaleString('es-AR')}/mes</p>
                          <p className="text-sm text-muted-foreground">En seco: $ {ec.secoCost?.toLocaleString('es-AR')}/mes</p>
                          <p className="text-xs text-green-500 mt-1">Ahorro: $ {(ec.tradCost - ec.secoCost)?.toLocaleString('es-AR')}/mes</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditEnergy(ec); setShowEnergyForm(true); }}><Edit className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteEnergyConfig(ec.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {/* ===== ADVISORS TAB ===== */}
          {isAdmin && (
            <TabsContent value="advisors" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Asesores ({advisors.length})</h3>
                <Button onClick={() => setShowAdvisorForm(!showAdvisorForm)} className="bg-orange-500 hover:bg-orange-600 text-white">
                  <UserPlus className="w-4 h-4 mr-1" /> Nuevo Asesor
                </Button>
              </div>
              {showAdvisorForm && (
                <Card className="border-0 shadow-md"><CardContent className="p-6">
                  <h4 className="font-semibold mb-4">Crear Asesor</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Nombre" value={advisorForm.name} onChange={(e: any) => setAdvisorForm({ ...advisorForm, name: e.target.value })} />
                    <Input placeholder="Email" value={advisorForm.email} onChange={(e: any) => setAdvisorForm({ ...advisorForm, email: e.target.value })} />
                    <Input placeholder="Contraseña" type="password" value={advisorForm.password} onChange={(e: any) => setAdvisorForm({ ...advisorForm, password: e.target.value })} />
                    <Input placeholder="Teléfono" value={advisorForm.phone} onChange={(e: any) => setAdvisorForm({ ...advisorForm, phone: e.target.value })} />
                  </div>
                  <div className="flex gap-2 mt-4 justify-end">
                    <Button variant="outline" onClick={() => setShowAdvisorForm(false)}>Cancelar</Button>
                    <Button onClick={createAdvisor} className="bg-orange-500 hover:bg-orange-600 text-white">Crear</Button>
                  </div>
                </CardContent></Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {advisors.map((a: any) => {
                  const profile = advisorProfiles.find((p: any) => p.userId === a.id);
                  return (
                    <Card key={a.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold">{a.name}</h4>
                            <p className="text-sm text-muted-foreground">{a.email} {a.phone ? `• ${a.phone}` : ''}</p>
                            {profile?.specialty && <p className="text-xs text-orange-500 mt-1">{profile.specialty}</p>}
                            <div className="flex gap-2 mt-2">
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{a.assignedAppointments?.filter((ap: any) => ap.status === 'completed').length ?? 0} realizadas</Badge>
                              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{a.assignedAppointments?.filter((ap: any) => ap.status === 'confirmed').length ?? 0} pendientes</Badge>
                              {profile?.active && <Badge className="bg-orange-100 text-orange-700">Perfil activo</Badge>}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditProfile(profile ? { ...profile, advisorId: a.id, advisorName: a.name } : { userId: a.id, advisorName: a.name, bio: '', specialty: '', profileImageCloudPath: '', cvCloudPath: '', yearsExperience: 0, active: true });
                            setShowProfileForm(true);
                          }}><Edit className="w-4 h-4" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {advisors.length === 0 && <p className="text-center text-muted-foreground py-8">No hay asesores creados</p>}
              {showProfileForm && editProfile && (
                <AdvisorProfileForm
                  profile={editProfile}
                  onClose={() => { setShowProfileForm(false); setEditProfile(null); }}
                  onSave={() => { setShowProfileForm(false); setEditProfile(null); fetchAll(); }}
                />
              )}
            </TabsContent>
          )}

          {/* ===== USUARIOS TAB ===== */}
          {isAdmin && (
            <TabsContent value="usuarios" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-orange-500" /> Gestión de Usuarios
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Administrá los roles de todos los usuarios del sistema. Los cambios tienen efecto en el próximo inicio de sesión.
                  </p>
                </div>
                <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border">
                  Total: <strong>{allUsers.length}</strong> usuarios
                </div>
              </div>

              {/* Role legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { role: 'admin', label: 'Administrador', color: 'bg-red-100 text-red-700 border-red-200' },
                  { role: 'advisor', label: 'Asesor', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                  { role: 'user', label: 'Cliente', color: 'bg-green-100 text-green-700 border-green-200' },
                  { role: 'client', label: 'Cliente (v2)', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                ].map(r => (
                  <span key={r.role} className={`px-2 py-1 rounded-full border font-medium ${r.color}`}>
                    {r.label}
                  </span>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>

              {/* Users table */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuario</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rol</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Registrado</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {allUsers
                        .filter(u => {
                          if (!userSearch) return true;
                          const q = userSearch.toLowerCase();
                          return (u.name?.toLowerCase() ?? '').includes(q) || (u.email?.toLowerCase() ?? '').includes(q);
                        })
                        .map((u: any) => {
                          const roleColors: Record<string, string> = {
                            admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            advisor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                            user: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                            client: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                          };
                          const roleLabels: Record<string, string> = {
                            admin: 'Admin', advisor: 'Asesor', user: 'Cliente', client: 'Cliente',
                          };
                          const currentSessionUserId = (session?.user as any)?.id;
                          const isSelf = u.id === currentSessionUserId;

                          return (
                            <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                    {(u.name ?? u.email ?? '?')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground leading-none">{u.name || 'Sin nombre'}</p>
                                    <p className="text-xs text-muted-foreground sm:hidden mt-0.5">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                              <td className="px-4 py-3">
                                {isSelf ? (
                                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${roleColors[u.role] ?? 'bg-muted text-muted-foreground'}`}>
                                    {roleLabels[u.role] ?? u.role} (vos)
                                  </span>
                                ) : (
                                  <select
                                    value={u.role}
                                    onChange={e => changeUserRole(u.id, e.target.value)}
                                    className={`text-xs font-bold border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500/30 ${roleColors[u.role] ?? ''}`}
                                  >
                                    <option value="user">Cliente</option>
                                    <option value="advisor">Asesor</option>
                                    <option value="admin">Administrador</option>
                                  </select>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                                {new Date(u.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!isSelf && (
                                  <button
                                    onClick={() => deleteUser(u.id, u.name ?? u.email)}
                                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                                  >
                                    Eliminar
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {allUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No hay usuarios en el sistema.</p>
                  )}
                </div>
              </Card>
            </TabsContent>
          )}

          {/* ===== FUNNEL TAB ===== */}

          {isAdmin && (
            <TabsContent value="funnel" className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-orange-500" /> Funnel de Conversión</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  { label: 'Usuarios Registrados', value: funnel.totalUsers ?? 0, color: 'bg-blue-500' },
                  { label: 'Items en Carrito', value: funnel.cartItems ?? 0, color: 'bg-yellow-500' },
                  { label: 'Pedidos Totales', value: funnel.totalOrders ?? 0, color: 'bg-purple-500' },
                  { label: 'Pagos Aprobados', value: funnel.approvedOrders ?? 0, color: 'bg-green-500' },
                  { label: 'Citas Realizadas', value: funnel.completedAppointments ?? 0, color: 'bg-orange-500' },
                ].map((step, i) => (
                  <div key={i} className="text-center">
                    <div className={`${step.color} text-white rounded-lg p-4`}>
                      <div className="text-3xl font-bold">{step.value}</div>
                      <div className="text-sm text-white/80 mt-1">{step.label}</div>
                    </div>
                    {i < 4 && <ArrowRight className="w-5 h-5 mx-auto mt-2 text-muted-foreground hidden md:block" />}
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </main>
  );
}

/* ===== CONSTRUCTOR FORM ===== */
function ConstructorForm({ constructor: c, onClose, onSave }: { constructor: any; onClose: () => void; onSave: () => void }) {
  const isEdit = !!c;
  const [form, setForm] = useState({
    name: c?.name ?? '',
    description: c?.description ?? '',
    styles: (c?.styles ?? []).join(', '),
    customModels: c?.customModels ?? false,
    yearsExperience: c?.yearsExperience ?? 0,
    guarantee: c?.guarantee ?? '',
    counseling: c?.counseling ?? '',
    logoCloudPath: c?.logoCloudPath ?? '',
    coverCloudPath: c?.coverCloudPath ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File, type: 'logo' | 'cover') => {
    const setter = type === 'logo' ? setUploadingLogo : setUploadingCover;
    setter(true);
    try {
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      });
      if (!presignedRes.ok) { toast.error('Error al generar URL de subida'); setter(false); return; }
      const { uploadUrl, cloudStoragePath } = await presignedRes.json();
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (signedHeaders.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      if (!uploadRes.ok) { toast.error('Error al subir archivo'); setter(false); return; }
      const publicUrl = `${S3_BASE}${cloudStoragePath}`;
      setForm(prev => ({ ...prev, [type === 'logo' ? 'logoCloudPath' : 'coverCloudPath']: publicUrl }));
      toast.success(`${type === 'logo' ? 'Logo' : 'Portada'} subido correctamente`);
    } catch (e) { toast.error('Error de conexión'); }
    setter(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        styles: form.styles.split(',').map((s: string) => s.trim()).filter(Boolean),
        yearsExperience: Number(form.yearsExperience),
      };
      const url = isEdit ? `/api/constructors/${c.id}` : '/api/constructors';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { toast.success(isEdit ? 'Constructora actualizada' : 'Constructora creada'); onSave(); }
      else { const err = await res.json(); toast.error(err?.error ?? 'Error'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isEdit ? 'Editar Constructora' : 'Nueva Constructora'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la constructora" />
          </div>
          <div className="md:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Estilos (separados por coma)</Label>
            <Input value={form.styles} onChange={(e: any) => setForm({ ...form, styles: e.target.value })} placeholder="Moderna, Clásica, Minimalista" />
          </div>
          <div>
            <Label>Años de experiencia</Label>
            <Input type="number" value={form.yearsExperience} onChange={(e: any) => setForm({ ...form, yearsExperience: e.target.value })} />
          </div>
          <div>
            <Label>Garantía</Label>
            <Input value={form.guarantee} onChange={(e: any) => setForm({ ...form, guarantee: e.target.value })} placeholder="10 años de garantía" />
          </div>
          <div>
            <Label>Asesoramiento</Label>
            <Input value={form.counseling} onChange={(e: any) => setForm({ ...form, counseling: e.target.value })} placeholder="Asesoramiento gratuito" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.customModels} onChange={(e) => setForm({ ...form, customModels: e.target.checked })} className="rounded" />
            <Label className="mb-0">Acepta modelos personalizados</Label>
          </div>
          <div />
          {/* Logo upload */}
          <div>
            <Label>Logo</Label>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'logo'); }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Logo
              </Button>
              {form.logoCloudPath && <span className="text-xs text-green-600">✓ Subido</span>}
            </div>
          </div>
          {/* Cover upload */}
          <div>
            <Label>Portada</Label>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'cover'); }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={uploadingCover}>
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Portada
              </Button>
              {form.coverCloudPath && <span className="text-xs text-green-600">✓ Subido</span>}
            </div>
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ===== BLOG FORM ===== */
function BlogForm({ post, onClose, onSave, constructors = [] }: { post: any; onClose: () => void; onSave: () => void; constructors?: any[] }) {
  const isEdit = !!post;
  const [form, setForm] = useState({
    title: post?.title ?? '',
    excerpt: post?.excerpt ?? '',
    content: post?.content ?? '',
    category: post?.category ?? 'Entrega',
    location: post?.location ?? '',
    coverImage: post?.coverImage ?? '',
    published: post?.published ?? true,
    constructorId: post?.constructorId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      });
      if (!presignedRes.ok) { toast.error('Error'); setUploadingCover(false); return; }
      const { uploadUrl, cloudStoragePath } = await presignedRes.json();
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (signedHeaders.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      const publicUrl = `${S3_BASE}${cloudStoragePath}`;
      setForm(prev => ({ ...prev, coverImage: publicUrl }));
      toast.success('Imagen subida');
    } catch { toast.error('Error'); }
    setUploadingCover(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { toast.error('El título es requerido'); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/blog/${post.id}` : '/api/admin/blog';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = { ...form, constructorId: form.constructorId || null };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { toast.success(isEdit ? 'Artículo actualizado' : 'Artículo publicado'); onSave(); }
      else toast.error('Error');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isEdit ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Título del artículo" />
          </div>
          <div>
            <Label>Categoría</Label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={form.location} onChange={(e: any) => setForm({ ...form, location: e.target.value })} placeholder="Buenos Aires, Argentina" />
          </div>
          <div>
            <Label>Constructora (opcional)</Label>
            <select value={form.constructorId} onChange={e => setForm({ ...form, constructorId: e.target.value || '' })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Sin constructora</option>
              {constructors.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Extracto</Label>
            <Input value={form.excerpt} onChange={(e: any) => setForm({ ...form, excerpt: e.target.value })} placeholder="Breve descripción" />
          </div>
          <div className="md:col-span-2">
            <Label>Contenido</Label>
            <Textarea value={form.content} onChange={(e: any) => setForm({ ...form, content: e.target.value })} rows={5} />
          </div>
          <div>
            <Label>Imagen de portada</Label>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={uploadingCover}>
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Subir imagen
              </Button>
              {form.coverImage && <span className="text-xs text-green-600">✓ Imagen cargada</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="rounded" />
            <Label className="mb-0">Publicar inmediatamente</Label>
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ===== SIMULATOR FORM ===== */
function SimulatorForm({ combo, properties, onClose, onSave }: { combo: any; properties: any[]; onClose: () => void; onSave: () => void }) {
  const isEdit = !!combo;
  const [form, setForm] = useState({
    propertyId: combo?.propertyId ?? (properties[0]?.id ?? ''),
    name: combo?.name ?? '',
    style: combo?.style ?? '',
    imageCloudPath: combo?.imageCloudPath ?? '',
    colorPrimary: combo?.colorPrimary ?? '#ffffff',
    colorSecondary: combo?.colorSecondary ?? '#ffffff',
    revestimiento: combo?.revestimiento ?? '',
    viewType: combo?.viewType ?? 'exterior',
    revestimientoCategory: combo?.revestimientoCategory ?? 'paredes',
    isRecommended: combo?.isRecommended ?? false,
    sortOrder: combo?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      });
      if (!presignedRes.ok) { toast.error('Error'); setUploading(false); return; }
      const { uploadUrl, cloudStoragePath } = await presignedRes.json();
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (signedHeaders.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      setForm(prev => ({ ...prev, imageCloudPath: cloudStoragePath }));
      toast.success('Imagen subida');
    } catch { toast.error('Error'); }
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyId) { toast.error('Seleccioná una propiedad'); return; }
    if (!form.imageCloudPath) { toast.error('Subí una imagen'); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/simulator/${combo.id}` : '/api/simulator';
      const method = isEdit ? 'PUT' : 'POST';
      const data = { ...form, sortOrder: Number(form.sortOrder) };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { toast.success(isEdit ? 'Combinación actualizada' : 'Combinación creada'); onSave(); }
      else toast.error('Error');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isEdit ? 'Editar Combinación' : 'Nueva Combinación'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Propiedad *</Label>
            <select value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          </div>
          <div>
            <Label>Nombre de la combinación</Label>
            <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Clásico Cálido" />
          </div>
          <div>
            <Label>Estilo</Label>
            <Input value={form.style} onChange={(e: any) => setForm({ ...form, style: e.target.value })} placeholder="Moderno, Rústico, etc" />
          </div>
          <div>
            <Label>Revestimiento</Label>
            <Input value={form.revestimiento} onChange={(e: any) => setForm({ ...form, revestimiento: e.target.value })} placeholder="Piedra, Madera, etc" />
          </div>
          <div>
            <Label>Vista</Label>
            <select value={form.viewType} onChange={e => setForm({ ...form, viewType: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="exterior">Exterior</option>
              <option value="interior">Interior</option>
            </select>
          </div>
          <div>
            <Label>Categoría Revestimiento</Label>
            <select value={form.revestimientoCategory} onChange={e => setForm({ ...form, revestimientoCategory: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="paredes">Paredes</option>
              <option value="zocalo">Zócalo</option>
              <option value="detalles">Detalles</option>
            </select>
          </div>
          <div>
            <Label>Color primario</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.colorPrimary} onChange={e => setForm({ ...form, colorPrimary: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
              <Input value={form.colorPrimary} onChange={(e: any) => setForm({ ...form, colorPrimary: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Color secundario</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.colorSecondary} onChange={e => setForm({ ...form, colorSecondary: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
              <Input value={form.colorSecondary} onChange={(e: any) => setForm({ ...form, colorSecondary: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Imagen de la combinación *</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Subir imagen
              </Button>
              {form.imageCloudPath && <span className="text-xs text-green-600">✓ Imagen cargada</span>}
            </div>
          </div>
          <div>
            <Label>Orden</Label>
            <Input type="number" value={form.sortOrder} onChange={(e: any) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.isRecommended} onChange={e => setForm({ ...form, isRecommended: e.target.checked })} className="rounded" />
            <Label className="mb-0">Marcar como recomendado</Label>
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ===== STATS POPUP FORM ===== */
function StatsPopupForm({ popup, onClose, onSave }: { popup: any; onClose: () => void; onSave: () => void }) {
  const isEdit = !!popup;
  const HOME_KEYS = [
    { key: 'clientes_asesorados', label: 'Clientes asesorados' },
    { key: 'viviendas_vendidas', label: 'Viviendas vendidas' },
    { key: 'calificacion_promedio', label: 'Calificación promedio' },
    { key: 'anos_experiencia', label: 'Años de experiencia' },
  ];
  const ENTREGAS_KEYS = [
    { key: 'entregas_realizadas', label: 'Entregas realizadas' },
    { key: 'clientes_satisfechos', label: 'Clientes satisfechos' },
    { key: 'tiempo_promedio', label: 'Tiempo promedio' },
    { key: 'cobertura_geografica', label: 'Cobertura geográfica' },
  ];
  const [form, setForm] = useState({
    section: popup?.section ?? 'home',
    statKey: popup?.statKey ?? HOME_KEYS[0].key,
    title: popup?.title ?? '',
    content: popup?.content ?? '',
    value: popup?.value ?? '',
    label: popup?.label ?? '',
    active: popup?.active ?? true,
    sortOrder: popup?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const availableKeys = form.section === 'home' ? HOME_KEYS : ENTREGAS_KEYS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.statKey) { toast.error('Seleccioná una estadística'); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/stats-popups/${popup.id}` : '/api/stats-popups';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { toast.success(isEdit ? 'Popup actualizado' : 'Popup creado'); onSave(); }
      else { const err = await res.json(); toast.error(err?.error ?? 'Error'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isEdit ? 'Editar Popup' : 'Nuevo Popup'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Sección</Label>
            <select
              value={form.section}
              onChange={e => {
                const s = e.target.value;
                const keys = s === 'home' ? HOME_KEYS : ENTREGAS_KEYS;
                setForm({ ...form, section: s, statKey: keys[0].key });
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isEdit}
            >
              <option value="home">Home</option>
              <option value="entregas">Entregas</option>
            </select>
          </div>
          <div>
            <Label>Estadística</Label>
            <select
              value={form.statKey}
              onChange={e => setForm({ ...form, statKey: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isEdit}
            >
              {availableKeys.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Valor mostrado (ej: +500, 4.9/5)</Label>
            <Input value={form.value} onChange={(e: any) => setForm({ ...form, value: e.target.value })} placeholder="+500" />
          </div>
          <div>
            <Label>Etiqueta mostrada</Label>
            <Input value={form.label} onChange={(e: any) => setForm({ ...form, label: e.target.value })} placeholder="Clientes asesorados" />
          </div>
          <div className="md:col-span-2">
            <Label>Título del Popup</Label>
            <Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Más de 500 clientes nos eligen" />
          </div>
          <div className="md:col-span-2">
            <Label>Contenido del Popup</Label>
            <Textarea value={form.content} onChange={(e: any) => setForm({ ...form, content: e.target.value })} rows={4} placeholder="Texto detallado que aparece al hacer clic en la estadística..." />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ===== ENERGY CONFIG FORM =====
function EnergyConfigForm({ config, onClose, onSave }: { config: any; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    sizeM2: config?.sizeM2 ?? '',
    label: config?.label ?? '',
    tradCost: config?.tradCost ?? '',
    secoCost: config?.secoCost ?? '',
    sortOrder: config?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sizeM2 || !form.tradCost || !form.secoCost) { toast.error('Completá todos los campos'); return; }
    setSaving(true);
    try {
      const url = config?.id ? `/api/energy-config/${config.id}` : '/api/energy-config';
      const method = config?.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sizeM2: Number(form.sizeM2), tradCost: Number(form.tradCost), secoCost: Number(form.secoCost), sortOrder: Number(form.sortOrder) }),
      });
      if (res.ok) { toast.success('Configuración guardada'); onSave(); }
      else toast.error('Error al guardar');
    } catch { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md"><CardContent className="p-6">
      <h4 className="font-semibold mb-4">{config?.id ? 'Editar' : 'Nueva'} Configuración Energética</h4>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>Tamaño (m²)</Label><Input type="number" value={form.sizeM2} onChange={(e: any) => setForm({ ...form, sizeM2: e.target.value })} placeholder="70" /></div>
        <div><Label>Etiqueta</Label><Input value={form.label} onChange={(e: any) => setForm({ ...form, label: e.target.value })} placeholder="Vivienda 70 m²" /></div>
        <div><Label>Costo Tradicional ($/mes)</Label><Input type="number" value={form.tradCost} onChange={(e: any) => setForm({ ...form, tradCost: e.target.value })} placeholder="28450" /></div>
        <div><Label>Costo En Seco ($/mes)</Label><Input type="number" value={form.secoCost} onChange={(e: any) => setForm({ ...form, secoCost: e.target.value })} placeholder="14120" /></div>
        <div className="md:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">{saving ? 'Guardando...' : 'Guardar'}</Button>
        </div>
      </form>
    </CardContent></Card>
  );
}

// ===== ADVISOR PROFILE FORM =====
function AdvisorProfileForm({ profile, onClose, onSave }: { profile: any; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    bio: profile?.bio ?? '',
    specialty: profile?.specialty ?? '',
    profileImageCloudPath: profile?.profileImageCloudPath ?? '',
    cvCloudPath: profile?.cvCloudPath ?? '',
    yearsExperience: profile?.yearsExperience ?? 0,
    active: profile?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingCV, setUploadingCV] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const cvRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File, type: 'image' | 'cv') => {
    const setUploading = type === 'image' ? setUploadingImg : setUploadingCV;
    setUploading(true);
    try {
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      });
      if (!presignedRes.ok) { toast.error('Error al obtener URL de subida'); setUploading(false); return; }
      const { uploadUrl, cloudStoragePath } = await presignedRes.json();
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (signedHeaders.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      if (type === 'image') {
        setForm(prev => ({ ...prev, profileImageCloudPath: cloudStoragePath }));
        toast.success('Imagen de perfil subida');
      } else {
        setForm(prev => ({ ...prev, cvCloudPath: cloudStoragePath }));
        toast.success('CV subido');
      }
    } catch { toast.error('Error al subir archivo'); }
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/advisor-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.userId, ...form, yearsExperience: Number(form.yearsExperience) }),
      });
      if (res.ok) { toast.success('Perfil guardado'); onSave(); }
      else toast.error('Error al guardar');
    } catch { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };

  const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
  const getUrl = (p: string) => p ? (p.startsWith('http') ? p : p.startsWith('/') ? p : `${S3_BASE}${p}`) : '';

  return (
    <Card className="border-0 shadow-md"><CardContent className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-lg">Perfil de {profile.advisorName || 'Asesor'}</h4>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Biografía</Label>
          <Textarea value={form.bio} onChange={(e: any) => setForm({ ...form, bio: e.target.value })} rows={3} placeholder="Descripción profesional del asesor..." />
        </div>
        <div>
          <Label>Especialidad</Label>
          <Input value={form.specialty} onChange={(e: any) => setForm({ ...form, specialty: e.target.value })} placeholder="Viviendas prefabricadas, Inversiones, etc." />
        </div>
        <div>
          <Label>Años de experiencia</Label>
          <Input type="number" value={form.yearsExperience} onChange={(e: any) => setForm({ ...form, yearsExperience: e.target.value })} />
        </div>
        <div>
          <Label>Imagen de Perfil</Label>
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'image'); }} />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => imgRef.current?.click()} disabled={uploadingImg}>
              {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Subir imagen
            </Button>
            {form.profileImageCloudPath && (
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10 rounded-full overflow-hidden border">
                  <Image src={getUrl(form.profileImageCloudPath)} alt="Perfil" fill className="object-cover" />
                </div>
                <span className="text-xs text-green-600">✓ Imagen cargada</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label>Curriculum Vitae (PDF)</Label>
          <input ref={cvRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'cv'); }} />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => cvRef.current?.click()} disabled={uploadingCV}>
              {uploadingCV ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Subir CV
            </Button>
            {form.cvCloudPath && <span className="text-xs text-green-600">✓ CV cargado</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
          <Label className="mb-0">Perfil activo (visible en Asesoría)</Label>
        </div>
        <div className="md:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar Perfil'}
          </Button>
        </div>
      </form>
    </CardContent></Card>
  );
}

/* ===== SIM COLORS SECTION ===== */
function SimColorsSection({ colors, properties, onRefresh, onDelete }: { colors: any[]; properties: any[]; onRefresh: () => void; onDelete: (id: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ propertyId: '', type: 'primary', name: '', hexCode: '#ffffff', sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditItem(null); setForm({ propertyId: properties[0]?.id ?? '', type: 'primary', name: '', hexCode: '#ffffff', sortOrder: 0 }); setShowForm(true); };
  const openEdit = (c: any) => { setEditItem(c); setForm({ propertyId: c.propertyId, type: c.type, name: c.name, hexCode: c.hexCode, sortOrder: c.sortOrder ?? 0 }); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editItem ? `/api/simulator/colors/${editItem.id}` : '/api/simulator/colors';
      const method = editItem ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }) });
      if (res.ok) { toast.success(editItem ? 'Color actualizado' : 'Color creado'); setShowForm(false); onRefresh(); }
      else toast.error('Error al guardar');
    } catch { toast.error('Error'); }
    setSaving(false);
  };

  return (
    <div className="border-t pt-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">🎨 Colores del Simulador ({colors.length})</h3>
        <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600 text-white" size="sm"><Plus className="w-4 h-4 mr-1" /> Nuevo Color</Button>
      </div>
      {showForm && (
        <Card className="border-0 shadow-md mb-4">
          <CardContent className="p-4">
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">Propiedad</Label>
                <select value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                  <option value="primary">Primario</option>
                  <option value="secondary">Secundario</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Blanco hueso" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.hexCode} onChange={e => setForm({ ...form, hexCode: e.target.value })} className="w-9 h-9 rounded border cursor-pointer" />
                  <Input value={form.hexCode} onChange={(e: any) => setForm({ ...form, hexCode: e.target.value })} className="h-9 flex-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Orden</Label>
                <Input type="number" value={form.sortOrder} onChange={(e: any) => setForm({ ...form, sortOrder: e.target.value })} className="h-9" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">{saving ? 'Guardando...' : 'Guardar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {colors.map((c: any) => (
          <Card key={c.id} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 flex-shrink-0" style={{ backgroundColor: c.hexCode }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{c.name || c.hexCode}</p>
                <p className="text-xs text-muted-foreground">{c.type === 'primary' ? 'Primario' : 'Secundario'} • {c.property?.address?.slice(0, 20)}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(c.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {colors.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">No hay colores configurados</p>}
    </div>
  );
}

/* ===== SIM REVESTIMIENTOS SECTION ===== */
function SimRevsSection({ revs, properties, onRefresh, onDelete }: { revs: any[]; properties: any[]; onRefresh: () => void; onDelete: (id: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ propertyId: '', category: 'paredes', name: '', thumbnailCloudPath: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openNew = () => { setEditItem(null); setForm({ propertyId: properties[0]?.id ?? '', category: 'paredes', name: '', thumbnailCloudPath: '', sortOrder: 0 }); setShowForm(true); };
  const openEdit = (r: any) => { setEditItem(r); setForm({ propertyId: r.propertyId, category: r.category, name: r.name, thumbnailCloudPath: r.thumbnailCloudPath ?? '', sortOrder: r.sortOrder ?? 0 }); setShowForm(true); };

  const uploadThumb = async (file: File) => {
    setUploading(true);
    try {
      const presignedRes = await fetch('/api/upload/presigned', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }) });
      if (!presignedRes.ok) { toast.error('Error'); setUploading(false); return; }
      const { uploadUrl, cloudStoragePath } = await presignedRes.json();
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (signedHeaders.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      setForm(prev => ({ ...prev, thumbnailCloudPath: cloudStoragePath }));
      toast.success('Miniatura subida');
    } catch { toast.error('Error'); }
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editItem ? `/api/simulator/revestimientos/${editItem.id}` : '/api/simulator/revestimientos';
      const method = editItem ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }) });
      if (res.ok) { toast.success(editItem ? 'Revestimiento actualizado' : 'Revestimiento creado'); setShowForm(false); onRefresh(); }
      else toast.error('Error al guardar');
    } catch { toast.error('Error'); }
    setSaving(false);
  };

  const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
  const thumbUrl = (path: string) => path ? (path.startsWith('http') ? path : path.startsWith('/') ? path : `${S3_BASE}${path}`) : '';

  return (
    <div className="border-t pt-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">🧱 Revestimientos ({revs.length})</h3>
        <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600 text-white" size="sm"><Plus className="w-4 h-4 mr-1" /> Nuevo Revestimiento</Button>
      </div>
      {showForm && (
        <Card className="border-0 shadow-md mb-4">
          <CardContent className="p-4">
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">Propiedad</Label>
                <select value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                  <option value="paredes">Paredes</option>
                  <option value="zocalo">Zócalo</option>
                  <option value="detalles">Detalles</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Piedra Natural" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Miniatura</Label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadThumb(f); }} />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Subir
                  </Button>
                  {form.thumbnailCloudPath && <span className="text-xs text-green-600">✓</span>}
                </div>
              </div>
              <div>
                <Label className="text-xs">Orden</Label>
                <Input type="number" value={form.sortOrder} onChange={(e: any) => setForm({ ...form, sortOrder: e.target.value })} className="h-9" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">{saving ? 'Guardando...' : 'Guardar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {revs.map((r: any) => (
          <Card key={r.id} className="border-0 shadow-sm overflow-hidden">
            {r.thumbnailCloudPath && (
              <div className="relative aspect-square bg-muted">
                <Image src={thumbUrl(r.thumbnailCloudPath)} alt={r.name} fill className="object-cover" />
              </div>
            )}
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.category === 'paredes' ? 'Paredes' : r.category === 'zocalo' ? 'Zócalo' : 'Detalles'} • {r.property?.address?.slice(0, 20)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Edit className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(r.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {revs.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">No hay revestimientos configurados</p>}
    </div>
  );
}

/* ===== FINANCING PLAN FORM ===== */
function FinancingPlanForm({ plan, onClose, onSave }: { plan: any; onClose: () => void; onSave: () => void }) {
  const isEdit = !!plan;
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    installments: plan?.installments ?? 12,
    downPaymentPct: plan?.downPaymentPct ?? 30,
    monthlyAmount: plan?.monthlyAmount ?? null,
    totalAmount: plan?.totalAmount ?? null,
    interestRate: plan?.interestRate ?? null,
    currency: plan?.currency ?? 'ARS',
    active: plan?.active ?? true,
    sortOrder: plan?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        installments: Number(form.installments),
        downPaymentPct: Number(form.downPaymentPct),
        monthlyAmount: form.monthlyAmount ? Number(form.monthlyAmount) : null,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
        interestRate: form.interestRate ? Number(form.interestRate) : null,
        sortOrder: Number(form.sortOrder),
      };
      const url = isEdit ? `/api/financing-plans/${plan.id}` : '/api/financing-plans';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { toast.success(isEdit ? 'Plan actualizado' : 'Plan creado'); onSave(); }
      else { const err = await res.json(); toast.error(err?.error ?? 'Error'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isEdit ? 'Editar Plan' : 'Nuevo Plan de Financiación'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nombre del Plan *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Plan 12 cuotas" />
          </div>
          <div>
            <Label>Cantidad de Cuotas</Label>
            <Input type="number" value={form.installments} onChange={e => setForm({ ...form, installments: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Anticipo (%)</Label>
            <Input type="number" value={form.downPaymentPct} onChange={e => setForm({ ...form, downPaymentPct: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Monto por Cuota (opcional)</Label>
            <Input type="number" value={form.monthlyAmount ?? ''} onChange={e => setForm({ ...form, monthlyAmount: e.target.value ? Number(e.target.value) : null })} placeholder="Monto mensual" />
          </div>
          <div>
            <Label>Monto Total (opcional)</Label>
            <Input type="number" value={form.totalAmount ?? ''} onChange={e => setForm({ ...form, totalAmount: e.target.value ? Number(e.target.value) : null })} placeholder="Monto total" />
          </div>
          <div>
            <Label>Tasa de Interés % (opcional)</Label>
            <Input type="number" step="0.01" value={form.interestRate ?? ''} onChange={e => setForm({ ...form, interestRate: e.target.value ? Number(e.target.value) : null })} placeholder="Ej: 5.5" />
          </div>
          <div>
            <Label>Moneda</Label>
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <Label>Orden</Label>
            <Input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded" />
            <Label>Activo</Label>
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}