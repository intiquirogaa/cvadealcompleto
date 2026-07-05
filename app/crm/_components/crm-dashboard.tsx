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
import { getUnifiedActivities, type CRMActivityLog } from '@/lib/crm/activity';
import { RELATIONSHIP_STAGES } from '@/lib/crm/relationship-stage';

interface CRMClientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locality: string;
  propertiesInterest: string[];
  stage: string;
  relationshipStage: string;
  nextContactDate: string | null;
  nextContactNote: string | null;
  notes: string;
  assignedAdvisorId: string | null;
  assignedAdvisorName?: string | null;
  createdAt: string;
  updatedAt: string;
  profession?: string | null;
  company?: string | null;
  activityLogs?: CRMActivityLog[];
}

interface CRMDashboardProps {
  clients: CRMClientData[];
  onSelectClient: (client: CRMClientData) => void;
  properties: any[];
}

export function CRMDashboard({ clients, onSelectClient, properties }: CRMDashboardProps) {
  // Filters State
  const [modelFilter, setModelFilter] = useState('Todos');
  const [provinceFilter, setProvinceFilter] = useState('Todos');
  const [advisorFilter, setAdvisorFilter] = useState('Todos');
  const [stageFilter, setStageFilter] = useState('Todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Province click state for Map Detail card
  const [selectedMapProvince, setSelectedMapProvince] = useState('Buenos Aires');

  // Local-only "done" state for today's checklist — no persistent field exists
  // yet for task completion, so this resets on reload by design.
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());

  // Calendar view mode
  const [calendarView, setCalendarView] = useState<'dia' | 'semana' | 'mes'>('dia');

  const stagesList = [
    { key: 'Todos', label: 'Todos' },
    { key: 'new_lead', label: 'Nuevo Lead' },
    { key: 'contacted', label: 'Contactado' },
    { key: 'appointment_scheduled', label: 'Cita Agendada' },
    { key: 'advisory_done', label: 'Asesoría Realizada' },
    { key: 'negotiation', label: 'En Negociación' },
    { key: 'closed', label: 'Cerrado' },
  ];

  // 1. Augment clients with real, derived analytics fields — no fabricated
  // per-client data. Pipeline progress (cierreProb) is a fixed value per
  // stage, not a modeled probability; activity/age come straight from real
  // timestamps via getUnifiedActivities (see lib/crm/activity.ts).
  const augmentedClients = useMemo(() => {
    const now = Date.now();
    return clients.map(client => {
      const stageLabel = (stagesList.find(s => s.key === client.stage) ?? stagesList[1]).label;

      // Pipeline progress (0-100), fixed per stage — not a per-client guess
      let cierreProb = 10;
      if (client.stage === 'closed') cierreProb = 100;
      else if (client.stage === 'negotiation') cierreProb = 75;
      else if (client.stage === 'advisory_done') cierreProb = 55;
      else if (client.stage === 'appointment_scheduled') cierreProb = 40;
      else if (client.stage === 'contacted') cierreProb = 25;

      // Days since the most recent real activity (creation, status change,
      // OSINT enrichment, or logged activity) — always defined.
      const lastActivityAt = getUnifiedActivities(client, stageLabel)[0].createdAt;
      const daysSinceLastActivity = Math.max(0, Math.floor((now - new Date(lastActivityAt).getTime()) / 86400000));

      // Lead age in days, from real createdAt
      const leadAgeDays = Math.max(0, Math.floor((now - new Date(client.createdAt).getTime()) / 86400000));

      // Province: real match against the declared locality; leads whose
      // locality doesn't match a known pattern are 'Sin especificar'
      // instead of a guessed province.
      let province = 'Sin especificar';
      const locLower = client.locality.toLowerCase();
      if (locLower.includes('buenos aires') || locLower.includes('caba') || locLower.includes('palermo') || locLower.includes('tigre') || locLower.includes('pilar')) {
        province = 'Buenos Aires';
      } else if (locLower.includes('córdoba') || locLower.includes('cordoba')) {
        province = 'Córdoba';
      } else if (locLower.includes('santa fe') || locLower.includes('rosario')) {
        province = 'Santa Fe';
      } else if (locLower.includes('mendoza')) {
        province = 'Mendoza';
      }

      const advisor = client.assignedAdvisorName || 'Sin Asesor';

      return {
        ...client,
        cierreProb,
        daysSinceLastActivity,
        leadAgeDays,
        province,
        advisor
      };
    });
  }, [clients, stagesList]);

  // Extract unique values for filter lists
  const houseModels = useMemo(() => {
    const list = new Set<string>();
    augmentedClients.forEach(c => c.propertiesInterest.forEach(p => list.add(p)));
    return ['Todos', ...Array.from(list)];
  }, [augmentedClients]);

  const provincesList = ['Todos', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Sin especificar'];

  const advisorsList = useMemo(() => {
    const list = new Set<string>();
    augmentedClients.forEach(c => list.add(c.advisor));
    return ['Todos', ...Array.from(list).sort()];
  }, [augmentedClients]);

  // Real average price of the active property catalog — used by the
  // 'Ticket Promedio' / 'Monto Potencial' KPI cards below. There's no
  // per-lead budget field in the CRM, so this reflects real catalog
  // pricing rather than a per-client guess.
  const avgCatalogPrice = useMemo(() => {
    const priced = properties.filter(p => typeof p.price === 'number' && p.price > 0);
    if (priced.length === 0) return 0;
    return priced.reduce((sum, p) => sum + p.price, 0) / priced.length;
  }, [properties]);

  // 2. Apply Filters
  const filteredClients = useMemo(() => {
    return augmentedClients.filter(c => {
      if (modelFilter !== 'Todos' && !c.propertiesInterest.includes(modelFilter)) return false;
      if (provinceFilter !== 'Todos' && c.province !== provinceFilter) return false;
      if (advisorFilter !== 'Todos' && c.advisor !== advisorFilter) return false;
      if (stageFilter !== 'Todos' && c.stage !== stageFilter) return false;
      if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(c.createdAt) > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [augmentedClients, modelFilter, provinceFilter, advisorFilter, stageFilter, dateFrom, dateTo]);

  // 3. Compute KPI Statistics
  const avgTicket = Math.round(avgCatalogPrice);

  const totalPotValue = Math.round(avgCatalogPrice * filteredClients.length);

  const negotiationCount = useMemo(() => {
    return filteredClients.filter(c => c.stage === 'negotiation').length;
  }, [filteredClients]);

  const conversionRate = useMemo(() => {
    if (filteredClients.length === 0) return 0;
    const closedCount = filteredClients.filter(c => c.stage === 'closed').length;
    return Math.round((closedCount / filteredClients.length) * 100);
  }, [filteredClients]);

  const noContactOver21 = useMemo(() => {
    return filteredClients.filter(c => c.daysSinceLastActivity > 21).length;
  }, [filteredClients]);

  const unspecifiedProvinceCount = useMemo(() => {
    return filteredClients.filter(c => c.province === 'Sin especificar').length;
  }, [filteredClients]);

  // Traffic Light Groups
  const trafficLightGroup = useMemo(() => {
    const red: any[] = [];
    const yellow: any[] = [];
    const green: any[] = [];

    filteredClients.forEach(c => {
      if (c.daysSinceLastActivity > 21) red.push(c);
      else if (c.daysSinceLastActivity >= 10) yellow.push(c);
      else green.push(c);
    });

    return { red, yellow, green };
  }, [filteredClients]);

  // Distribution counts by Province for Argentina map widget
  const provinceStats = useMemo(() => {
    const stats: Record<string, { total: number; stageCounts: Record<string, number> }> = {};
    provincesList.filter(p => p !== 'Todos').forEach(p => {
      stats[p] = { total: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };
    });

    filteredClients.forEach(c => {
      if (!stats[c.province]) {
        stats[c.province] = { total: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };
      }
      stats[c.province].total += 1;
      if (c.stage === 'negotiation') stats[c.province].stageCounts.negotiation += 1;
      if (c.stage === 'new_lead') stats[c.province].stageCounts.new_lead += 1;
      if (c.stage === 'closed') stats[c.province].stageCounts.closed += 1;
    });

    return stats;
  }, [filteredClients]);

  // Details for selected province map card
  const selectedProvinceDetail = useMemo(() => {
    const p = selectedMapProvince;
    const stat = provinceStats[p] || { total: 0, stageCounts: { negotiation: 0, new_lead: 0, closed: 0 } };

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
      potValue: Math.round(avgCatalogPrice * stat.total),
      avgTicket: Math.round(avgCatalogPrice),
      topModels
    };
  }, [selectedMapProvince, provinceStats, filteredClients, avgCatalogPrice]);

  // Leads by property-type interest (real propertiesInterest tags; a lead
  // with multiple tags counts toward each one). Replaces the old fabricated
  // "lead source/origin" chart, which had no backing field.
  const propertyInterestStats = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredClients.forEach(c => {
      const tags = c.propertiesInterest.length > 0 ? c.propertiesInterest : ['Sin especificar'];
      tags.forEach(tag => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
    });
    const totalTags = Object.values(counts).reduce((sum, v) => sum + v, 0);
    return Object.entries(counts).map(([name, value]) => {
      const percentage = totalTags > 0 ? Math.round((value / totalTags) * 100) : 0;
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

  // Relationship-stage timeline (separate from the sales pipeline `stage`
  // above — tracks the relationship itself, including the post-sale
  // referral step that the sales pipeline has no equivalent for).
  const relationshipStageStats = useMemo(() => {
    return RELATIONSHIP_STAGES.map(s => {
      const count = filteredClients.filter(c => (c.relationshipStage || RELATIONSHIP_STAGES[0].key) === s.key).length;
      const percentage = filteredClients.length > 0 ? Math.round((count / filteredClients.length) * 100) : 0;
      return { ...s, count, percentage };
    });
  }, [filteredClients]);

  // Today's date (local) drives both the calendar widget and the Focus
  // checklist, both sourced from the real nextContactDate/nextContactNote
  // fields (date-only, no time component captured in the CRM form).
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const calendarWindowDays = calendarView === 'dia' ? 1 : calendarView === 'semana' ? 7 : 30;

  const upcomingContacts = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const windowEnd = new Date(startOfToday);
    windowEnd.setDate(windowEnd.getDate() + calendarWindowDays - 1);
    windowEnd.setHours(23, 59, 59, 999);

    return filteredClients
      .filter(c => !!c.nextContactDate)
      .map(c => ({ client: c, date: new Date(c.nextContactDate as string) }))
      .filter(({ date }) => date >= startOfToday && date <= windowEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredClients, calendarWindowDays]);

  const todayTasks = useMemo(() => {
    return filteredClients
      .filter(c => c.nextContactDate && c.nextContactDate.slice(0, 10) === todayStr)
      .map(c => ({
        id: c.id,
        client: c,
        note: c.nextContactNote || 'Seguimiento programado',
        priority: (c.stage === 'negotiation' || c.stage === 'advisory_done') ? 'high' as const : 'other' as const,
      }));
  }, [filteredClients, todayStr]);

  // Checkbox action today tasks — local-only completion state (no
  // persistent field exists yet for task completion in the schema).
  const handleToggleTask = (id: string) => {
    setDoneTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const taskCompletionStats = useMemo(() => {
    const total = todayTasks.length;
    const completed = todayTasks.filter(t => doneTaskIds.has(t.id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [todayTasks, doneTaskIds]);

  const resetFilters = () => {
    setModelFilter('Todos');
    setProvinceFilter('Todos');
    setAdvisorFilter('Todos');
    setStageFilter('Todos');
    setDateFrom('');
    setDateTo('');
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

          <div className="flex flex-col gap-1 min-w-[220px]">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Fecha de alta (desde / hasta)</span>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-muted/50 border rounded-xl pl-8 pr-2 py-2 text-xs font-semibold text-foreground w-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-muted/50 border rounded-xl px-2 py-2 text-xs font-semibold text-foreground flex-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="flex self-end gap-2 ml-auto">
            {(modelFilter !== 'Todos' || provinceFilter !== 'Todos' || advisorFilter !== 'Todos' || stageFilter !== 'Todos' || dateFrom || dateTo) && (
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
              <span className="text-[9px] text-muted-foreground">Precio prom. catálogo × leads</span>
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
              <span className="text-[9px] text-muted-foreground">Precio prom. catálogo activo</span>
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
                <p className="text-[10px] text-muted-foreground">Eje X: Avance en pipeline | Eje Y: Antigüedad del lead (días) | Tamaño: Cantidad de intereses</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
            </div>

            {/* Bubble Chart Canvas SVG */}
            <div className="relative border bg-muted/10 rounded-xl p-3 h-[280px]">

              {/* Dotted Quadrant Axis dividers */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full border-t border-dashed border-muted-foreground/20" />
                <div className="h-full border-l border-dashed border-muted-foreground/20 absolute left-1/2" />
              </div>

              {/* Chart container */}
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Dynamically draw clients as bubbles */}
                {(() => {
                  const maxAge = Math.max(1, ...filteredClients.map(c => c.leadAgeDays));
                  const maxInterests = Math.max(1, ...filteredClients.map(c => c.propertiesInterest.length));
                  return filteredClients.map((client) => {
                    // Normalize pipeline progress to SVG X coord (10 to 90)
                    const x = 10 + (client.cierreProb / 100) * 80;

                    // Normalize lead age to SVG Y coord (90 to 10) - inverted since SVG y=0 is top
                    const ageRatio = Math.max(0, Math.min(1, client.leadAgeDays / maxAge));
                    const y = 90 - ageRatio * 80;

                    // Circle radius based on number of interests declared
                    const interestRatio = Math.max(0, Math.min(1, client.propertiesInterest.length / maxInterests));
                    const radius = 2 + interestRatio * 4;

                    // Bubble color based on traffic light activity status
                    let color = '#22c55e'; // Green
                    if (client.daysSinceLastActivity > 21) color = '#ef4444'; // Red
                    else if (client.daysSinceLastActivity >= 10) color = '#eab308'; // Yellow

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
                          Antigüedad: {client.leadAgeDays} días&#10;
                          Avance en pipeline: {client.cierreProb}%&#10;
                          Última actividad: hace {client.daysSinceLastActivity} días
                        </title>
                      </g>
                    );
                  });
                })()}
              </svg>

              {/* Axis legends */}
              <div className="absolute bottom-1 left-2 text-[9px] text-muted-foreground">Inicio pipeline</div>
              <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">Pipeline avanzado</div>
              <div className="absolute top-1 left-1.5 text-[8px] text-muted-foreground writing-vertical">Antigüedad (días)</div>
            </div>

            {/* Bubble Legend */}
            <div className="flex justify-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>Actividad &lt; 10d</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span>Actividad 10-21d</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Sin actividad &gt; 21d</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 2: Traffic Light List */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Semáforo comercial (Última actividad registrada)</h3>
              <Badge variant="outline" className="text-xs">Alertas de inactividad</Badge>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              
              {/* RED Group */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-red-500/10 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200/20">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Sin actividad &gt; 21 días
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
                        <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastActivity} días</span>
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
                    <Clock className="w-3.5 h-3.5 text-yellow-500" /> Actividad entre 10 y 21 días
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
                        <span className="text-xs text-yellow-600 font-bold bg-yellow-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastActivity} días</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GREEN Group */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-green-500/10 text-green-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-200/20">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Actividad &lt; 10 días
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
                      <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-lg">Hace {c.daysSinceLastActivity === 1 ? '1 día' : `${c.daysSinceLastActivity} días`}</span>
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
              <div className="flex items-center gap-1.5">
                {unspecifiedProvinceCount > 0 && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {unspecifiedProvinceCount} sin provincia identificada
                  </Badge>
                )}
                <Badge className="bg-primary/10 text-primary border-0 hover:bg-primary/20"><MapPin className="w-3.5 h-3.5 mr-1" /> Argentina</Badge>
              </div>
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

      {/* ── SECTION: Relationship stage timeline ── */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <div>
              <h3 className="font-bold text-sm text-foreground">Timeline de etapa de relación</h3>
              <p className="text-[10px] text-muted-foreground">Independiente del embudo comercial — dónde está cada lead en la relación</p>
            </div>
            <Badge variant="outline" className="text-xs text-muted-foreground">{filteredClients.length} leads</Badge>
          </div>

          <div className="flex flex-wrap md:flex-nowrap items-start gap-0 pt-2">
            {relationshipStageStats.map((s, idx) => (
              <div key={s.key} className="flex items-center flex-1 min-w-[110px]">
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 bg-primary/10 border-primary/30 text-primary">
                    {s.count}
                  </div>
                  <span className="text-[10px] text-center leading-tight text-muted-foreground">{s.label}</span>
                  <span className="text-[9px] font-bold text-primary">{s.percentage}%</span>
                </div>
                {idx < relationshipStageStats.length - 1 && (
                  <div className="h-0.5 flex-1 mt-[-28px] bg-muted-foreground/15" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

        {/* Lead property-type interest Pie/Donut Chart widget */}
        <Card className="border-0 shadow-sm xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-foreground">Leads por tipo de propiedad</h3>
              <Badge className="bg-yellow-500/10 text-yellow-600 border-0 hover:bg-yellow-500/20">Distribución</Badge>
            </div>

            <div className="flex flex-col justify-between h-[260px] py-2">
              {/* Visual custom SVG representation of Pie chart */}
              <div className="flex justify-center relative">
                <svg className="w-28 h-28" viewBox="0 0 36 36">
                  {/* Outer circle */}
                  <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="3" />
                  
                  {/* Segment representation */}
                  {propertyInterestStats.map((item, idx) => {
                    // Accumulate previous percentages
                    const prevPercent = propertyInterestStats.slice(0, idx).reduce((sum, item) => sum + item.percentage, 0);
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
                {propertyInterestStats.slice(0, 6).map((item, idx) => {
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
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block tracking-wider">
                {calendarView === 'dia' ? 'Hoy' : calendarView === 'semana' ? 'Próximos 7 días' : 'Próximos 30 días'} · {upcomingContacts.length} contacto{upcomingContacts.length === 1 ? '' : 's'} programado{upcomingContacts.length === 1 ? '' : 's'}
              </span>

              {upcomingContacts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic px-1 py-4 text-center">No hay contactos programados en este rango.</p>
              ) : (
                <div className="relative pl-4 border-l-2 border-primary/20 space-y-3 pt-2">
                  {upcomingContacts.map(({ client, date }) => (
                    <div key={client.id} className="relative cursor-pointer" onClick={() => onSelectClient(client)}>
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
                      <div className="bg-primary/5 hover:bg-primary/10 border border-primary/20 p-2 rounded-xl space-y-1">
                        <div className="flex justify-between">
                          <span className="font-bold text-foreground">{client.firstName} {client.lastName}</span>
                          <span className="text-[10px] text-primary font-semibold uppercase">
                            {date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          {client.nextContactNote || 'Seguimiento programado'}
                          {client.propertiesInterest[0] ? ` (Interés: ${client.propertiesInterest[0]})` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              {todayTasks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic px-1 py-4 text-center">Sin contactos programados para hoy.</p>
              ) : (
                <>
                  {todayTasks.filter(t => t.priority === 'high').length > 0 && (
                    <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Prioridad Alta</span>
                  )}
                  {todayTasks.filter(t => t.priority === 'high').map((t) => {
                    const done = doneTaskIds.has(t.id);
                    return (
                      <div key={t.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleTask(t.id)}
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'
                            }`}
                          >
                            {done && <Check className="w-3 h-3" />}
                          </button>
                          <div className={done ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}>
                            <span onClick={() => onSelectClient(t.client)} className="cursor-pointer hover:underline">{t.client.firstName} {t.client.lastName}</span>
                            <span className="text-[10px] text-muted-foreground block">{t.note}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${done ? 'bg-muted text-muted-foreground' : 'bg-red-50 text-red-600 border border-red-200/20'}`}>
                          {done ? 'Hecho' : 'Hoy'}
                        </span>
                      </div>
                    );
                  })}

                  {todayTasks.filter(t => t.priority === 'other').length > 0 && (
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider block pt-2">Otras Tareas</span>
                  )}
                  {todayTasks.filter(t => t.priority === 'other').map((t) => {
                    const done = doneTaskIds.has(t.id);
                    return (
                      <div key={t.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleTask(t.id)}
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'
                            }`}
                          >
                            {done && <Check className="w-3 h-3" />}
                          </button>
                          <div className={done ? 'line-through text-muted-foreground text-opacity-80' : 'text-foreground'}>
                            <span onClick={() => onSelectClient(t.client)} className="cursor-pointer hover:underline">{t.client.firstName} {t.client.lastName}</span>
                            <span className="text-[10px] text-muted-foreground block">{t.note}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {done ? 'Completada' : 'Hoy'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
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
              Identificamos <strong className="text-primary">{trafficLightGroup.red.length} leads estratégicos</strong> sin actividad registrada hace más de 21 días. Te sugerimos enviarles una propuesta actualizada sobre sus modelos de interés hoy.
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
