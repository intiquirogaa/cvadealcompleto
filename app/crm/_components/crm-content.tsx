"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Search,
  X,
  Save,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ChevronRight,
  Clock,
  Edit2,
  Trash2,
  UserPlus,
  Building2,
  Bell,
  Filter,
  MessageCircle,
  GripVertical,
  ExternalLink,
  History,
  Linkedin,
  Instagram,
  Facebook,
  Globe,
  Sparkles,
  Check,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Activity,
  FileText,
  Settings,
  Sparkle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { CRMDashboard } from "./crm-dashboard";
import { CRMCampaigns } from "./crm-campaigns";
import { WhatsAppChat } from "@/components/whatsapp-chat";
import { WhatsAppQRConnect } from "@/components/whatsapp-qr-connect";

const PROPERTY_INTERESTS = [
  "Casa",
  "Departamento",
  "PH",
  "Terreno",
  "Local comercial",
  "Oficina",
  "Country / Barrio cerrado",
  "Loft",
  "Dúplex",
  "Cabaña",
];

const STAGES_LIST = [
  {
    key: "new_lead",
    label: "Nuevo Lead",
    color: "bg-blue-500",
    lightColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    key: "contacted",
    label: "Contactado",
    color: "bg-yellow-500",
    lightColor: "bg-yellow-50 dark:bg-yellow-950/30",
  },
  {
    key: "appointment_scheduled",
    label: "Cita Agendada",
    color: "bg-purple-500",
    lightColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    key: "advisory_done",
    label: "Asesoría Realizada",
    color: "bg-green-500",
    lightColor: "bg-green-50 dark:bg-green-950/30",
  },
  {
    key: "negotiation",
    label: "En Negociación",
    color: "bg-orange-500",
    lightColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    key: "closed",
    label: "Cerrado",
    color: "bg-emerald-600",
    lightColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
];

export function getUnifiedActivities(c: any): CRMActivityLog[] {
  const baseLogs = c.activityLogs && c.activityLogs.length > 0 ? [...c.activityLogs] : [];

  if (c.lastEnriched && !baseLogs.some((l: any) => l.type === "osint_enrichment")) {
    baseLogs.push({
      id: "last-enriched",
      type: "osint_enrichment",
      title: "Escaneo web y redes sociales",
      description: "La inteligencia artificial completó el perfil con web scraping.",
      createdAt: c.lastEnriched,
    });
  }

  if (c.updatedAt && c.updatedAt !== c.createdAt && !baseLogs.some((l: any) => l.type === "status_changed")) {
    const info = STAGES_LIST.find(s => s.key === c.stage) ?? STAGES_LIST[0];
    baseLogs.push({
      id: "status-changed",
      type: "status_changed",
      title: `Estado cambiado a ${info.label}`,
      description: "Modificado en el CRM",
      createdAt: c.updatedAt,
    });
  }

  if (!baseLogs.some((l: any) => l.type === "created")) {
    baseLogs.push({
      id: "created",
      type: "created",
      title: "Lead creado en base de datos",
      description: "Asesor asignado registró el cliente.",
      createdAt: c.createdAt,
    });
  }

  baseLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return baseLogs;
}

const STAGES: Record<string, { label: string; color: string }> = {};
STAGES_LIST.forEach(s => {
  STAGES[s.key] = { label: s.label, color: `${s.lightColor} text-foreground` };
});

interface CRMActivityLog {
  id: string;
  type: string;
  title: string;
  description: string;
  metadata?: string | null;
  createdById?: string | null;
  createdAt: string;
}

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
  avatarUrl?: string | null;
  socialLinks?: string | null;
  insights?: string | null;
  alerts?: string | null;
  lastEnriched?: string | null;
  conversationText?: string | null;
  conversationSentiment?: string | null;
  conversationAnalysis?: string | null;
  suggestedProfileChanges?: string | null;
  activityLogs?: CRMActivityLog[];
}

