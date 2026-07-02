"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Network, ShieldAlert, History, MapPin, Search } from "lucide-react";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// Dynamically import react-force-graph to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export function OsintDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mRes, pRes, rRes] = await Promise.all([
        fetch("/api/admin/osint/metrics").then((r) => r.json()),
        fetch("/api/admin/osint/providers").then((r) => r.json()),
        fetch("/api/admin/osint/runs").then((r) => r.json()),
      ]);

      if (mRes.success) setMetrics(mRes.data);
      if (pRes.success) setProviders(pRes.data);
      if (rRes.success) setRuns(rRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGraph = async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/osint/graph?runId=${runId}`).then((r) => r.json());
      if (res.success) {
        setGraphData({
          nodes: res.data.nodes,
          // Re-map edges for react-force-graph
          links: res.data.edges.map((e: any) => ({
            source: e.source,
            target: e.target,
            label: e.label
          }))
        } as any);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pieData = [
    { name: "Exitosos", value: metrics.successfulRuns, color: "#22c55e" },
    { name: "Fallidos", value: metrics.failedRuns, color: "#ef4444" },
    { name: "Parciales", value: metrics.partialRuns, color: "#eab308" },
  ];

  return (
    <div className="flex-1 p-6 md:p-8 pt-24 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-indigo-500" /> OSINT Control Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Métricas en tiempo real, monitoreo de providers y trazabilidad del Knowledge Graph.
          </p>
        </div>
      </div>

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="metrics">KPIs</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="runs">Trazabilidad</TabsTrigger>
          <TabsTrigger value="graph">Knowledge Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Investigaciones Totales</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{metrics.totalRuns}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Tasa de Éxito</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{metrics.successRate}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Tiempo Promedio</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{metrics.avgDurationMs} ms</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Costo Estimado</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">${metrics.estimatedCostUsd}</div></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Estado de Ejecuciones</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="providers">
          <Card>
            <CardHeader><CardTitle>Estado de Motores (Circuit Breakers & Rate Limits)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted/50">
                    <tr>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Circuit State</th>
                      <th className="px-4 py-3">Reqs Exitosos / Fallidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{p.category}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.circuitState === "closed" ? "default" : "destructive"}>
                            {p.circuitState}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-green-600">{p.circuitBreaker.successfulRequests}</span> / <span className="text-red-600">{p.circuitBreaker.failedRequests}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader><CardTitle>Timeline de Investigaciones (Trazabilidad del Planner)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {runs.map(run => (
                  <div key={run.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors flex justify-between items-center">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {run.id.slice(0, 8)}... 
                        <Badge variant={run.status === "completed" ? "default" : "secondary"}>{run.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Client: {run.clientId} | {run.cyclesExecuted} ciclos | {run.durationMs}ms
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => loadGraph(run.id)}>
                      <Network className="w-4 h-4 mr-2" /> Ver Grafo
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graph">
          <Card>
            <CardHeader><CardTitle>Visualizador Interactivo del Knowledge Graph</CardTitle></CardHeader>
            <CardContent>
              {graphData.nodes.length > 0 ? (
                <div className="h-[600px] border rounded-lg bg-gray-50 overflow-hidden">
                  <ForceGraph2D
                    graphData={graphData as any}
                    nodeLabel="label"
                    nodeAutoColorBy="type"
                    linkLabel="label"
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                  />
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground border rounded-lg bg-gray-50/50 border-dashed">
                  Selecciona una investigación en "Trazabilidad" para visualizar su Grafo.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
