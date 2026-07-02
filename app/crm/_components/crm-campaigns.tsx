'use client';

import React, { useState, useMemo } from 'react';
import { 
  Megaphone, TrendingUp, DollarSign, Users, Award, 
  Settings, RefreshCw, BarChart2, ShieldCheck, HelpCircle,
  Eye, MousePointer, Info, ExternalLink, Plus, Check, Play, Pause
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CRMCampaignsProps {
  clients: any[];
}

export function CRMCampaigns({ clients }: CRMCampaignsProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({
    accessToken: '',
    adAccountId: 'act_1029384756',
    verifyToken: 'cva_deal_meta_token_2026',
    webhookUrl: typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/meta-leads` : '/api/webhooks/meta-leads'
  });

  const [loading, setLoading] = useState(false);

  // Simulated Campaign List
  const [campaigns, setCampaigns] = useState([
    { id: '1', name: 'Lanzamiento Casa Premium 140 - Gran Buenos Aires', status: 'ACTIVE', spend: 850, impressions: 45000, clicks: 1200, leadsCount: 48, platform: 'Meta Ads', cpl: 17.7, ctr: 2.6 },
    { id: '2', name: 'Tráfico Modelos Nórdicos - Córdoba y Santa Fe', status: 'ACTIVE', spend: 420, impressions: 32000, clicks: 980, leadsCount: 22, platform: 'Instagram Ads', cpl: 19.0, ctr: 3.0 },
    { id: '3', name: 'Conversión Casa Moderna 110 - Neuquén y Salta', status: 'PAUSED', spend: 310, impressions: 18000, clicks: 540, leadsCount: 15, platform: 'Meta Ads', cpl: 20.6, ctr: 3.0 },
    { id: '4', name: 'Simulador CVA Deal - Retargeting Nacional', status: 'ACTIVE', spend: 640, impressions: 58000, clicks: 2100, leadsCount: 65, platform: 'All Meta', cpl: 9.8, ctr: 3.6 },
  ]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setShowConfig(false);
      toast.success('Configuración de Meta Ads guardada con éxito.');
    }, 800);
  };

  const handleToggleCampaign = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id === id) {
        const nextStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        toast.info(`Campaña ${c.name} ahora está ${nextStatus === 'ACTIVE' ? 'Activa' : 'Pausada'}`);
        return { ...c, status: nextStatus };
      }
      return c;
    }));
  };

  // Compute stats
  const totalSpend = useMemo(() => campaigns.reduce((acc, c) => acc + c.spend, 0), [campaigns]);
  const totalLeads = useMemo(() => campaigns.reduce((acc, c) => acc + c.leadsCount, 0), [campaigns]);
  const totalImpressions = useMemo(() => campaigns.reduce((acc, c) => acc + c.impressions, 0), [campaigns]);
  const totalClicks = useMemo(() => campaigns.reduce((acc, c) => acc + c.clicks, 0), [campaigns]);
  const avgCpl = useMemo(() => totalLeads > 0 ? (totalSpend / totalLeads) : 0, [totalSpend, totalLeads]);
  const avgCtr = useMemo(() => totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0, [totalClicks, totalImpressions]);

  // Find closed deals matching Meta leads (simulating matching domain/email)
  const metaLeadsInCRM = useMemo(() => {
    return clients.filter(c => c.origin === 'Instagram' || c.origin === 'Facebook' || c.email?.includes('meta_'));
  }, [clients]);

  const closedLeadsFromMeta = useMemo(() => {
    return metaLeadsInCRM.filter(c => c.stage === 'closed');
  }, [metaLeadsInCRM]);

  const conversionPercentage = useMemo(() => {
    if (metaLeadsInCRM.length === 0) return 0;
    return Math.round((closedLeadsFromMeta.length / metaLeadsInCRM.length) * 100);
  }, [metaLeadsInCRM, closedLeadsFromMeta]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-orange-500" /> Integración y Campañas de Meta Ads
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitoreá el rendimiento de tus anuncios y recibí contactos automáticamente a través de la API oficial de Meta Lead Ads.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowConfig(!showConfig)}
            className="border-orange-500/20 text-orange-500 hover:bg-orange-500/5 flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" /> {showConfig ? 'Cerrar Ajustes' : 'Configurar API'}
          </Button>
        </div>
      </div>

      {/* Meta API Config Panel */}
      {showConfig && (
        <Card className="border border-orange-500/10 shadow-md bg-orange-500/[0.01]">
          <CardContent className="p-6">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
              <ShieldCheck className="w-4 h-4 text-orange-500" /> Configuración de Meta Webhook & API Graph
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Configurá las claves para sincronizar tus formularios de clientes potenciales (Lead Ads) en tiempo real con este CRM.
            </p>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Verify Token (Meta Webhook)</Label>
                  <Input 
                    value={config.verifyToken} 
                    onChange={e => setConfig({ ...config, verifyToken: e.target.value })}
                    placeholder="Verify Token para configurar en Meta App" 
                    className="text-xs font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Usá este token al registrar el Webhook en tu portal de desarrolladores de Meta.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">URL del Webhook (Solo lectura)</Label>
                  <Input 
                    value={config.webhookUrl} 
                    readOnly 
                    className="text-xs font-mono bg-muted text-muted-foreground"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Copiá esta URL para la suscripción al endpoint de Meta Webhooks.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Meta Page Access Token (Page Scope)</Label>
                  <Input 
                    type="password"
                    value={config.accessToken} 
                    onChange={e => setConfig({ ...config, accessToken: e.target.value })}
                    placeholder="EAIaIQobChMI..." 
                    className="text-xs font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Requerido para leer los campos del formulario cuando llega una notificación de lead.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">ID de la Cuenta Publicitaria (Ad Account ID)</Label>
                  <Input 
                    value={config.adAccountId} 
                    onChange={e => setConfig({ ...config, adAccountId: e.target.value })}
                    placeholder="act_1234567890" 
                    className="text-xs font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Para sincronizar las métricas y listados de campañas que ves abajo.
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowConfig(false)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
                  {loading ? 'Guardando...' : 'Guardar y verificar conexión'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Campaign Analytics Dashboard Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Gasto total (USD)', value: `$${totalSpend.toLocaleString()}`, icon: DollarSign, color: 'text-blue-500 bg-blue-500/10' },
          { label: 'Impresiones', value: totalImpressions.toLocaleString(), icon: Eye, color: 'text-indigo-500 bg-indigo-500/10' },
          { label: 'Leads de Campañas', value: totalLeads.toString(), icon: Users, color: 'text-orange-500 bg-orange-500/10' },
          { label: 'Costo por Lead (CPL)', value: `$${avgCpl.toFixed(1)} USD`, icon: TrendingUp, color: 'text-rose-500 bg-rose-500/10' },
          { label: 'Tasa de Cierre ROI', value: `${conversionPercentage}%`, icon: Award, color: 'text-emerald-500 bg-emerald-500/10' }
        ].map((s, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-4 h-4" />
                </div>
              </div>
              <h4 className="text-xl font-bold text-foreground leading-none">{s.value}</h4>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts section & webhook guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SVG Leads Chart */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1">
                <BarChart2 className="w-4 h-4 text-orange-500" /> Leads e Inversión por Campaña
              </h3>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Últimos 30 días</Badge>
            </div>
            
            {/* SVG Chart */}
            <div className="h-[220px] w-full flex items-end justify-between gap-4 pt-4 px-2 relative border-b">
              {campaigns.map((camp, index) => {
                const maxLeads = Math.max(...campaigns.map(c => c.leadsCount));
                const heightPercent = maxLeads > 0 ? (camp.leadsCount / maxLeads) * 85 : 0;

                return (
                  <div key={camp.id} className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer">
                    <span className="text-[10px] font-bold text-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {camp.leadsCount} leads
                    </span>
                    <div 
                      style={{ height: `${heightPercent}%` }} 
                      className="w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-lg transition-all group-hover:from-orange-600 group-hover:to-orange-500 relative flex items-end justify-center shadow-inner"
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-t-lg transition-opacity" />
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center mt-2 font-medium">
                      Camp. {index + 1}
                    </span>
                  </div>
                );
              })}
              
              {/* Horizontal axis grid markers */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-1 border-l border-dashed border-muted-foreground/10">
                <div className="border-t border-dashed w-full border-muted-foreground/5" />
                <div className="border-t border-dashed w-full border-muted-foreground/5" />
                <div className="border-t border-dashed w-full border-muted-foreground/5" />
              </div>
            </div>

            {/* Chart Legend mapping indices to names */}
            <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
              {campaigns.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate text-muted-foreground hover:text-foreground cursor-pointer" title={c.name}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Integration Instructions Sidebar */}
        <Card className="border-0 shadow-sm bg-muted/20">
          <CardContent className="p-5 space-y-4 text-xs">
            <h3 className="font-bold text-foreground flex items-center gap-1 text-sm border-b pb-2">
              <Info className="w-4 h-4 text-orange-500" /> Guía de Integración Meta
            </h3>
            
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <div className="flex gap-2">
                <span className="font-bold text-orange-500 bg-orange-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">1</span>
                <p>Creá una aplicación en la consola de <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 font-semibold underline hover:text-orange-600 inline-flex items-center gap-0.5">Meta Developers <ExternalLink className="w-3 h-3" /></a> de tipo "Negocio" o "Consumidor".</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-orange-500 bg-orange-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">2</span>
                <p>Agregá el producto **Webhooks**, seleccioná el webhook de tipo **leadgen** y pegá la URL y Verify Token de arriba.</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-orange-500 bg-orange-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">3</span>
                <p>Asociá tu app a tus formularios en la pestaña de herramientas de publicación de tu Fanpage de Facebook.</p>
              </div>
              <div className="bg-orange-500/5 text-orange-600 dark:text-orange-400 p-2.5 rounded-lg border border-orange-500/10">
                🚀 Los clientes se crearán **automáticamente** y se les asignará el origen "Instagram" o "Facebook" para impactar en tus reportes analíticos.
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Campaigns list table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground text-xs font-semibold uppercase">
                <th className="text-left px-4 py-3">Nombre de la Campaña</th>
                <th className="text-left px-4 py-3">Plataforma</th>
                <th className="text-center px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Inversión</th>
                <th className="text-right px-4 py-3">Leads</th>
                <th className="text-right px-4 py-3">CTR</th>
                <th className="text-right px-4 py-3">CPL</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((camp) => (
                <tr key={camp.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{camp.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{camp.platform}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={camp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {camp.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">${camp.spend} USD</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-500">{camp.leadsCount}</td>
                  <td className="px-4 py-3 text-right font-mono">{camp.ctr.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">${camp.cpl.toFixed(1)} USD</td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleToggleCampaign(camp.id)}
                      className={camp.status === 'ACTIVE' ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}
                    >
                      {camp.status === 'ACTIVE' ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                      {camp.status === 'ACTIVE' ? 'Pausar' : 'Reanudar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
