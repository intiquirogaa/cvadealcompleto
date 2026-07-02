'use client';

import React, { useState, useMemo } from 'react';
import { 
  Users, TrendingUp, DollarSign, Calendar, Target, CheckCircle2, 
  AlertTriangle, Sparkles, MapPin, Plus, Check, ChevronLeft, 
  ChevronRight, Info, ExternalLink, RefreshCw, Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

interface CRMClientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locality: string;
  propertiesInterest: string[];
  stage: string;
  nextContactDate: string | null;
  nextContactNote: string | null;
  notes: string;
  assignedAdvisorId: string | null;
  createdAt: string;
  updatedAt: string;
  profession?: string | null;
  company?: string | null;
}

interface CRMDashboardProps {
  clients: CRMClientData[];
  onSelectClient: (client: CRMClientData) => void;
  properties: any[];
}

export function CRMDashboard({ clients, onSelectClient, properties }: CRMDashboardProps) {
  // Filters State
  const [modelFilter, setModelFilter] = useState('Todos');
  const [originFilter, setOriginFilter] = useState('Todos');
  const [provinceFilter, setProvinceFilter] = useState('Todos');
  const [advisorFilter, setAdvisorFilter] = useState('Todos');
  const [stageFilter, setStageFilter] = useState('Todos');
  const [dateRange, setDateRange] = useState('01/06/2026 - 30/06/2026');

  // Province click state for Map Detail card
  const [selectedMapProvince, setSelectedMapProvince] = useState('Buenos Aires');

  // Simulated tasks state for Today's Focus Checklist
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Llamar a Pedro Porro', model: 'Casa Premium 140', time: '09:00', priority: 'high', done: false },
    { id: 2, text: 'Enviar presupuesto a Juan Pérez', model: 'Casa Nórdica 90', time: '12:00', priority: 'high', done: false },
    { id: 3, text: 'Confirmar visita con Roberto Sosa', model: 'Casa Moderna 110', time: '14:00', priority: 'high', done: false },
    { id: 4, text: 'Enviar catálogo a María Gómez', model: 'Casa Moderna 120', time: '08:30', priority: 'other', done: true },
    { id: 5, text: 'Seguimiento WhatsApp - Ana Rodríguez', model: 'Casa Premium 140', time: '10:15', priority: 'other', done: true },
    { id: 6, text: 'Revisar documentación - Carlos López', model: 'Casa Nórdica 90', time: '15:30', priority: 'other', done: false },
    { id: 7, text: 'Actualizar información - Lucía Martínez', model: 'Casa Moderna 110', time: '17:00', priority: 'other', done: false },
  ]);

  // Calendar view mode
  const [calendarView, setCalendarView] = useState<'dia' | 'semana' | 'mes'>('dia');

  // 1. Augment clients with calculated analytics fields deterministically
  const augmentedClients = useMemo(() => {
    return clients.map(client => {
      const charSum = client.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const nameSum = (client.firstName + client.lastName).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

      // Potential budget (value in USD)
      let potValue = 180000; // base value
      const primaryInterest = client.propertiesInterest[0] || '';
      if (primaryInterest.includes('Premium 140')) potValue = 450000;
      else if (primaryInterest.includes('Premium 100')) potValue = 310000;
      else if (primaryInterest.includes('Moderna 120')) potValue = 350000;
      else if (primaryInterest.includes('Moderna 110')) potValue = 290000;
      else if (primaryInterest.includes('Nórdica 90')) potValue = 220000;
      else {
        // Fallback deterministic value
        potValue = 120000 + (charSum * 12345) % 560000;
        // round to nearest 10k
        potValue = Math.round(potValue / 10000) * 10000;
      }

      // Close proximity percentage (0% - 100%)
      let cierreProb = 10;
      if (client.stage === 'closed') cierreProb = 100;
      else if (client.stage === 'negotiation') cierreProb = 75 + (charSum % 20);
      else if (client.stage === 'advisory_done') cierreProb = 55 + (charSum % 15);
      else if (client.stage === 'appointment_scheduled') cierreProb = 40 + (charSum % 15);
      else if (client.stage === 'contacted') cierreProb = 25 + (charSum % 10);
      else cierreProb = 10 + (charSum % 15);

      // Days since last contact
      // Closed and Negotiation leads are contact-fresh usually
      let daysSinceLastContact = 1;
      if (client.stage === 'new_lead') {
        daysSinceLastContact = 5 + (nameSum % 30);
      } else if (client.stage === 'contacted') {
        daysSinceLastContact = 2 + (nameSum % 18);
      } else if (client.stage === 'appointment_scheduled') {
        daysSinceLastContact = 1 + (nameSum % 12);
      } else if (client.stage === 'advisory_done') {
        daysSinceLastContact = 4 + (nameSum % 22);
      } else if (client.stage === 'negotiation') {
        daysSinceLastContact = 1 + (nameSum % 8);
      } else {
        daysSinceLastContact = 1 + (nameSum % 5);
      }

      // Source origin
      const origins = ['Instagram', 'Facebook', 'Web', 'Google Ads', 'Referidos', 'Ferias / Eventos'];
      const origin = origins[charSum % origins.length];

      // Province selection
      let province = 'Buenos Aires';
      const locLower = client.locality.toLowerCase();
      if (locLower.includes('buenos aires') || locLower.includes('caba') || locLower.includes('palermo') || locLower.includes('tigre') || locLower.includes('pilar')) {
        province = 'Buenos Aires';
      } else if (locLower.includes('córdoba') || locLower.includes('cordoba')) {
        province = 'Córdoba';
      } else if (locLower.includes('santa fe') || locLower.includes('rosario')) {
        province = 'Santa Fe';
      } else if (locLower.includes('mendoza')) {
        province = 'Mendoza';
      } else {
        const provinces = ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Salta', 'Neuquén', 'Entre Ríos'];
        province = provinces[charSum % provinces.length];
      }

      // Advisor name mapping
      const advisors = ['Juan Carlos', 'Sofía Pérez', 'Martín Silva', 'Clara Ortiz'];
      const advisor = client.assignedAdvisorId ? advisors[charSum % advisors.length] : 'Sin Asesor';

      return {
        ...client,
        potValue,
        cierreProb,
        daysSinceLastContact,
        origin,
        province,
        advisor
      };
    });
  }, [clients]);

  // Extract unique values for filter lists
  const houseModels = useMemo(() => {
    const list = new Set<string>();
    augmentedClients.forEach(c => c.propertiesInterest.forEach(p => list.add(p)));
    return ['Todos', ...Array.from(list)];
  }, [augmentedClients]);

  const originsList = ['Todos', 'Instagram', 'Facebook', 'Web', 'Google Ads', 'Referidos', 'Ferias / Eventos'];
  const provincesList = ['Todos', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Salta', 'Neuquén', 'Entre Ríos'];
  const advisorsList = ['Todos', 'Juan Carlos', 'Sofía Pérez', 'Martín Silva', 'Clara Ortiz', 'Sin Asesor'];
  const stagesList = [
    { key: 'Todos', label: 'Todos' },
    { key: 'new_lead', label: 'Nuevo Lead' },
    { key: 'contacted', label: 'Contactado' },
    { key: 'appointment_scheduled', label: 'Cita Agendada' },
    { key: 'advisory_done', label: 'Asesoría Realizada' },
    { key: 'negotiation', label: 'En Negociación' },
    { key: 'closed', label: 'Cerrado' },
  ];

  // 2. Apply Filters
  const filteredClients = useMemo(() => {
    return augmentedClients.filter(c => {
      if (modelFilter !== 'Todos' && !c.propertiesInterest.includes(modelFilter)) return false;
      if (originFilter !== 'Todos' && c.origin !== originFilter) return false;
      if (provinceFilter !== 'Todos' && c.province !== provinceFilter) return false;
      if (advisorFilter !== 'Todos' && c.advisor !== advisorFilter) return false;
      if (stageFilter !== 'Todos' && c.stage !== stageFilter) return false;
      return true;
    });
  }, [augmentedClients, modelFilter, originFilter, provinceFilter, advisorFilter, stageFilter]);

  // 3. Compute KPI Statistics
  const totalPotValue = useMemo(() => {
    return filteredClients.reduce((sum, c) => sum + c.potValue, 0);
  }, [filteredClients]);

  const negotiationCount = useMemo(() => {
    return filteredClients.filter(c => c.stage === 'negotiation').length;
  }, [filteredClients]);

  const conversionRate = useMemo(() => {
    if (filteredClients.length === 0) return 0;
    const closedCount = filteredClients.filter(c => c.stage === 'closed').length;
    return Math.round((closedCount / filteredClients.length) * 100);
  }, [filteredClients]);

  const avgTicket = useMemo(() => {
    if (filteredClients.length === 0) return 0;
    return Math.round(totalPotValue / filteredClients.length);
  }, [filteredClients, totalPotValue]);

  const noContactOver21 = useMemo(() => {
    return filteredClients.filter(c => c.daysSinceLastContact > 21).length;
  }, [filteredClients]);

  // Traffic Light Groups
  const trafficLightGroup = useMemo(() => {
    const red: any[] = [];
    const yellow: any[] = [];
    const green: any[] = [];

    filteredClients.forEach(c => {
      if (c.daysSinceLastContact > 21) red.push(c);
      else if (c.daysSinceLastContact >= 10) yellow.push(c);
      else green.push(c);
    });

    return { red, yellow, green };
  }, [filteredClients]);

  // Distribution counts by Province for Argentina map widget
  const provinceStats = useMemo(() => {
    const stats: Record<string, { total: number; potValue: number; stageCounts: Record<string, number> }> = {};
    provincesList.filter(p => p !== 'Todos').forEach(p => {
      stats[p] = { total: 0, potValue: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };
    });

    filteredClients.forEach(c => {
      if (!stats[c.province]) {
        stats[c.province] = { total: 0, potValue: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };
      }
      stats[c.province].total += 1;
      stats[c.province].potValue += c.potValue;
      if (c.stage === 'negotiation') stats[c.province].stageCounts.negotiation += 1;
      if (c.stage === 'new_lead') stats[c.province].stageCounts.new_lead += 1;
      if (c.stage === 'closed') stats[c.province].stageCounts.closed += 1;
    });

    return stats;
  }, [filteredClients]);

  // Details for selected province map card
  const selectedProvinceDetail = useMemo(() => {
    const p = selectedMapProvince;
    const stat = provinceStats[p] || { total: 0, potValue: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };
    
    // Top model in province
    const modelCounts: Record<string, number> = {};
    filteredClients.filter(c => c.province === p).forEach(c => {
      c.propertiesInterest.forEach(m => {
        modelCounts[m] = (modelCounts[m] ?? 0) + 1;
      });
    });
    const sortedModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
    const topModels = sortedModels.slice(0, 3).map(([model, count]) => {
      const percentage = stat.total > 0 ? Math.round((count / stat.total) * 100) : 0;
      return { model, percentage };
    });

    return {
      name: p,
      total: stat.total,
      negotiation: stat.stageCounts.negotiation,
      newLead: stat.stageCounts.new_lead,
      closed: stat.stageCounts.closed,
      potValue: stat.potValue,
      avgTicket: stat.total > 0 ? Math.round(stat.potValue / stat.total) : 0,
      topModels
    };
  }, [selectedMapProvince, provinceStats, filteredClients]);

  // Lead origin chart values
  const originStats = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredClients.forEach(c => {
      counts[c.origin] = (counts[c.origin] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => {
      const percentage = filteredClients.length > 0 ? Math.round((value / filteredClients.length) * 100) : 0;
      return { name, value, percentage };
    }).sort((a, b) => b.value - a.value);
  }, [filteredClients]);

  // Sales funnel conversion values
  const funnelStages = useMemo(() => {
    const stages = [
      { key: 'new_lead', label: 'Nuevo Lead', color: '#3b82f6' },
      { key: 'contacted', label: 'Contactado', color: '#eab308' },
      { key: 'appointment_scheduled', label: 'Cita Agendada', color: '#a855f7' },
      { key: 'negotiation', label: 'En Negociación', color: '#f97316' },
      { key: 'closed', label: 'Cerrado (Ganado)', color: '#10b981' },
    ];
    
    return stages.map(s => {
      const count = filteredClients.filter(c => c.stage === s.key).length;
      const percentage = filteredClients.length > 0 ? Math.round((count / filteredClients.length) * 100) : 0;
      return { ...s, count, percentage };
    });
  }, [filteredClients]);

  // Checkbox action today tasks
  const handleToggleTask = (id: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const taskCompletionStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.done).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [tasks]);

  const resetFilters = () => {
    setModelFilter('Todos');
    setOriginFilter('Todos');
    setProvinceFilter('Todos');
    setAdvisorFilter('Todos');
    setStageFilter('Todos');
  };

  return (
    <div className="space-y-6">
      
      {/* ── SECTION: Filters Bar ── */}
      <div className="bg-card border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Modelo de Casa</span>
            <select
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value)}
              className="bg-muted/50 border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="Todos">Todos</option>
              {houseModels.filter(m => m !== 'Todos').map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Origen</span>
            <select
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value)}
              className="bg-muted/50 border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {originsList.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Provincia</span>
            <select
              value={provinceFilter}
              onChange={e => setProvinceFilter(e.target.value)}
              className="bg-muted/50 border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {provincesList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Asesor</span>
            <select
              value={advisorFilter}
              onChange={e => setAdvisorFilter(e.target.value)}
              className="bg-muted/50 border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {advisorsList.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Estado</span>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="bg-muted/50 border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {stagesList.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Rango de fechas</span>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                readOnly
                value={dateRange}
                className="bg-muted/50 border rounded-xl pl-8 pr-3 py-2 text-xs font-semibold text-foreground w-full focus:outline-none"
              />
            </div>
          </div>

          <div className="flex self-end gap-2 ml-auto">
            {(modelFilter !== 'Todos' || originFilter !== 'Todos' || provinceFilter !== 'Todos' || advisorFilter !== 'Todos' || stageFilter !== 'Todos') && (
              <Button onClick={resetFilters} variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION: KPI Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Leads Totales</span>
              <h3 className="text-2xl font-bold text-foreground">{filteredClients.length}</h3>
              <span className="text-[10px] text-green-500 font-semibold">↑ 12% vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Monto Potencial</span>
              <h3 className="text-xl font-bold text-foreground">USD {totalPotValue.toLocaleString()}</h3>
              <span className="text-[10px] text-green-500 font-semibold">↑ 18% vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">En Negociación</span>
              <h3 className="text-2xl font-bold text-foreground">{negotiationCount}</h3>
              <span className="text-[10px] text-green-500 font-semibold">↑ 22% vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Conversión</span>
              <h3 className="text-2xl font-bold text-foreground">{conversionRate}%</h3>
              <span className="text-[10px] text-green-500 font-semibold">↑ 5% vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Ticket Promedio</span>
              <h3 className="text-lg font-bold text-foreground">USD {avgTicket.toLocaleString()}</h3>
              <span className="text-[10px] text-green-500 font-semibold">↑ 10% vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Sin contacto &gt; 21d</span>
              <h3 className="text-2xl font-bold text-red-500">{noContactOver21}</h3>
              <span className="text-[10px] text-red-500 font-semibold">↓ 8 vs mes pasado</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center animate-pulse">
              <Clock className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── SECTION: Row 1 - Bubble Chart, Traffic Light & Map ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Widget 1: Matrix Bubble Opportunity Chart */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-foreground">Matriz de oportunidades (Matriz Burbuja)</h3>
                <p className="text-[10px] text-muted-foreground">Eje X: Probabilidad cierre | Eje Y: Monto (USD) | Tamaño: Presupuesto</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
            </div>

            {/* Bubble Chart Canvas SVG */}
            <div className="relative border bg-muted/10 rounded-xl p-3 h-[280px]">
              
              {/* Quadrant grid markings */}
              <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
                <div className="flex justify-between text-[9px] font-bold text-muted-foreground/35 uppercase">
                  <span>Estratégicos</span>
                  <span>Prioridad 1</span>
                </div>
                <div className="flex justify-between text-[9px] font-bold text-muted-foreground/35 uppercase">
                  <span>Baja Prioridad</span>
                  <span>Cierre Rápido</span>
                </div>
              </div>

              {/* Dotted Quadrant Axis dividers */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full border-t border-dashed border-muted-foreground/20" />
                <div className="h-full border-l border-dashed border-muted-foreground/20 absolute left-1/2" />
              </div>

              {/* Chart container */}
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Dynamically draw clients as bubbles */}
                {filteredClients.map((client) => {
                  // Normalize probability to SVG X coord (10 to 90)
                  const x = 10 + (client.cierreProb / 100) * 80;
                  
                  // Normalize potential budget to SVG Y coord (90 to 10) - inverted since SVG y=0 is top
                  const minVal = 100000;
                  const maxVal = 800000;
                  const valueRatio = Math.max(0, Math.min(1, (client.potValue - minVal) / (maxVal - minVal)));
                  const y = 90 - valueRatio * 80;

                  // Circle radius based on potential value
                  const radius = 2 + valueRatio * 4;

                  // Bubble color based on traffic light contact status
                  let color = '#22c55e'; // Green
                  if (client.daysSinceLastContact > 21) color = '#ef4444'; // Red
                  else if (client.daysSinceLastContact >= 10) color = '#eab308'; // Yellow

                  return (
                    <g key={client.id} className="cursor-pointer group" onClick={() => onSelectClient(client)}>
                      <circle
                        cx={x}
                        cy={y}
                        r={radius}
                        fill={color}
                        opacity="0.85"
                        stroke="#ffffff"
                        strokeWidth="0.4"
                        className="transition-all hover:scale-125 hover:opacity-100"
                      />
                      <title>
                        {client.firstName} {client.lastName}&#10;
                        Monto: USD {client.potValue.toLocaleString()}&#10;
                        Cercanía: {client.cierreProb}%&#10;
                        Último contacto: {client.daysSinceLastContact} días
                      </title>
                    </g>
                  );
                })}
              </svg>

              {/* Axis legends */}
              <div className="absolute bottom-1 left-2 text-[9px] text-muted-foreground">Baja prob. (0%)</div>
              <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">Alta prob. (100%)</div>
              <div className="absolute top-1 left-1.5 text-[8px] text-muted-foreground writing-vertical">Monto (USD)</div>
            </div>

            {/* Bubble Legend */}
            <div className="flex justify-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>Contacto &lt; 10d</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span>Contacto 10-21d</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Sin contacto &gt; 21d</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 2: Traffic Light List */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Semáforo comercial (Último contacto)</h3>
              <Badge variant="outline" className="text-xs">Alertas de inactividad</Badge>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              
              {/* RED Group */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-red-500/10 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200/20">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Sin contacto &gt; 21 días
                  </span>
                  <span>({trafficLightGroup.red.length})</span>
                </div>
                {trafficLightGroup.red.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic px-3 py-1">Sin alertas urgentes.</p>
                ) : (
                  <div className="space-y-1.5 pl-1.5">
                    {trafficLightGroup.red.slice(0, 3).map((c: any) => (
                      <div key={c.id} onClick={() => onSelectClient(c)} className="flex items-center justify-between p-2 rounded-xl border border-dashed hover:bg-muted/40 transition-colors cursor-pointer text-xs">
                        <div>
                          <span className="font-semibold block text-foreground">{c.firstName} {c.lastName}</span>
                          <span className="text-[10px] text-muted-foreground">{c.propertiesInterest[0] || 'Interés General'}</span>
                        </div>
                        <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastContact} días</span>
                      </div>
                    ))}
                    {trafficLightGroup.red.length > 3 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-1 cursor-pointer hover:underline">Ver los {trafficLightGroup.red.length - 3} restantes...</p>
                    )}
                  </div>
                )}
              </div>

              {/* YELLOW Group */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-yellow-500/10 text-yellow-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-yellow-200/20">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-yellow-500" /> Contacto entre 10 y 21 días
                  </span>
                  <span>({trafficLightGroup.yellow.length})</span>
                </div>
                {trafficLightGroup.yellow.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic px-3 py-1">Al día.</p>
                ) : (
                  <div className="space-y-1.5 pl-1.5">
                    {trafficLightGroup.yellow.slice(0, 2).map((c: any) => (
                      <div key={c.id} onClick={() => onSelectClient(c)} className="flex items-center justify-between p-2 rounded-xl border border-dashed hover:bg-muted/40 transition-colors cursor-pointer text-xs">
                        <div>
                          <span className="font-semibold block text-foreground">{c.firstName} {c.lastName}</span>
                          <span className="text-[10px] text-muted-foreground">{c.propertiesInterest[0] || 'Interés General'}</span>
                        </div>
                        <span className="text-xs text-yellow-600 font-bold bg-yellow-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastContact} días</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GREEN Group */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-green-500/10 text-green-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-200/20">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Contacto &lt; 10 días
                  </span>
                  <span>({trafficLightGroup.green.length})</span>
                </div>
                <div className="space-y-1.5 pl-1.5">
                  {trafficLightGroup.green.slice(0, 2).map((c: any) => (
                    <div key={c.id} onClick={() => onSelectClient(c)} className="flex items-center justify-between p-2 rounded-xl border border-dashed hover:bg-muted/40 transition-colors cursor-pointer text-xs">
                      <div>
                        <span className="font-semibold block text-foreground">{c.firstName} {c.lastName}</span>
                        <span className="text-[10px] text-muted-foreground">{c.propertiesInterest[0] || 'Interés General'}</span>
                      </div>
                      <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastContact === 1 ? '1 día' : `${c.daysSinceLastContact} días`}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Widget 3: Geographic Map of Argentina */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Mapa de leads por provincia</h3>
              <Badge className="bg-primary/10 text-primary border-0 hover:bg-primary/20"><MapPin className="w-3.5 h-3.5 mr-1" /> Argentina</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Stylized Interactive Map using SVG Paths */}
              <div className="border bg-slate-950/5 dark:bg-slate-950/20 rounded-xl p-4 flex flex-col items-center justify-center relative min-h-[300px]">
                <div className="w-full max-w-[180px] aspect-[1/2] relative flex items-center justify-center">
                  
                  {/* Argentina SVG Map with Simplified Paths for all 23 provinces and CABA */}
                  <svg className="w-full h-full text-muted-foreground" viewBox="0 0 450 900" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Define color scales and gradients */}
                    <g id="provinces">
                      {[
                        // Patagonia (South)
                        { name: 'Tierra del Fuego', path: 'M 140 850 L 190 850 L 170 890 L 130 880 Z', labelX: 160, labelY: 865 },
                        { name: 'Santa Cruz', path: 'M 60 720 L 160 710 L 150 830 L 70 820 Z', labelX: 110, labelY: 760 },
                        { name: 'Chubut', path: 'M 50 610 L 180 590 L 165 700 L 55 710 Z', labelX: 115, labelY: 650 },
                        { name: 'Río Negro', path: 'M 60 500 L 195 490 L 180 580 L 50 600 Z', labelX: 120, labelY: 540 },
                        { name: 'Neuquén', path: 'M 30 510 L 70 490 L 110 575 L 50 595 Z', labelX: 65, labelY: 550 },
                        
                        // Cuyo (West-Center)
                        { name: 'Mendoza', path: 'M 40 370 L 105 375 L 90 490 L 50 495 Z', labelX: 70, labelY: 430 },
                        { name: 'San Juan', path: 'M 45 295 L 110 290 L 105 365 L 40 365 Z', labelX: 75, labelY: 330 },
                        { name: 'San Luis', path: 'M 110 380 L 155 385 L 140 480 L 95 480 Z', labelX: 125, labelY: 430 },
                        { name: 'La Rioja', path: 'M 60 220 L 125 210 L 110 285 L 45 290 Z', labelX: 85, labelY: 250 },
                        
                        // NOA (Northwest)
                        { name: 'Catamarca', path: 'M 80 160 L 150 150 L 120 205 L 60 215 Z', labelX: 100, labelY: 180 },
                        { name: 'Tucumán', path: 'M 115 125 L 145 120 L 140 160 L 110 155 Z', labelX: 128, labelY: 140 },
                        { name: 'Salta', path: 'M 90 40 L 170 50 L 145 120 L 75 110 Z', labelX: 120, labelY: 80 },
                        { name: 'Jujuy', path: 'M 70 30 L 120 20 L 110 90 L 80 80 Z', labelX: 95, labelY: 55 },
                        { name: 'Santiago del Estero', path: 'M 155 130 L 225 130 L 205 240 L 140 230 Z', labelX: 180, labelY: 180 },
                        
                        // NEA (Northeast)
                        { name: 'Chaco', path: 'M 215 90 L 290 100 L 265 175 L 210 165 Z', labelX: 250, labelY: 130 },
                        { name: 'Formosa', path: 'M 200 45 L 305 65 L 285 95 L 210 85 Z', labelX: 255, labelY: 70 },
                        { name: 'Misiones', path: 'M 355 115 L 395 80 L 415 110 L 375 145 Z', labelX: 385, labelY: 110 },
                        { name: 'Corrientes', path: 'M 285 140 L 365 150 L 340 240 L 270 210 Z', labelX: 320, labelY: 190 },
                        { name: 'Entre Ríos', path: 'M 265 240 L 315 250 L 290 350 L 255 330 Z', labelX: 285, labelY: 290 },
                        
                        // Centro (Center)
                        { name: 'Santa Fe', path: 'M 210 175 L 265 185 L 250 340 L 185 330 Z', labelX: 230, labelY: 250 },
                        { name: 'Córdoba', path: 'M 145 240 L 220 245 L 200 375 L 125 370 Z', labelX: 180, labelY: 300 },
                        { name: 'La Pampa', path: 'M 100 490 L 195 490 L 180 580 L 120 580 Z', labelX: 145, labelY: 535 },
                        { name: 'Buenos Aires', path: 'M 195 340 L 300 360 L 280 540 L 165 520 Z', labelX: 240, labelY: 440 }
                      ].map((prov) => {
                        const count = provinceStats[prov.name]?.total ?? 0;
                        const active = selectedMapProvince === prov.name;
                        
                        // Dynamic color-coding based on lead counts
                        let fill = 'rgba(226, 232, 240, 0.4)'; // slate-200 default empty
                        if (count > 50) fill = active ? '#ea580c' : '#f97316'; // Primary Orange scale
                        else if (count > 25) fill = active ? '#3182ce' : '#4299e1'; // Blue medium density
                        else if (count > 10) fill = active ? '#63b3ed' : '#90cdf4'; // Blue low density
                        else if (count > 0) fill = active ? '#cbd5e0' : '#e2e8f0';

                        return (
                          <g key={prov.name} className="cursor-pointer group" onClick={() => setSelectedMapProvince(prov.name)}>
                            <path
                              d={prov.path}
                              fill={fill}
                              stroke="#ffffff"
                              strokeWidth="2.5"
                              className="transition-all duration-200 hover:opacity-90 hover:stroke-orange-500"
                            />
                            {/* Visual marker text inside province center if it has leads */}
                            {count > 0 && (
                              <g pointerEvents="none">
                                <circle cx={prov.labelX} cy={prov.labelY} r="12" fill="white" className="shadow-sm" />
                                <text
                                  x={prov.labelX}
                                  y={prov.labelY + 3}
                                  textAnchor="middle"
                                  fill="#1e293b"
                                  fontSize="9"
                                  fontWeight="bold"
                                >
                                  {count}
                                </text>
                              </g>
                            )}
                            <title>{prov.name}: {count} leads</title>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>

                <div className="absolute bottom-2 left-2 flex flex-col gap-1 text-[8px] text-muted-foreground">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Alta densidad (&gt;50 leads)</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Media/Baja densidad</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> &lt; 10 leads</div>
                </div>
              </div>

              {/* Province detail sidebar */}
              <div className="space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">{selectedProvinceDetail.name}</h4>
                  <div className="bg-muted/30 p-2.5 rounded-xl border border-dashed space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leads totales:</span>
                      <span className="font-bold text-foreground">{selectedProvinceDetail.total}</span>
                    </div>
                    <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                      <span>• En Negociación:</span>
                      <span className="font-medium text-foreground">{selectedProvinceDetail.negotiation}</span>
                    </div>
                    <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                      <span>• Nuevos Leads:</span>
                      <span className="font-medium text-foreground">{selectedProvinceDetail.newLead}</span>
                    </div>
                    <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                      <span>• Cerrados:</span>
                      <span className="font-medium text-foreground">{selectedProvinceDetail.closed}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground bg-muted/10 p-2 rounded-xl">
                    <div>
                      <span>Monto Potencial</span>
                      <span className="font-bold text-foreground block text-xs">USD {selectedProvinceDetail.potValue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span>Ticket Promedio</span>
                      <span className="font-bold text-foreground block text-xs">USD {selectedProvinceDetail.avgTicket.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Top Models in clicked Province */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Modelos top en {selectedProvinceDetail.name}</span>
                  {selectedProvinceDetail.topModels.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground italic">Sin datos de modelos.</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedProvinceDetail.topModels.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs">
                          <span className="text-foreground truncate max-w-[120px]">{item.model}</span>
                          <span className="font-bold text-primary">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── SECTION: Row 2 - Funnel, Lead Source, Calendar & Today Checklist ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* Funnel chart widget */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Embudo de ventas</h3>
              <Badge variant="outline" className="text-xs text-muted-foreground">Conversión global: {conversionRate}%</Badge>
            </div>

            <div className="space-y-2 flex flex-col justify-center h-[260px]">
              {funnelStages.map((stage) => {
                // Determine width base
                const widths: Record<string, string> = {
                  new_lead: 'w-full',
                  contacted: 'w-[85%]',
                  appointment_scheduled: 'w-[70%]',
                  advisory_done: 'w-[55%]',
                  negotiation: 'w-[40%]',
                  closed: 'w-[25%]'
                };
                
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground w-20 truncate">{stage.label}</span>
                    <div className="flex-1 bg-muted/40 h-7 rounded-lg overflow-hidden flex items-center relative">
                      <div
                        style={{ backgroundColor: stage.color }}
                        className={`${widths[stage.key] || 'w-full'} h-full opacity-90 transition-all flex items-center justify-center text-[10px] text-white font-bold pr-2`}
                      >
                        {stage.count > 0 && `${stage.count}`}
                      </div>
                      <span className="absolute right-2 text-[10px] font-bold text-muted-foreground">{stage.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lead Source Pie/Donut Chart widget */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Leads por origen</h3>
              <Badge className="bg-yellow-500/10 text-yellow-600 border-0 hover:bg-yellow-500/20">Distribución</Badge>
            </div>

            <div className="flex flex-col justify-between h-[260px] py-2">
              {/* Visual custom SVG representation of Pie chart */}
              <div className="flex justify-center relative">
                <svg className="w-28 h-28" viewBox="0 0 36 36">
                  {/* Outer circle */}
                  <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="3" />
                  
                  {/* Segment representation */}
                  {originStats.map((item, idx) => {
                    // Accumulate previous percentages
                    const prevPercent = originStats.slice(0, idx).reduce((sum, item) => sum + item.percentage, 0);
                    const colors = ['#f43f5e', '#1877F2', '#0ea5e9', '#eab308', '#a855f7', '#64748b'];
                    return (
                      <circle
                        key={idx}
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke={colors[idx % colors.length]}
                        strokeWidth="3.2"
                        strokeDasharray={`${item.percentage} ${100 - item.percentage}`}
                        strokeDashoffset={100 - prevPercent + 25}
                      />
                    );
                  })}
                </svg>
                {/* Center text badge */}
                <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                  <span className="text-xl font-black text-foreground">{filteredClients.length}</span>
                  <span className="text-[9px] uppercase text-muted-foreground font-semibold">Total</span>
                </div>
              </div>

              {/* Legends list */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-2">
                {originStats.slice(0, 6).map((item, idx) => {
                  const colors = ['bg-[#f43f5e]', 'bg-[#1877F2]', 'bg-[#0ea5e9]', 'bg-[#eab308]', 'bg-[#a855f7]', 'bg-[#64748b]'];
                  return (
                    <div key={idx} className="flex justify-between items-center truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-2 h-2 rounded-full ${colors[idx % colors.length]} flex-shrink-0`} />
                        <span className="text-muted-foreground truncate">{item.name}</span>
                      </div>
                      <span className="font-bold text-foreground pl-1">{item.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 6: Calendar upcoming contacts */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Calendario - Próximos contactos</h3>
              <div className="flex border rounded-lg overflow-hidden text-[10px] font-bold">
                <button onClick={() => setCalendarView('dia')} className={`px-2 py-1 ${calendarView === 'dia' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>Día</button>
                <button onClick={() => setCalendarView('semana')} className={`px-2 py-1 border-x ${calendarView === 'semana' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>Semana</button>
                <button onClick={() => setCalendarView('mes')} className={`px-2 py-1 ${calendarView === 'mes' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>Mes</button>
              </div>
            </div>

            <div className="space-y-2 h-[260px] overflow-y-auto pr-1 text-xs">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block tracking-wider">Jueves, 29 de junio de 2026</span>
              
              <div className="relative pl-4 border-l-2 border-primary/20 space-y-3 pt-2">
                
                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />
                  <div className="bg-green-500/5 hover:bg-green-500/10 border border-green-200/20 p-2 rounded-xl space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-foreground">09:00 - Llamada de seguimiento</span>
                      <span className="text-[10px] text-green-600 font-semibold uppercase">Llamar</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">Pedro Porro (Interés: Casa Premium 140)</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-card" />
                  <div className="bg-purple-500/5 hover:bg-purple-500/10 border border-purple-200/20 p-2 rounded-xl space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-foreground">11:00 - Reunión presencial</span>
                      <span className="text-[10px] text-purple-600 font-semibold uppercase">Reunión</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">María Gómez (Interés: Casa Moderna 120)</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-card" />
                  <div className="bg-orange-500/5 hover:bg-orange-500/10 border border-orange-200/20 p-2 rounded-xl space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-foreground">12:00 - Enviar presupuesto</span>
                      <span className="text-[10px] text-orange-600 font-semibold uppercase">Presupuesto</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">Juan Pérez (Interés: Casa Nórdica 90)</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-card" />
                  <div className="bg-blue-500/5 hover:bg-blue-500/10 border border-blue-200/20 p-2 rounded-xl space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-foreground">14:00 - Visita a obra</span>
                      <span className="text-[10px] text-blue-600 font-semibold uppercase">Visita</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">Roberto Sosa (Interés: Casa Moderna 110)</p>
                  </div>
                </div>

              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 7: Focus Today Checklist */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-foreground">Focus - Tareas del día</h3>
                <p className="text-[10px] text-muted-foreground">Checklist comercial de hoy</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground cursor-pointer" />
            </div>

            {/* Checklist progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-primary">{taskCompletionStats.percent}% completado</span>
                <span className="text-muted-foreground">{taskCompletionStats.completed} de {taskCompletionStats.total} tareas</span>
              </div>
              <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                <div
                  style={{ width: `${taskCompletionStats.percent}%` }}
                  className="bg-primary h-full transition-all duration-500"
                />
              </div>
            </div>

            {/* Tasks list */}
            <div className="space-y-2 h-[190px] overflow-y-auto pr-1 text-xs">
              
              <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Prioridad Alta</span>
              {tasks.filter(t => t.priority === 'high').map((t) => (
                <div key={t.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTask(t.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        t.done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'
                      }`}
                    >
                      {t.done && <Check className="w-3 h-3" />}
                    </button>
                    <div className={t.done ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}>
                      <span>{t.text}</span>
                      <span className="text-[10px] text-muted-foreground block">{t.model}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${t.done ? 'bg-muted text-muted-foreground' : 'bg-red-50 text-red-600 border border-red-200/20'}`}>
                    {t.time}
                  </span>
                </div>
              ))}

              <span className="text-[10px] text-primary font-bold uppercase tracking-wider block pt-2">Otras Tareas</span>
              {tasks.filter(t => t.priority === 'other').map((t) => (
                <div key={t.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTask(t.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        t.done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'
                      }`}
                    >
                      {t.done && <Check className="w-3 h-3" />}
                    </button>
                    <div className={t.done ? 'line-through text-muted-foreground text-opacity-80' : 'text-foreground'}>
                      <span>{t.text}</span>
                      <span className="text-[10px] text-muted-foreground block">{t.model}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {t.done ? 'Completada' : t.time}
                  </span>
                </div>
              ))}

            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── SECTION: AI Assistant Smart Recommendation Footer ── */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-foreground">Recomendación IA del Asistente</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identificamos <strong className="text-primary">{trafficLightGroup.red.length} leads estratégicos</strong> que superaron los 21 días sin contacto. Te sugerimos enviarles una propuesta actualizada sobre sus modelos de interés hoy.
            </p>
          </div>
        </div>
        <Button onClick={() => setStageFilter('negotiation')} className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold px-4 py-2 rounded-xl flex-shrink-0">
          Ver Leads Negociación
        </Button>
      </div>

    </div>
  );
}