export function CRMContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [clients, setClients] = useState<CRMClientData[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingClient, setEditingClient] = useState<CRMClientData | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CRMClientData | null>(
    null
  );
  const [fullProfileClient, setFullProfileClient] =
    useState<CRMClientData | null>(null);
  const [currentView, setCurrentView] = useState<
    "kanban" | "dashboard" | "campaigns" | "chat"
  >("kanban");
  const [whatsappConnected, setWhatsappConnected] = useState(false);

  const isAdmin = (session?.user as any)?.role === "admin";
  const isAdvisor = (session?.user as any)?.role === "advisor";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      if (!isAdmin && !isAdvisor) {
        router.replace("/dashboard");
        return;
      }
      fetchClients();
      fetchProperties();
      checkWhatsAppStatus();
    }
  }, [status]);

  const checkWhatsAppStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect');
      const data = await res.json();
      console.log('[CRM] WhatsApp status check:', data);
      setWhatsappConnected(data.status === 'connected');
    } catch (error) {
      console.error('[CRM] Error checking WhatsApp status:', error);
    }
  };

  const fetchClients = async (updatedId?: string) => {
    try {
      const res = await fetch("/api/crm/clients");
      const data = await res.json();
      setClients(data ?? []);
      if (updatedId && data) {
        const updated = data.find((c: any) => c.id === updatedId);
        if (updated) {
          if (fullProfileClient?.id === updatedId)
            setFullProfileClient(updated);
          if (selectedClient?.id === updatedId) setSelectedClient(updated);
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    try {
      const res = await fetch("/api/properties");
      const data = await res.json();
      setProperties(data ?? []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const deleteClient = async (id: string) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    try {
      const res = await fetch(`/api/crm/clients/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Cliente eliminado");
        fetchClients();
        if (selectedClient?.id === id) setSelectedClient(null);
        if (fullProfileClient?.id === id) setFullProfileClient(null);
      } else toast.error("Error al eliminar");
    } catch {
      toast.error("Error de conexión");
    }
  };

  const updateStage = async (id: string, stage: string) => {
    try {
      const res = await fetch(`/api/crm/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.ok) {
        toast.success("Estado actualizado");
        fetchClients(id);
      } else toast.error("Error");
    } catch {
      toast.error("Error de conexión");
    }
  };

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const clientId = result.draggableId;
    const newStage = result.destination.droppableId;
    // Optimistic update
    setClients(prev =>
      prev.map(c => (c.id === clientId ? { ...c, stage: newStage } : c))
    );
    updateStage(clientId, newStage);
  }, []);

  const filteredClients = useMemo(() => {
    let list = clients;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        c =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s) ||
          c.phone.includes(s) ||
          c.locality.toLowerCase().includes(s)
      );
    }
    if (showUpcoming) {
      const now = new Date();
      list = list.filter(
        c => c.nextContactDate && new Date(c.nextContactDate) >= now
      );
      list.sort(
        (a, b) =>
          new Date(a.nextContactDate!).getTime() -
          new Date(b.nextContactDate!).getTime()
      );
    }
    return list;
  }, [clients, search, showUpcoming]);

  const upcomingCount = useMemo(() => {
    const now = new Date();
    return clients.filter(
      c => c.nextContactDate && new Date(c.nextContactDate) >= now
    ).length;
  }, [clients]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES_LIST.forEach(s => (counts[s.key] = 0));
    clients.forEach(c => {
      counts[c.stage] = (counts[c.stage] ?? 0) + 1;
    });
    return counts;
  }, [clients]);

  const openWhatsApp = (client: CRMClientData) => {
    const phone = client.phone.replace(/[^\d+]/g, "");
    if (!phone) {
      toast.error("El cliente no tiene teléfono");
      return;
    }
    const msg = encodeURIComponent(
      `Hola ${client.firstName}, te contactamos desde CVA DEAL respecto a tu consulta inmobiliaria. ¿Cómo podés?`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  if (status === "loading" || loading) {
    return (
      <main className="flex-1 flex items-center justify-center py-20">
        <p className="text-muted-foreground">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <ClientForm
              client={editingClient}
              properties={properties}
              onClose={() => {
                setShowForm(false);
                setEditingClient(null);
              }}
              onSave={() => {
                setShowForm(false);
                const editedId = editingClient?.id;
                setEditingClient(null);
                fetchClients(editedId);
              }}
            />
          )}
        </AnimatePresence>

        {/* Import Modal */}
        <AnimatePresence>
          {showImport && (
            <ImportClientsModal
              onClose={() => setShowImport(false)}
              onSave={() => {
                setShowImport(false);
                fetchClients();
              }}
            />
          )}
        </AnimatePresence>

        {fullProfileClient ? (
          <CRMClientProfile
            client={fullProfileClient}
            onClose={() => setFullProfileClient(null)}
            onEdit={() => {
              setEditingClient(fullProfileClient);
              setShowForm(true);
            }}
            onUpdate={updated => {
              setFullProfileClient(updated);
              setClients(prev =>
                prev.map(c => (c.id === updated.id ? updated : c))
              );
            }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary-foreground" />
                  </div>
                  CRM - Gestión de Clientes
                </h1>
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-muted-foreground text-sm">
                    {clients.length} clientes registrados
                  </p>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex rounded-lg overflow-hidden border text-xs font-bold bg-muted/30">
                    <button
                      onClick={() => setCurrentView("kanban")}
                      className={`px-3 py-1.5 transition-colors ${
                        currentView === "kanban"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tablero Kanban
                    </button>
                    <button
                      onClick={() => setCurrentView("dashboard")}
                      className={`px-3 py-1.5 transition-colors ${
                        currentView === "dashboard"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Dashboard Analítico
                    </button>
                    <button
                      onClick={() => setCurrentView("campaigns")}
                      className={`px-3 py-1.5 transition-colors ${
                        currentView === "campaigns"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Campañas Ads
                    </button>
                    <button
                      onClick={() => setCurrentView("chat")}
                      className={`px-3 py-1.5 transition-colors ${
                        currentView === "chat"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Chat
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowImport(true)}
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary/10"
                >
                  <FileText className="w-4 h-4 mr-2" /> Importar CSV
                </Button>
                <Button
                  onClick={() => {
                    setEditingClient(null);
                    setShowForm(true);
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Nuevo Cliente
                </Button>
              </div>
            </div>

            {currentView === "dashboard" ? (
              <CRMDashboard
                clients={clients}
                properties={properties}
                onSelectClient={c => {
                  setFullProfileClient(c);
                }}
              />
            ) : currentView === "campaigns" ? (
              <CRMCampaigns clients={clients} />
            ) : currentView === "chat" ? (
              <div className="w-full">
                {!whatsappConnected ? (
                  <div className="flex items-center justify-center py-8">
                    <WhatsAppQRConnect onConnected={() => {
                      console.log('[CRM] WhatsApp connected callback triggered');
                      setWhatsappConnected(true);
                    }} />
                  </div>
                ) : (
                  <>
                    <WhatsAppChat onDisconnected={() => {
                      console.log('[CRM] WhatsApp disconnected callback triggered');
                      setWhatsappConnected(false);
                    }} />
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por nombre, email, teléfono..."
                      className="pl-10"
                    />
                  </div>
                  <Button
                    variant={showUpcoming ? "default" : "outline"}
                    onClick={() => setShowUpcoming(!showUpcoming)}
                    className={
                      showUpcoming ? "bg-primary text-primary-foreground" : ""
                    }
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Próximos contactos
                    {upcomingCount > 0 && (
                      <span className="ml-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {upcomingCount}
                      </span>
                    )}
                  </Button>
                </div>

                {/* Kanban + Detail panel */}
                <div className="flex gap-6">
                  <div
                    className={`flex-1 ${selectedClient ? "max-w-[calc(100%-380px)]" : ""}`}
                  >
                    <DragDropContext onDragEnd={onDragEnd}>
                      <div className="overflow-x-auto pb-4">
                        <div className="flex gap-3 min-w-[1100px]">
                          {STAGES_LIST.map(stage => {
                            const stageClients = filteredClients.filter(
                              c => c.stage === stage.key
                            );
                            return (
                              <Droppable
                                droppableId={stage.key}
                                key={stage.key}
                              >
                                {(provided, snapshot) => (
                                  <div className="flex-1 min-w-[170px]">
                                    <div
                                      className={`${stage.color} text-white rounded-t-xl px-3 py-2.5 text-sm font-semibold flex justify-between items-center`}
                                    >
                                      <span>{stage.label}</span>
                                      <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-bold">
                                        {stageClients.length}
                                      </span>
                                    </div>
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.droppableProps}
                                      className={`rounded-b-xl p-2 min-h-[250px] space-y-2 transition-colors ${
                                        snapshot.isDraggingOver
                                          ? "bg-primary/10 ring-2 ring-primary/30"
                                          : "bg-muted/30"
                                      }`}
                                    >
                                      {stageClients.map((client, index) => (
                                        <Draggable
                                          draggableId={client.id}
                                          index={index}
                                          key={client.id}
                                        >
                                          {(provided, snapshot) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.draggableProps}
                                              {...provided.dragHandleProps}
                                              onClick={() =>
                                                setSelectedClient(client)
                                              }
                                              className={`bg-card p-3 rounded-xl shadow-sm border border-border/50 hover:shadow-md transition-all cursor-pointer select-none space-y-2 relative group ${
                                                snapshot.isDragging
                                                  ? "rotate-2 shadow-lg ring-2 ring-primary"
                                                  : ""
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-1">
                                                <span className="font-semibold text-xs text-foreground block truncate">
                                                  {client.firstName}{" "}
                                                  {client.lastName}
                                                </span>
                                                <button
                                                  onClick={e => {
                                                    e.stopPropagation();
                                                    setEditingClient(client);
                                                    setShowForm(true);
                                                  }}
                                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary rounded"
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </button>
                                              </div>

                                              {client.phone && (
                                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                  <Phone className="w-3 h-3 text-muted-foreground/75" />
                                                  <span className="truncate">
                                                    {client.phone}
                                                  </span>
                                                </div>
                                              )}

                                              {client.propertiesInterest
                                                .length > 0 && (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                  {client.propertiesInterest
                                                    .slice(0, 2)
                                                    .map(interest => (
                                                      <span
                                                        key={interest}
                                                        className="text-[9px] bg-primary/5 text-primary px-1.5 py-0.5 rounded-full font-medium"
                                                      >
                                                        {interest}
                                                      </span>
                                                    ))}
                                                  {client.propertiesInterest
                                                    .length > 2 && (
                                                    <span className="text-[9px] text-muted-foreground font-semibold px-1 py-0.5">
                                                      +
                                                      {client.propertiesInterest
                                                        .length - 2}
                                                    </span>
                                                  )}
                                                </div>
                                              )}

                                              {client.nextContactDate && (
                                                <div className="flex items-center gap-1 text-[9px] text-amber-600 bg-amber-500/5 px-2 py-1 rounded-lg">
                                                  <Calendar className="w-3 h-3" />
                                                  <span className="truncate">
                                                    {new Date(
                                                      client.nextContactDate
                                                    ).toLocaleDateString(
                                                      "es-AR",
                                                      {
                                                        day: "numeric",
                                                        month: "short",
                                                      }
                                                    )}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </Draggable>
                                      ))}
                                      {provided.placeholder}
                                    </div>
                                  </div>
                                )}
                              </Droppable>
                            );
                          })}
                        </div>
                      </div>
                    </DragDropContext>
                  </div>

                  {/* Detail panel */}
                  <AnimatePresence>
                    {selectedClient && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="w-[360px] flex-shrink-0 hidden lg:block"
                      >
                        <ClientDetail
                          client={selectedClient}
                          onEdit={() => {
                            setEditingClient(selectedClient);
                            setShowForm(true);
                          }}
                          onStageChange={stage => {
                            updateStage(selectedClient.id, stage);
                            setSelectedClient({ ...selectedClient, stage });
                          }}
                          onClose={() => setSelectedClient(null)}
                          onWhatsApp={() => openWhatsApp(selectedClient)}
                          onDelete={() => deleteClient(selectedClient.id)}
                          onViewFullProfile={() => {
                            setFullProfileClient(selectedClient);
                            setSelectedClient(null);
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ==================== Client Form ==================== */
function ClientForm({
  client,
  properties,
  onClose,
  onSave,
}: {
  client: CRMClientData | null;
  properties: any[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!client;
  const [form, setForm] = useState({
    firstName: client?.firstName ?? "",
    lastName: client?.lastName ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    locality: client?.locality ?? "",
    propertiesInterest: client?.propertiesInterest ?? [],
    notes: client?.notes ?? "",
    nextContactDate: client?.nextContactDate
      ? new Date(client.nextContactDate).toISOString().split("T")[0]
      : "",
    nextContactNote: client?.nextContactNote ?? "",
  });
  const [saving, setSaving] = useState(false);

  const update = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleInterest = (interest: string) => {
    setForm(prev => ({
      ...prev,
      propertiesInterest: prev.propertiesInterest.includes(interest)
        ? prev.propertiesInterest.filter(i => i !== interest)
        : [...prev.propertiesInterest, interest],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/crm/clients/${client!.id}`
        : "/api/crm/clients";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          nextContactDate: form.nextContactDate || null,
        }),
      });
      if (res.ok) {
        toast.success(isEdit ? "Cliente actualizado" : "Cliente creado");
        onSave();
      } else {
        const err = await res.json();
        toast.error(err?.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-6"
    >
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {isEdit ? "Editar Cliente" : "Nuevo Cliente"}
            </h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.firstName}
                onChange={e => update("firstName", e.target.value)}
                placeholder="Juan"
              />
            </div>
            <div>
              <Label>Apellido *</Label>
              <Input
                value={form.lastName}
                onChange={e => update("lastName", e.target.value)}
                placeholder="Pérez"
              />
            </div>
            <div>
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={form.email}
                  onChange={e => update("email", e.target.value)}
                  placeholder="juan@email.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Teléfono</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={form.phone}
                  onChange={e => update("phone", e.target.value)}
                  placeholder="+54 11 1234-5678"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Localidad</Label>
              <Input
                value={form.locality}
                onChange={e => update("locality", e.target.value)}
                placeholder="Palermo, Buenos Aires"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Próximo contacto
              </Label>
              <Input
                type="date"
                value={form.nextContactDate}
                onChange={e => update("nextContactDate", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Nota del próximo contacto</Label>
              <Input
                value={form.nextContactNote}
                onChange={e => update("nextContactNote", e.target.value)}
                placeholder="Ej: Llamar para confirmar visita"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Tipo de propiedad de interés</Label>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_INTERESTS.map(interest => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      form.propertiesInterest.includes(interest)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => update("notes", e.target.value)}
                rows={2}
                placeholder="Observaciones sobre el cliente..."
              />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="w-4 h-4 mr-1" />{" "}
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ==================== Client Detail Panel ==================== */
function ClientDetail({
  client,
  onEdit,
  onStageChange,
  onClose,
  onWhatsApp,
  onDelete,
  onViewFullProfile,
}: {
  client: CRMClientData;
  onEdit: () => void;
  onStageChange: (stage: string) => void;
  onClose: () => void;
  onWhatsApp: () => void;
  onDelete: () => void;
  onViewFullProfile: () => void;
}) {
  const stageInfo =
    STAGES_LIST.find(s => s.key === client.stage) ?? STAGES_LIST[0];

  return (
    <Card className="border-0 shadow-lg sticky top-24">
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-lg text-foreground">
              {client.firstName} {client.lastName}
            </h3>
            <Badge className={`${stageInfo.lightColor} text-foreground`}>
              {stageInfo.label}
            </Badge>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onEdit}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Contact actions */}
        <div className="flex gap-2 mb-4">
          {client.phone && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
              onClick={onWhatsApp}
            >
              <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
            </Button>
          )}
          {client.email && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => window.open(`mailto:${client.email}`, "_blank")}
            >
              <Mail className="w-4 h-4 mr-1" /> Email
            </Button>
          )}
        </div>

        {/* Contact info */}
        <div className="space-y-2 mb-4">
          {client.email && (
            <p className="text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> {client.email}
            </p>
          )}
          {client.phone && (
            <p className="text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> {client.phone}
            </p>
          )}
          {client.locality && (
            <p className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> {client.locality}
            </p>
          )}
        </div>

        {/* Next contact */}
        {client.nextContactDate && (
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
            <p className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Calendar className="w-4 h-4" /> Próximo contacto
            </p>
            <p className="text-sm font-bold mt-1">
              {new Date(client.nextContactDate).toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            {client.nextContactNote && (
              <p className="text-xs text-muted-foreground mt-1">
                {client.nextContactNote}
              </p>
            )}
          </div>
        )}

        {/* Interests */}
        {client.propertiesInterest.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
              Intereses
            </p>
            <div className="flex flex-wrap gap-1">
              {client.propertiesInterest.map(p => (
                <span
                  key={p}
                  className="text-xs bg-muted px-2 py-0.5 rounded-full"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {client.notes && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
              Notas
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {client.notes
                .split("\n")
                .filter(line => !line.trim().startsWith("[IA OSINT"))
                .join("\n")
                .trim()}
            </p>
          </div>
        )}

        {/* Activity timeline */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
            <History className="w-3 h-3" /> Actividad
          </p>
          <div className="space-y-3 text-xs max-h-48 overflow-y-auto pr-1">
            {(() => {
              const acts = getUnifiedActivities(client);
              if (acts.length > 0) {
                const log = acts[0];
                return (
                  <div className="flex items-start gap-2 relative">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0 z-10" />
                    <div className="flex-1 pb-2">
                      <p className="font-medium text-foreground line-clamp-1">{log.title}</p>
                      <p className="text-[9px] text-muted-foreground/70 mt-1">
                        {new Date(log.createdAt).toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                );
              } else {
                return <p className="text-muted-foreground text-xs italic">No hay actividad reciente.</p>;
              }
            })()}
          </div>
        </div>

        {/* Stage change */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Cambiar estado
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {STAGES_LIST.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => onStageChange(key)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-all ${
                  client.stage === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={onViewFullProfile}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mb-2"
        >
          Ver Perfil Completo <ChevronRight className="w-4 h-4 ml-1" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 mr-1" /> Eliminar cliente
        </Button>
      </CardContent>
    </Card>
  );
}

/* ==================== Client Profile Component (Level 2) ==================== */
function CRMClientProfile({
  client,
  onClose,
  onEdit,
  onUpdate,
}: {
  client: CRMClientData;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: (updated: CRMClientData) => void;
}) {
  const [activeTab, setActiveTab] = useState("Resumen");
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStep, setEnrichStep] = useState(0);
  const [savingAlert, setSavingAlert] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [tasks, setTasks] = useState<
    { id: string; text: string; done: boolean }[]
  >([
    { id: "1", text: "Enviar propuesta de construcción en seco", done: false },
    { id: "2", text: "Coordinar visita al showroom de Nexa", done: true },
    {
      id: "3",
      text: "Llamar para verificar interés en tipografía moderna",
      done: false,
    },
  ]);
  const [newTaskText, setNewTaskText] = useState("");
  const [chatLog, setChatLog] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);

  const analyzeSteps = [
    "Leyendo transcripción del chat...",
    "Ejecutando motor de Procesamiento del Lenguaje Natural (NLP)...",
    "Detectando análisis de sentimiento y tono del cliente...",
    "Extrayendo intenciones de compra e insights de venta...",
    "Identificando inconsistencias en el perfil técnico del CRM...",
    "Generando recomendaciones estratégicas finales...",
  ];

  const handleAnalyzeChat = async () => {
    if (!chatLog.trim()) return;
    setIsAnalyzing(true);
    setAnalyzeStep(0);

    // Simulate steps animation
    for (let i = 0; i < analyzeSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 800));
      setAnalyzeStep(i + 1);
    }

    try {
      const res = await fetch(`/api/crm/clients/${client.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationText: chatLog }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        toast.success("¡Conversación analizada correctamente!");
      } else {
        toast.error("Error al analizar la conversación");
      }
    } catch {
      toast.error("Error de red al analizar");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySuggestion = async (field: string, value: any) => {
    try {
      const bodyData: any = {};
      bodyData[field] = value;

      const currentSuggestions = JSON.parse(
        client.suggestedProfileChanges ?? "[]"
      );
      const updatedSuggestions = currentSuggestions.filter(
        (s: any) => s.field !== field
      );
      bodyData.suggestedProfileChanges = JSON.stringify(updatedSuggestions);

      const res = await fetch(`/api/crm/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        toast.success("Campo actualizado con éxito");
      } else {
        toast.error("Error al actualizar campo");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const handleApplyAllSuggestions = async () => {
    try {
      const currentSuggestions = JSON.parse(
        client.suggestedProfileChanges ?? "[]"
      );
      if (currentSuggestions.length === 0) return;

      const bodyData: any = {};
      currentSuggestions.forEach((s: any) => {
        if (s.field === "propertiesInterest") {
          bodyData.propertiesInterest = s.rawData;
        } else {
          bodyData[s.field] = s.suggested;
        }
      });
      bodyData.suggestedProfileChanges = JSON.stringify([]);

      const res = await fetch(`/api/crm/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        toast.success("Todos los cambios sugeridos fueron aplicados");
      } else {
        toast.error("Error al aplicar cambios");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const socialLinks = useMemo(() => {
    try {
      return JSON.parse(client.socialLinks ?? "{}");
    } catch {
      return {};
    }
  }, [client.socialLinks]);

  const enrichmentResult = useMemo(() => {
    try {
      return JSON.parse(client.insights ?? "null");
    } catch {
      return null;
    }
  }, [client.insights]);

  const insightsList = enrichmentResult?.insights || [];
  const profileDetails = enrichmentResult?.profileDetails;
  const socialMetrics = profileDetails?.socialMetrics || [];
  const phoneAssociations = profileDetails?.phoneAssociations || [];

  const alerts = useMemo(() => {
    try {
      return JSON.parse(client.alerts ?? "{}");
    } catch {
      return {
        jobChange: false,
        companyChange: false,
        newLinkedInPost: false,
        newsAppearance: false,
        cityChange: false,
      };
    }
  }, [client.alerts]);

  const enrichSteps = [
    "Iniciando Web Scraping de fuentes públicas...",
    "Buscando perfil profesional en LinkedIn...",
    "Escaneando publicaciones en Instagram y Facebook...",
    "Extrayendo datos de empresa e intereses...",
    "Procesando insights de IA y configurando alertas...",
  ];

  const handleEnrich = async () => {
    setIsEnriching(true);
    setEnrichStep(0);

    // Simulate steps animation up to step 4 while waiting
    const interval = setInterval(() => {
      setEnrichStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 2500);

    try {
      const res = await fetch(`/api/crm/clients/${client.id}/enrich`, {
        method: "POST",
      });
      
      if (res.ok) {
        const { runId } = await res.json();
        
        const eventSource = new EventSource(`/api/osint/stream?runId=${runId}`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.type === "completed") {
            clearInterval(interval);
            setEnrichStep(5);
            setTimeout(() => {
              toast.success("¡Perfil enriquecido con éxito!");
              eventSource.close();
              fetch(`/api/crm/clients/${client.id}`)
                .then(r => r.json())
                .then(updated => {
                   if(updated) onUpdate(updated);
                });
              setIsEnriching(false);
            }, 1000);
          } else if (data.type === "error") {
            clearInterval(interval);
            toast.error(`Error: ${data.message}`);
            eventSource.close();
            setIsEnriching(false);
          }
        };

        eventSource.onerror = () => {
          clearInterval(interval);
          eventSource.close();
          setIsEnriching(false);
          toast.error("Conexión perdida. Verifica en unos minutos.");
        };
      } else {
        clearInterval(interval);
        toast.error("Error al iniciar enriquecimiento");
        setIsEnriching(false);
      }
    } catch (e) {
      clearInterval(interval);
      toast.error("Error de red al enriquecer");
      setIsEnriching(false);
    }
  };

  const handleToggleAlert = async (alertKey: string) => {
    setSavingAlert(true);
    const newAlerts = { ...alerts, [alertKey]: !alerts[alertKey] };
    try {
      const res = await fetch(`/api/crm/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: JSON.stringify(newAlerts) }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        toast.success("Configuración de alerta actualizada");
      } else {
        toast.error("Error al guardar alerta");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingAlert(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!newNote.trim()) return;
    const dateStr = new Date().toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const log = `\n[Nota - ${dateStr}] ${newNote.trim()}`;
    const updatedNotes = client.notes ? `${client.notes}${log}` : log.trim();
    try {
      const res = await fetch(`/api/crm/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: updatedNotes }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        setNewNote("");
        toast.success("Nota agregada");
      }
    } catch {
      toast.error("Error al guardar nota");
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    setTasks(prev => [
      ...prev,
      { id: Date.now().toString(), text: newTaskText.trim(), done: false },
    ]);
    setNewTaskText("");
    toast.success("Tarea agregada");
  };

  const handleToggleTask = (id: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const handleDeleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const stageInfo =
    STAGES_LIST.find(s => s.key === client.stage) ?? STAGES_LIST[0];

  const tabs = [
    { name: "Resumen", icon: History },
    { name: "Información", icon: Users },
    { name: "Actividad", icon: Activity },
    { name: "IA - Perfil Inteligente", icon: Sparkles, badge: "Nuevo" },
    { name: "Redes Sociales", icon: Globe },
    { name: "Documentos", icon: FileText },
    { name: "Alertas", icon: Bell },
    { name: "Tareas", icon: CheckCircle2 },
    { name: "Notas", icon: FileText },
    { name: "Configuración", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-border/40">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={onClose}
            className="hover:text-primary transition-colors"
          >
            CRM
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <button
            onClick={onClose}
            className="hover:text-primary transition-colors"
          >
            Clientes
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">
            {client.firstName} {client.lastName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver al Tablero
          </Button>
          <Button
            size="sm"
            onClick={onEdit}
            className="bg-primary text-primary-foreground hover:bg-primary/95"
          >
            <Edit2 className="w-4 h-4 mr-2" /> Editar Cliente
          </Button>
        </div>
      </div>

      {/* Profile Header */}
      <Card className="border-0 shadow-sm bg-card overflow-hidden relative">
        <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              {client.avatarUrl ? (
                <img
                  src={client.avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 text-primary font-bold text-2xl flex items-center justify-center border-2 border-primary/20">
                  {client.firstName[0]}
                  {client.lastName[0]}
                </div>
              )}
              {client.lastEnriched && (
                <div
                  className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-1 border border-card"
                  title="Verificado con IA"
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-foreground">
                  {client.firstName} {client.lastName}
                </h2>
                <Badge
                  className={`${stageInfo.lightColor} text-foreground border-border/20`}
                >
                  {stageInfo.label}
                </Badge>
                {client.lastEnriched ? (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-0 flex items-center gap-1 font-semibold">
                    <Sparkle className="w-3 h-3 fill-current" /> Cliente
                    enriquecido
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground border-dashed"
                  >
                    Sin enriquecer
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
                {client.profession ? (
                  <span>
                    {client.profession} •{" "}
                    <span className="font-semibold">
                      {client.company || "Independiente"}
                    </span>
                  </span>
                ) : (
                  <span>Profesión no registrada</span>
                )}
                {client.locality && (
                  <>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-primary" />{" "}
                      {client.locality}
                    </span>
                  </>
                )}
              </p>
              {/* Quick links */}
              <div className="flex gap-4 mt-3 text-sm">
                {client.phone && (
                  <a
                    href={`https://wa.me/${client.phone.replace(/[^\d+]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-600 dark:text-green-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                )}
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <Mail className="w-4 h-4" /> Email
                  </a>
                )}
                {client.phone && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Phone className="w-4 h-4" /> {client.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <span className="text-xs text-muted-foreground">
              {client.lastEnriched ? (
                <span>
                  Último análisis IA:{" "}
                  {new Date(client.lastEnriched).toLocaleDateString("es-AR")}
                </span>
              ) : (
                <span>Sin análisis de IA</span>
              )}
            </span>
            <Button
              onClick={handleEnrich}
              disabled={isEnriching}
              className="bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-2 shadow-md relative overflow-hidden"
            >
              {isEnriching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando en redes...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Actualizar con IA
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-1">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.name;
            return (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-3">
                  <TabIcon className="w-4 h-4" />
                  {tab.name}
                </span>
                {tab.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-primary-foreground text-primary font-bold"
                        : "bg-primary/10 text-primary font-bold"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Scraping overlay when enriching */}
          <AnimatePresence>
            {isEnriching && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-card/90 backdrop-blur-sm border border-primary/20 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-lg min-h-[400px]"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-lg text-foreground">
                    Buscando información en la web...
                  </h4>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Buscando coincidencias de correo, teléfono y nombre en redes
                    sociales y perfiles públicos para estructurar el perfil del
                    lead.
                  </p>
                </div>
                <div className="bg-muted/50 border rounded-lg p-3 text-left w-full max-w-sm space-y-2">
                  {enrichSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      {enrichStep > idx ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : enrichStep === idx ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border flex-shrink-0" />
                      )}
                      <span
                        className={
                          enrichStep >= idx
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isEnriching && (
            <>
              {activeTab === "Resumen" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column */}
                  <div className="md:col-span-1 space-y-6">
                    {/* Información Principal */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5 space-y-4">
                        <h3 className="font-bold text-base border-b pb-2 border-border/40 text-foreground">
                          Información principal
                        </h3>
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">
                              Email
                            </span>
                            <span className="font-medium text-foreground truncate block">
                              {client.email || "No especificado"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">
                              Teléfono
                            </span>
                            <span className="font-medium text-foreground">
                              {client.phone || "No especificado"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">
                              Ubicación
                            </span>
                            <span className="font-medium text-foreground">
                              {client.locality || "No especificada"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">
                              Fecha de nacimiento
                            </span>
                            <span className="font-medium text-foreground">
                              No registrada
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">
                              Estado
                            </span>
                            <Badge className="bg-primary/10 text-primary border-0 mt-1">
                              {stageInfo.label}
                            </Badge>
                          </div>
                          {client.nextContactDate && (
                            <div>
                              <span className="text-muted-foreground block text-xs">
                                Próximo contacto
                              </span>
                              <span className="font-semibold text-orange-600 dark:text-orange-400 block mt-0.5">
                                {new Date(
                                  client.nextContactDate
                                ).toLocaleDateString("es-AR", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                              {client.nextContactNote && (
                                <p className="text-xs text-muted-foreground mt-1 bg-orange-50 dark:bg-orange-950/20 p-2 rounded border border-orange-100 dark:border-orange-900/30">
                                  {client.nextContactNote}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {enrichmentResult && (
                      <Card className="border-0 shadow-sm">
                        <CardContent className="p-5 space-y-4">
                          <div className="flex items-center justify-between border-b pb-2 border-border/40">
                            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-amber-500" />{" "}
                              Perfil enriquecido OSINT
                            </h3>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                            >
                              {enrichmentResult.identity?.verified
                                ? "Verificado"
                                : "Parcial"}
                            </Badge>
                          </div>
                          <div className="space-y-3 text-sm">
                            {profileDetails?.detectedCompany?.value && (
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Empresa pública detectada
                                </span>
                                <a
                                  href={
                                    profileDetails.detectedCompany.sourceUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  {profileDetails.detectedCompany.value}{" "}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                            {profileDetails?.detectedRole?.value && (
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Cargo / rol público
                                </span>
                                <span className="font-medium text-foreground">
                                  {profileDetails.detectedRole.value}
                                </span>
                              </div>
                            )}
                            {profileDetails?.currentLocation?.value && (
                              <div>
                                <span className="text-muted-foreground block text-xs">
                                  Ubicación según fuentes
                                </span>
                                <span className="font-medium text-foreground">
                                  {profileDetails.currentLocation.value}
                                </span>
                              </div>
                            )}
                            {profileDetails?.experience?.length > 0 && (
                              <div>
                                <span className="text-muted-foreground block text-xs mb-1">
                                  Experiencia detectada
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {profileDetails.experience
                                    .slice(0, 3)
                                    .map((e: any) => (
                                      <Badge
                                        key={e.value}
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {e.value}
                                      </Badge>
                                    ))}
                                </div>
                              </div>
                            )}
                            {socialMetrics.length > 0 && (
                              <div>
                                <span className="text-muted-foreground block text-xs mb-1">
                                  Métricas sociales
                                </span>
                                <div className="space-y-1">
                                  {socialMetrics.map((m: any, idx: number) => (
                                    <a
                                      key={idx}
                                      href={m.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-primary hover:underline block"
                                    >
                                      {m.followers
                                        ? `${m.followers} seguidores`
                                        : "Instagram"}
                                      {m.following
                                        ? ` · ${m.following} siguiendo`
                                        : ""}
                                      {m.posts ? ` · ${m.posts} posts` : ""}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {phoneAssociations.length > 0 && (
                              <div>
                                <span className="text-muted-foreground block text-xs mb-1">
                                  Asociaciones públicas por teléfono
                                </span>
                                <div className="space-y-2">
                                  {phoneAssociations
                                    .slice(0, 4)
                                    .map((item: any, idx: number) => (
                                      <a
                                        key={`${item.url}-${idx}`}
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block rounded-lg border border-border/60 p-2 hover:bg-muted/40 transition-colors"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-medium text-primary line-clamp-1">
                                            {item.title || item.source}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] shrink-0"
                                          >
                                            {item.confidence}%
                                          </Badge>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          <Badge
                                            variant="secondary"
                                            className="text-[10px]"
                                          >
                                            {item.category}
                                          </Badge>
                                          <span className="text-[10px] text-muted-foreground">
                                            {item.source}
                                          </span>
                                        </div>
                                        {item.matchReasons?.length > 0 && (
                                          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                                            {item.matchReasons.join(" · ")}
                                          </p>
                                        )}
                                      </a>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Actividad Reciente */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <h3 className="font-bold text-base border-b pb-2 border-border/40 text-foreground mb-4">
                          Actividad reciente
                        </h3>
                        <div className="space-y-4 relative pl-4 border-l border-border/60">
                          {client.lastEnriched && (
                            <div className="relative text-xs">
                              <div className="absolute -left-[21px] top-1 bg-amber-500 rounded-full w-2 h-2" />
                              <p className="font-semibold text-foreground">
                                IA encontró perfil en redes
                              </p>
                              <p className="text-muted-foreground mt-0.5">
                                Se mapeó LinkedIn, Instagram y Facebook
                              </p>
                              <span className="text-[10px] text-muted-foreground block mt-1">
                                {new Date(
                                  client.lastEnriched
                                ).toLocaleDateString("es-AR")}
                              </span>
                            </div>
                          )}
                          <div className="relative text-xs">
                            <div className="absolute -left-[21px] top-1 bg-primary rounded-full w-2 h-2" />
                            <p className="font-semibold text-foreground">
                              Cliente creado en CRM
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              Creado por asesor asignado
                            </p>
                            <span className="text-[10px] text-muted-foreground block mt-1">
                              {new Date(client.createdAt).toLocaleDateString(
                                "es-AR"
                              )}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Middle Column */}
                  <div className="md:col-span-1 space-y-6">
                    {/* IA Perfil Inteligente */}
                    <Card className="border-0 shadow-sm relative overflow-hidden">
                      {enrichmentResult && (
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-bl-full flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-amber-500 -mr-4 -mt-4" />
                        </div>
                      )}
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-center justify-between border-b pb-2 border-border/40">
                          <h3 className="font-bold text-base text-foreground">
                            IA - Perfil Inteligente
                          </h3>
                          {enrichmentResult && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Confianza:{" "}
                              {enrichmentResult.overallConfidence}%
                            </span>
                          )}
                        </div>
                        {enrichmentResult && enrichmentResult.aiAnalysis ? (
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="text-muted-foreground block text-xs">
                                Profesión detectada
                              </span>
                              <span className="font-semibold text-foreground">
                                {client.profession || "Desconocida"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs">
                                Trayectoria
                              </span>
                              <span className="font-medium text-foreground">
                                {
                                  enrichmentResult.aiAnalysis
                                    .professionalProfile
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs">
                                Empresa
                              </span>
                              <span className="font-medium text-foreground">
                                {client.company || "Independiente"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs">
                                Poder adquisitivo estimado
                              </span>
                              <span className="font-medium text-green-600 dark:text-green-400">
                                {
                                  enrichmentResult.aiAnalysis
                                    .estimatedPurchasingPower.value
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs mb-1.5">
                                Intereses detectados por IA
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {enrichmentResult.aiAnalysis.interests.length >
                                0 ? (
                                  enrichmentResult.aiAnalysis.interests.map(
                                    (p: string) => (
                                      <Badge
                                        key={p}
                                        variant="outline"
                                        className="text-xs bg-amber-50/50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
                                      >
                                        {p}
                                      </Badge>
                                    )
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">
                                    No detectados
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground space-y-3">
                            <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                            <p className="text-xs">
                              Usa el enriquecimiento con IA para investigar y
                              estructurar datos reales sobre el prospecto.
                            </p>
                            <Button
                              size="sm"
                              onClick={handleEnrich}
                              disabled={isEnriching}
                              variant="outline"
                              className="text-xs border-dashed"
                            >
                              Comenzar investigación OSINT
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Redes sociales encontradas */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <h3 className="font-bold text-base border-b pb-2 border-border/40 text-foreground mb-4">
                          Redes sociales
                        </h3>
                        {client.lastEnriched ? (
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[90px] hover:border-primary/40 transition-colors">
                              <Linkedin className="w-5 h-5 text-[#0A66C2]" />
                              <span className="text-muted-foreground font-semibold mt-2 block truncate">
                                {socialLinks.linkedin
                                  ? "LinkedIn /in/..."
                                  : "No detectado"}
                              </span>
                              {socialLinks.linkedin && (
                                <a
                                  href={socialLinks.linkedin}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary font-bold hover:underline mt-1 flex items-center gap-0.5"
                                >
                                  Ver perfil{" "}
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                            <div className="border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[90px] hover:border-primary/40 transition-colors">
                              <Instagram className="w-5 h-5 text-[#E1306C]" />
                              <span className="text-muted-foreground font-semibold mt-2 block truncate">
                                {socialLinks.instagram || "No detectado"}
                              </span>
                              {socialLinks.instagram && (
                                <span className="text-primary font-bold hover:underline mt-1 cursor-pointer">
                                  Ver perfil
                                </span>
                              )}
                            </div>
                            <div className="border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[90px] hover:border-primary/40 transition-colors">
                              <Facebook className="w-5 h-5 text-[#1877F2]" />
                              <span className="text-muted-foreground font-semibold mt-2 block truncate">
                                {socialLinks.facebook || "No detectado"}
                              </span>
                              {socialLinks.facebook && (
                                <span className="text-primary font-bold hover:underline mt-1 cursor-pointer">
                                  Ver perfil
                                </span>
                              )}
                            </div>
                            <div className="border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[90px] hover:border-primary/40 transition-colors">
                              <Globe className="w-5 h-5 text-muted-foreground" />
                              <span className="text-muted-foreground font-semibold mt-2 block truncate">
                                {socialLinks.website || "No detectado"}
                              </span>
                              {socialLinks.website && (
                                <a
                                  href={`https://${socialLinks.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary font-bold hover:underline mt-1 flex items-center gap-0.5"
                                >
                                  Visitar{" "}
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            No se han mapeado enlaces de redes sociales.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Column */}
                  <div className="md:col-span-1 space-y-6">
                    {/* Insights Destacados */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <h3 className="font-bold text-base border-b pb-2 border-border/40 text-foreground mb-3">
                          Insights y Alertas
                        </h3>
                        {enrichmentResult && insightsList.length > 0 ? (
                          <ul className="space-y-2.5 text-xs text-foreground">
                            {insightsList.map(
                              (insight: string, idx: number) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{insight}</span>
                                </li>
                              )
                            )}
                            {enrichmentResult.aiAnalysis?.alerts.map(
                              (al: string, idx: number) => (
                                <li
                                  key={`al-${idx}`}
                                  className="flex items-start gap-2"
                                >
                                  <Bell className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <span className="font-medium">{al}</span>
                                </li>
                              )
                            )}
                          </ul>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground text-xs">
                            Realiza el enriquecimiento de IA para obtener
                            insights.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Alertas Activas */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <h3 className="font-bold text-base border-b pb-2 border-border/40 text-foreground mb-4">
                          Alertas activas
                        </h3>
                        <div className="space-y-4 text-xs">
                          {[
                            { key: "jobChange", label: "Cambió de trabajo" },
                            {
                              key: "companyChange",
                              label: "Cambió de empresa",
                            },
                            {
                              key: "newLinkedInPost",
                              label: "Nueva publicación en LinkedIn",
                            },
                            {
                              key: "newsAppearance",
                              label: "Apareció en noticias",
                            },
                            { key: "cityChange", label: "Cambio de ciudad" },
                          ].map(alertOption => {
                            const isChecked =
                              (alerts as any)[alertOption.key] ?? false;
                            return (
                              <div
                                key={alertOption.key}
                                className="flex items-center justify-between"
                              >
                                <span className="font-medium text-foreground">
                                  {alertOption.label}
                                </span>
                                <button
                                  type="button"
                                  disabled={savingAlert}
                                  onClick={() =>
                                    handleToggleAlert(alertOption.key)
                                  }
                                  className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                                    isChecked
                                      ? "bg-primary"
                                      : "bg-muted border border-border"
                                  }`}
                                >
                                  <div
                                    className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform ${
                                      isChecked
                                        ? "translate-x-4"
                                        : "translate-x-0"
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === "Información" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4">
                      Detalles del cliente
                    </h3>
                    <div className="grid grid-cols-2 gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Nombre
                        </span>
                        <span className="font-semibold text-foreground text-base mt-1 block">
                          {client.firstName}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Apellido
                        </span>
                        <span className="font-semibold text-foreground text-base mt-1 block">
                          {client.lastName}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Email
                        </span>
                        <span className="font-medium text-foreground mt-1 block">
                          {client.email || "No registrado"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Teléfono
                        </span>
                        <span className="font-medium text-foreground mt-1 block">
                          {client.phone || "No registrado"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Ubicación
                        </span>
                        <span className="font-medium text-foreground mt-1 block">
                          {client.locality || "No especificada"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs">
                          Estado en CRM
                        </span>
                        <Badge
                          className={`${stageInfo.lightColor} text-foreground border border-border/10 mt-1`}
                        >
                          {stageInfo.label}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground block text-xs">
                          Intereses registrados
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {client.propertiesInterest.length > 0 ? (
                            client.propertiesInterest.map(p => (
                              <Badge key={p} variant="secondary">
                                {p}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              Ningún tipo de propiedad asignado
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground block text-xs mb-1">
                          Notas globales
                        </span>
                        <div className="text-sm text-foreground bg-muted/40 p-4 rounded-xl border whitespace-pre-wrap">
                          {client.notes
                            ? client.notes.split('\n').filter(line => !line.trim().startsWith('[IA OSINT')).join('\n').trim() || "Sin notas registradas."
                            : "Sin notas registradas."}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "Actividad" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4">
                      Registro de actividad
                    </h3>
                    <div className="space-y-4 pl-4 border-l-2 border-primary/20 relative">
                      {getUnifiedActivities(client).map((event: CRMActivityLog) => {
                        const dotColor =
                          event.type === "osint_enrichment"
                            ? "bg-amber-500"
                            : event.type === "created"
                              ? "bg-blue-500"
                              : event.type === "status_changed"
                                ? "bg-emerald-500"
                                : "bg-primary";

                        return (
                          <div key={event.id} className="relative text-sm">
                            <div
                              className={`absolute -left-[25px] top-1.5 w-3 h-3 rounded-full ${dotColor}`}
                            />
                            <span className="text-muted-foreground text-xs block">
                              {new Date(event.createdAt).toLocaleString(
                                "es-AR"
                              )}
                            </span>
                            <span className="font-bold text-foreground">
                              {event.title}
                            </span>
                            {event.description && (
                              <p className="text-muted-foreground text-xs mt-0.5">
                                {event.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}



              {activeTab === "IA - Perfil Inteligente" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500 fill-current" />{" "}
                      Inteligencia Artificial OSINT
                    </h3>
                    {enrichmentResult && enrichmentResult.aiAnalysis ? (
                      <div className="space-y-6">
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div>
                            <h4 className="font-bold text-amber-800 dark:text-amber-400">
                              Perfil Analizado con IA
                            </h4>
                            <p className="text-muted-foreground text-xs mt-0.5">
                              Pipeline estructurado con verificación cruzada de
                              fuentes abiertas.
                            </p>
                          </div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-900/50 flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4" /> Confianza
                            General: {enrichmentResult.overallConfidence}%
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">¿Es útil esto?</span>
                            <button onClick={() => {
                              fetch("/api/osint/feedback", {
                                method: "POST",
                                body: JSON.stringify({ runId: enrichmentResult.enrichmentId, field: "ai_analysis", isCorrect: true })
                              });
                              toast.success("Feedback enviado. ¡Gracias!");
                            }} className="text-muted-foreground hover:text-green-500 p-1 bg-white dark:bg-black rounded border"><ThumbsUp className="w-4 h-4" /></button>
                            <button onClick={() => {
                              fetch("/api/osint/feedback", {
                                method: "POST",
                                body: JSON.stringify({ runId: enrichmentResult.enrichmentId, field: "ai_analysis", isCorrect: false })
                              });
                              toast.success("Feedback enviado. ¡Gracias!");
                            }} className="text-muted-foreground hover:text-red-500 p-1 bg-white dark:bg-black rounded border"><ThumbsDown className="w-4 h-4" /></button>
                          </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-muted/30 p-4 rounded-xl border">
                          <h4 className="font-bold text-foreground text-sm mb-2">
                            Resumen Ejecutivo
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {enrichmentResult.aiAnalysis.summary}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                          <div className="space-y-3">
                            <h4 className="font-bold border-b pb-1 text-foreground">
                              Oportunidades de Venta
                            </h4>
                            <ul className="space-y-2">
                              {enrichmentResult.aiAnalysis.salesOpportunities
                                .length > 0 ? (
                                enrichmentResult.aiAnalysis.salesOpportunities.map(
                                  (op: string, i: number) => (
                                    <li
                                      key={i}
                                      className="flex gap-2 text-muted-foreground text-xs"
                                    >
                                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />{" "}
                                      {op}
                                    </li>
                                  )
                                )
                              ) : (
                                <li className="text-xs text-muted-foreground italic">
                                  No se detectaron oportunidades claras.
                                </li>
                              )}
                            </ul>
                          </div>
                          <div className="space-y-3">
                            <h4 className="font-bold border-b pb-1 text-foreground">
                              Estrategia sugerida
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {enrichmentResult.aiAnalysis.salesStrategy}
                            </p>
                          </div>
                        </div>

                        {/* Sources */}
                        {enrichmentResult.sources &&
                          enrichmentResult.sources.length > 0 && (
                            <div className="mt-6 border-t pt-4">
                              <h4 className="font-bold text-foreground text-sm mb-3">
                                Fuentes Verificadas Utilizadas
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {enrichmentResult.sources.map(
                                  (s: any, idx: number) => (
                                    <a
                                      key={idx}
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1.5 bg-muted/50 hover:bg-muted border px-2 py-1 rounded text-xs transition-colors"
                                    >
                                      <Globe className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">
                                        {s.name}
                                      </span>
                                      <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 py-0.5 rounded">
                                        {s.reliability}%
                                      </span>
                                    </a>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                        {/* News */}
                        {enrichmentResult.news &&
                          enrichmentResult.news.length > 0 && (
                            <div className="mt-6 border-t pt-4">
                              <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />{" "}
                                Menciones Recientes (Noticias)
                              </h4>
                              <div className="space-y-3">
                                {enrichmentResult.news.map(
                                  (n: any, idx: number) => (
                                    <a
                                      key={idx}
                                      href={n.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block border rounded-lg p-3 hover:border-primary/50 transition-colors bg-card"
                                    >
                                      <div className="flex justify-between items-start mb-1">
                                        <h5 className="font-semibold text-primary text-xs line-clamp-1">
                                          {n.title}
                                        </h5>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] bg-muted/50"
                                        >
                                          {n.category}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {n.snippet}
                                      </p>
                                      <span className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> {n.source}
                                      </span>
                                    </a>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground space-y-4">
                        <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                        <h4 className="font-bold text-foreground">
                          Sin análisis de Inteligencia Artificial
                        </h4>
                        <p className="text-sm max-w-sm mx-auto">
                          Esta función lee e integra el perfil del cliente,
                          busca evidencia y noticias en toda la web para darte
                          insights y estrategias de venta reales.
                        </p>
                        <Button
                          disabled={isEnriching}
                          onClick={handleEnrich}
                          className="bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-2 mx-auto"
                        >
                          <Sparkles className="w-4 h-4" /> Enriquecer ahora
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {activeTab === "Redes Sociales" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4">
                      Enlaces de Redes Sociales
                    </h3>
                    {client.lastEnriched ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border p-4 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Linkedin className="w-6 h-6 text-[#0A66C2]" />
                            <div>
                              <span className="font-semibold text-foreground block">
                                LinkedIn
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {socialLinks.linkedin || "No conectado"}
                              </span>
                            </div>
                          </div>
                          {socialLinks.linkedin && (
                            <a
                              href={socialLinks.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all flex items-center gap-1"
                            >
                              Ir al perfil{" "}
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center justify-between border p-4 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Instagram className="w-6 h-6 text-[#E1306C]" />
                            <div>
                              <span className="font-semibold text-foreground block">
                                Instagram
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {socialLinks.instagram || "No conectado"}
                              </span>
                            </div>
                          </div>
                          {socialLinks.instagram && (
                            <span className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all cursor-pointer">
                              Ir al perfil
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between border p-4 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Facebook className="w-6 h-6 text-[#1877F2]" />
                            <div>
                              <span className="font-semibold text-foreground block">
                                Facebook
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {socialLinks.facebook || "No conectado"}
                              </span>
                            </div>
                          </div>
                          {socialLinks.facebook && (
                            <span className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all cursor-pointer">
                              Ir al perfil
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between border p-4 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Globe className="w-6 h-6 text-muted-foreground" />
                            <div>
                              <span className="font-semibold text-foreground block">
                                Sitio web
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {socialLinks.website || "No conectado"}
                              </span>
                            </div>
                          </div>
                          {socialLinks.website && (
                            <a
                              href={`https://${socialLinks.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all flex items-center gap-1"
                            >
                              Ir al sitio{" "}
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-xs">
                        No hay redes sociales vinculadas a este perfil. Usa la
                        herramienta de enriquecimiento de IA.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {activeTab === "Documentos" && (
                <div className="space-y-6">
                  {/* Documents Dropzone */}
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-foreground">
                            Documentos adjuntos
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Sube presupuestos, planos, contratos u otros
                            archivos del lead.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-dashed"
                      >
                        Subir Archivo
                      </Button>
                    </CardContent>
                  </Card>

                  {/* AI Conversation Importer */}
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 space-y-6">
                      <div className="flex justify-between items-center border-b pb-3">
                        <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                          <MessageCircle className="w-5 h-5 text-primary" />{" "}
                          Importar y Analizar Conversación (IA)
                        </h3>
                        <Badge className="bg-primary/10 text-primary border-0 font-semibold text-xs">
                          Análisis NLP
                        </Badge>
                      </div>

                      {isAnalyzing ? (
                        <div className="bg-muted/30 border rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-sm min-h-[250px]">
                          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                          <div className="space-y-1">
                            <h4 className="font-bold text-sm text-foreground">
                              Analizando conversación...
                            </h4>
                            <p className="text-muted-foreground text-xs max-w-sm">
                              La inteligencia artificial está leyendo la
                              transcripción del chat y buscando cambios de
                              perfil.
                            </p>
                          </div>
                          <div className="bg-background border rounded-lg p-3 text-left w-full max-w-sm space-y-1.5 text-xs">
                            {analyzeSteps.map((step, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2"
                              >
                                {analyzeStep > idx ? (
                                  <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                ) : analyzeStep === idx ? (
                                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border flex-shrink-0" />
                                )}
                                <span
                                  className={
                                    analyzeStep >= idx
                                      ? "text-foreground font-medium"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {step}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Pega un registro de chat (WhatsApp, Email o
                            transcripción de llamada) del cliente. La
                            inteligencia artificial analizará el sentimiento y
                            sugerirá cambios automáticos en el perfil del CRM.
                          </p>
                          <Textarea
                            value={chatLog}
                            onChange={e => setChatLog(e.target.value)}
                            placeholder="Ejemplo:&#10;[Asesor]: Hola Juan, cómo estás?&#10;[Cliente]: Hola! Todo bien. Te quería comentar que estuve pensando en la propuesta. Ahora que asumí como Ingeniero de Software en Mercado Libre nos mudamos a Palermo CABA, por lo que nos interesa un dúplex allá..."
                            rows={5}
                            className="text-xs font-mono bg-muted/20"
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">
                              {chatLog.length} caracteres ingresados
                            </span>
                            <Button
                              onClick={handleAnalyzeChat}
                              disabled={!chatLog.trim()}
                              className="bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-2"
                            >
                              <Sparkles className="w-4 h-4" /> Analizar
                              Conversación
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Display Analysis Results */}
                      {!isAnalyzing && client.conversationSentiment && (
                        <div className="mt-6 border-t pt-6 space-y-6">
                          <h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
                            Resultado del Análisis del Asistente
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Sentiment Card */}
                            <div className="md:col-span-1 border rounded-xl p-4 bg-muted/20 flex flex-col justify-between min-h-[140px]">
                              <div>
                                <span className="text-xs text-muted-foreground font-semibold block uppercase">
                                  Sentimiento del Lead
                                </span>
                                <Badge
                                  className={`mt-2 font-bold ${
                                    client.conversationSentiment.includes(
                                      "Positivo"
                                    )
                                      ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                                  } border-0`}
                                >
                                  {client.conversationSentiment}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                                {client.conversationSentiment.includes(
                                  "Positivo"
                                )
                                  ? "El cliente muestra una predisposición muy favorable para avanzar con el proceso comercial."
                                  : "El cliente se muestra receptivo pero expresa dudas o restricciones financieras."}
                              </p>
                            </div>

                            {/* Recommendations Card */}
                            <div className="md:col-span-2 border rounded-xl p-4 space-y-3">
                              <span className="text-xs text-muted-foreground font-semibold block uppercase">
                                Recomendaciones de Abordaje
                              </span>
                              <ul className="space-y-2">
                                {JSON.parse(
                                  client.conversationAnalysis ?? "[]"
                                ).map((rec: string, idx: number) => (
                                  <li
                                    key={idx}
                                    className="text-xs text-foreground flex items-start gap-2"
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Suggested Profile Updates */}
                          {JSON.parse(client.suggestedProfileChanges ?? "[]")
                            .length > 0 ? (
                            <div className="border rounded-xl overflow-hidden">
                              <div className="bg-primary/5 px-4 py-3 border-b flex justify-between items-center">
                                <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5" /> Cambios
                                  sugeridos en el perfil
                                </span>
                                <Button
                                  size="sm"
                                  onClick={handleApplyAllSuggestions}
                                  className="bg-primary text-primary-foreground text-[10px] h-6 px-2.5 hover:bg-primary/95"
                                >
                                  Aplicar todos los cambios
                                </Button>
                              </div>
                              <div className="divide-y text-xs">
                                {JSON.parse(
                                  client.suggestedProfileChanges ?? "[]"
                                ).map((s: any) => (
                                  <div
                                    key={s.field}
                                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/10"
                                  >
                                    <div className="grid grid-cols-3 gap-2 flex-1 max-w-xl">
                                      <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                                          {s.label}
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {s.label}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                                          Valor Actual
                                        </span>
                                        <span className="text-muted-foreground line-through">
                                          {s.current}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                                          Valor Extraído
                                        </span>
                                        <span className="text-green-600 dark:text-green-400 font-bold">
                                          {s.suggested}
                                        </span>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        handleApplySuggestion(
                                          s.field,
                                          s.field === "propertiesInterest"
                                            ? s.rawData
                                            : s.suggested
                                        )
                                      }
                                      className="border-green-200 text-green-600 hover:bg-green-50 self-start sm:self-center"
                                    >
                                      Aplicar
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted/20 border border-dashed rounded-xl p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              Todos los datos del perfil actual corresponden a
                              los extraídos en la conversación.
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === "Alertas" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4">
                      Configurar Alertas del Lead
                    </h3>
                    <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                      El sistema monitorea redes sociales (como LinkedIn) y
                      portales de noticias para detectar cambios importantes en
                      la situación profesional del cliente. Al activarse,
                      recibirás una notificación en el CRM.
                    </p>
                    <div className="space-y-4 max-w-md">
                      {[
                        {
                          key: "jobChange",
                          label: "Cambió de trabajo",
                          description:
                            "Notificar si detecta un cambio en su puesto laboral.",
                        },
                        {
                          key: "companyChange",
                          label: "Cambió de empresa",
                          description:
                            "Notificar si cambia la constructora u organización donde trabaja.",
                        },
                        {
                          key: "newLinkedInPost",
                          label: "Nueva publicación en LinkedIn",
                          description:
                            "Avisar cuando realice un post público relevante.",
                        },
                        {
                          key: "newsAppearance",
                          label: "Apareció en noticias",
                          description:
                            "Notificar menciones en blogs o portales de noticias.",
                        },
                        {
                          key: "cityChange",
                          label: "Cambio de ciudad",
                          description:
                            "Notificar si actualiza su ciudad o localidad de residencia.",
                        },
                      ].map(alertOption => {
                        const isChecked =
                          (alerts as any)[alertOption.key] ?? false;
                        return (
                          <div
                            key={alertOption.key}
                            className="flex items-start justify-between border-b pb-3"
                          >
                            <div className="space-y-0.5">
                              <span className="font-semibold text-foreground text-sm">
                                {alertOption.label}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {alertOption.description}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={savingAlert}
                              onClick={() => handleToggleAlert(alertOption.key)}
                              className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none flex-shrink-0 ${
                                isChecked
                                  ? "bg-primary"
                                  : "bg-muted border border-border"
                              }`}
                            >
                              <div
                                className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform ${
                                  isChecked ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "Tareas" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3 mb-4">
                      Tareas de seguimiento
                    </h3>

                    <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
                      <Input
                        value={newTaskText}
                        onChange={e => setNewTaskText(e.target.value)}
                        placeholder="Nueva tarea... Ej: Enviar catálogo"
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        className="bg-primary text-primary-foreground hover:bg-primary/95"
                      >
                        Agregar
                      </Button>
                    </form>

                    <div className="space-y-2">
                      {tasks.length > 0 ? (
                        tasks.map(task => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between border p-3 rounded-xl"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleToggleTask(task.id)}
                                className="focus:outline-none"
                              >
                                {task.done ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50" />
                                ) : (
                                  <div className="w-5 h-5 rounded-full border border-border hover:border-primary transition-colors" />
                                )}
                              </button>
                              <span
                                className={`text-sm ${task.done ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}
                              >
                                {task.text}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTask(task.id)}
                              className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-6">
                          No hay tareas creadas para este cliente.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "Notas" && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-lg text-foreground border-b pb-3">
                      Notas internas
                    </h3>

                    <div className="space-y-2">
                      <Label>Agregar nueva nota</Label>
                      <Textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        rows={3}
                        placeholder="Escribe aquí observaciones o detalles del último contacto..."
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveNotes}
                          disabled={!newNote.trim()}
                          className="bg-primary text-primary-foreground hover:bg-primary/95"
                        >
                          Guardar Nota
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-border/40">
                      <Label>Historial de notas y registros</Label>
                      <div className="bg-muted p-4 rounded-xl text-sm whitespace-pre-wrap text-foreground/80">
                        {client.notes
                            ? client.notes.split('\n').filter(line => !line.trim().startsWith('[IA OSINT')).join('\n').trim() || "No hay notas ingresadas todavía."
                            : "No hay notas ingresadas todavía."}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "Configuración" && (
                <Card className="border-0 shadow-sm border-red-200/20 bg-red-50/5 dark:bg-red-950/5">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg text-red-600 dark:text-red-400 border-b pb-3 mb-4">
                      Zona de Peligro
                    </h3>
                    <div className="space-y-4 text-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-border/40">
                        <div>
                          <span className="font-semibold text-foreground block">
                            Eliminar definitivamente
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Esta acción eliminará de forma permanente al cliente
                            y su historial del CRM.
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          className="text-red-500 border-red-200 hover:bg-red-50"
                          onClick={onClose}
                        >
                          Eliminar Cliente
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== Bulk CSV Importer Modal ==================== */
function ImportClientsModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=upload 2=map 3=preview
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    locality: "",
    propertiesInterest: "",
  });
  const [parsedClients, setParsedClients] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const CRM_FIELDS = [
    { key: "firstName", label: "Nombre", required: true },
    { key: "lastName", label: "Apellido", required: true },
    { key: "email", label: "Email", required: false },
    { key: "phone", label: "Teléfono", required: false },
    { key: "locality", label: "Localidad", required: false },
    { key: "propertiesInterest", label: "Intereses", required: false },
  ];

  const downloadTemplate = () => {
    const csvContent =
      "Nombre,Apellido,Email,Telefono,Localidad,Intereses\n" +
      'Juan,Perez,juan@gmail.com,+5491122334455,"Palermo, CABA","Casa; Dúplex"\n' +
      'Maria,Gomez,maria@hotmail.com,+5491166778899,"Nordelta, Tigre",Departamento\n' +
      'Pedro,Rodriguez,pedro@outlook.com,+5491155443322,"Pilar, BA",PH';
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_importar_clientes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const splitCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = splitCSVLine(lines[0]);
      const rows = lines.slice(1).map(l => splitCSVLine(l));
      setRawHeaders(headers);
      setRawRows(rows);

      const AUTO_DETECT: Record<string, string[]> = {
        firstName: [
          "nombre",
          "name",
          "first name",
          "primer nombre",
          "first_name",
        ],
        lastName: [
          "apellido",
          "surname",
          "last name",
          "segundo nombre",
          "last_name",
        ],
        email: ["email", "correo", "mail", "e-mail"],
        phone: [
          "telefono",
          "teléfono",
          "phone",
          "celular",
          "tel",
          "móvil",
          "movil",
          "number",
          "número",
        ],
        locality: [
          "localidad",
          "ciudad",
          "location",
          "city",
          "lugar",
          "barrio",
        ],
        propertiesInterest: [
          "intereses",
          "interests",
          "propiedad",
          "interest",
          "tipo",
        ],
      };
      const detected: Record<string, string> = {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        locality: "",
        propertiesInterest: "",
      };
      headers.forEach(h => {
        const normalized = h.toLowerCase().trim();
        for (const [field, aliases] of Object.entries(AUTO_DETECT)) {
          if (!detected[field] && aliases.some(a => normalized.includes(a))) {
            detected[field] = h;
          }
        }
      });
      setColumnMap(detected);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const applyMapping = () => {
    const idxOf = (header: string) => rawHeaders.indexOf(header);
    const clients: any[] = [];
    rawRows.forEach(row => {
      const get = (field: string) => {
        const h = columnMap[field];
        if (!h) return "";
        const idx = idxOf(h);
        return idx >= 0 ? (row[idx] ?? "").trim() : "";
      };
      const firstName = get("firstName");
      const lastName = get("lastName");
      if (!firstName && !lastName) return;
      clients.push({
        firstName: firstName || "(sin nombre)",
        lastName: lastName || "",
        email: get("email"),
        phone: get("phone"),
        locality: get("locality"),
        propertiesInterest: get("propertiesInterest")
          ? get("propertiesInterest")
              .split(";")
              .map((x: string) => x.trim())
              .filter(Boolean)
          : [],
        stage: "new_lead",
        notes: "Importado de forma masiva.",
      });
    });
    setParsedClients(clients);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (parsedClients.length === 0) {
      toast.error("No hay clientes válidos para importar");
      return;
    }
    setIsImporting(true);
    try {
      const res = await fetch("/api/crm/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clients: parsedClients }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(
          `Se importaron ${result.importedCount} clientes con éxito`
        );
        if (result.errorsCount > 0)
          toast.warning(`Hubo ${result.errorsCount} errores al procesar filas`);
        onSave();
      } else {
        toast.error("Error al enviar archivo de importación");
      }
    } catch {
      toast.error("Error de red al importar");
    } finally {
      setIsImporting(false);
    }
  };

  const STEP_LABELS = ["Subir archivo", "Mapear columnas", "Confirmar"];

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-card rounded-2xl shadow-xl overflow-hidden border border-border"
      >
        <div className="bg-primary px-6 py-4 flex justify-between items-center text-primary-foreground">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" /> Importar Contactos Masivos (CSV)
          </h3>
          <button
            onClick={onClose}
            className="text-primary-foreground/80 hover:text-primary-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div
                key={n}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${active ? "text-primary border-b-2 border-primary" : done ? "text-green-500" : "text-muted-foreground"}`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-green-500 text-white border-green-500" : "border-border"}`}
                >
                  {done ? "✓" : n}
                </span>
                {label}
              </div>
            );
          })}
        </div>

        <CardContent className="p-6 space-y-5">
          {step === 1 && (
            <>
              <div className="flex flex-col sm:flex-row justify-between gap-4 border-b pb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Instrucciones de formato
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    Cargá cualquier archivo CSV. En el siguiente paso podrás
                    asignar qué columna va en cada campo del CRM.
                  </p>
                </div>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  className="text-xs self-start"
                >
                  Descargar Plantilla CSV
                </Button>
              </div>
              <div className="border-2 border-dashed border-border rounded-xl p-10 text-center space-y-4 hover:border-primary/50 transition-colors relative">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Arrastra tu archivo CSV aquí
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    O haz clic para seleccionar de tu ordenador (.csv, .txt)
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Asignar columnas del archivo
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Elegí qué columna de tu CSV corresponde a cada campo del
                    CRM. Los campos detectados automáticamente están
                    pre-seleccionados.
                  </p>
                </div>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full flex-shrink-0">
                  {rawRows.length} filas detectadas
                </span>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b text-muted-foreground font-semibold">
                      <th className="p-3 text-left">Campo del CRM</th>
                      <th className="p-3 text-left">Columna de tu archivo</th>
                      <th className="p-3 text-left text-muted-foreground/70">
                        Ejemplo (fila 1)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {CRM_FIELDS.map(field => {
                      const selectedHeader = columnMap[field.key];
                      const exampleIdx = rawHeaders.indexOf(selectedHeader);
                      const example =
                        exampleIdx >= 0 && rawRows[0]
                          ? rawRows[0][exampleIdx]
                          : "—";
                      return (
                        <tr key={field.key} className="hover:bg-muted/20">
                          <td className="p-3">
                            <span className="font-semibold text-foreground">
                              {field.label}
                            </span>
                            {field.required && (
                              <span className="ml-1 text-red-500">*</span>
                            )}
                          </td>
                          <td className="p-3">
                            <select
                              value={columnMap[field.key]}
                              onChange={e =>
                                setColumnMap(prev => ({
                                  ...prev,
                                  [field.key]: e.target.value,
                                }))
                              }
                              className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground w-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                              <option value="">(No importar)</option>
                              {rawHeaders.map(h => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-muted-foreground truncate max-w-[140px]">
                            <span className="italic">{example}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep(1);
                    setRawHeaders([]);
                    setRawRows([]);
                    setFileName("");
                  }}
                >
                  ← Volver
                </Button>
                <Button
                  onClick={applyMapping}
                  disabled={!columnMap.firstName && !columnMap.lastName}
                  className="bg-primary text-primary-foreground hover:bg-primary/95"
                >
                  Ver previsualización →
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex justify-between items-center bg-muted/50 border p-3 rounded-xl">
                <span className="text-sm font-medium text-foreground truncate max-w-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" /> {fileName}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => {
                    setStep(2);
                  }}
                >
                  ← Cambiar mapeo
                </Button>
              </div>

              <div className="border rounded-xl overflow-hidden max-h-[260px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted border-b text-muted-foreground font-semibold sticky top-0">
                      <th className="p-2.5">Nombre completo</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">Teléfono</th>
                      <th className="p-2.5">Localidad</th>
                      <th className="p-2.5">Intereses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedClients.map((c, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/30">
                        <td className="p-2.5 font-semibold text-foreground">
                          {c.firstName} {c.lastName}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {c.email || "—"}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {c.phone || "—"}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {c.locality || "—"}
                        </td>
                        <td className="p-2.5">
                          <div className="flex flex-wrap gap-1">
                            {c.propertiesInterest.map((p: string) => (
                              <span
                                key={p}
                                className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                {parsedClients.length} contactos listos para importar.
              </p>

              <div className="flex justify-between items-center pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  ← Cambiar mapeo
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isImporting || parsedClients.length === 0}
                  className="bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-2"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isImporting
                    ? "Importando..."
                    : `Confirmar e Importar (${parsedClients.length})`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </motion.div>
    </div>
  );
}
