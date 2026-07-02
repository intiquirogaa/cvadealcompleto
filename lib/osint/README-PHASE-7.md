# OSINT Provider Registry + Real APIs - Phase 7

## 🎯 **COMPLETADO - PRODUCTION READY**

Sistema completo de Provider Registry con APIs reales, scoring dinámico y selección automática de providers.

## 📊 **ARQUITECTURA IMPLEMENTADA**

### 1. **Provider Registry CORE** ✅
```typescript
// Sistema de plugins con discovery automático por capability
interface OSINTProvider {
  id: string;
  name: string;  
  category: ProviderCategory;
  capabilities: ProviderCapability[];
  reliabilityScore?: number;
  costPerRequest?: number;
  priority?: number;
  
  search(query: ProviderQuery, ctx: ProviderContext): Promise<ProviderResult[]>;
  healthCheck(): Promise<boolean>;
  getMetrics?(): Promise<ProviderMetrics>;
  estimateCost?(query: ProviderQuery): number;
}
```

**Funciones del Registry:**
- ✅ `registerProvider()` - Auto-registro con validación
- ✅ `getByCapability()` - Discovery por capability  
- ✅ `selectProviders()` - Selección inteligente con scoring
- ✅ `executeWithFallback()` - Fallback automático
- ✅ `getHealthyProviders()` - Filtrado por health status

### 2. **Normalization Layer** ✅
```typescript
// Formato común para todos los providers
type NormalizedResult = {
  url: string;
  title: string;
  snippet: string;
  fetchedAt: string;
  publishedAt?: string;
  structuredData?: Record<string, any>;
};
```

### 3. **Providers de Producción** ✅

#### **Search Providers**
- ✅ **Bing Search API** (oficial) - Reemplaza HTML scraping
- ✅ **Google Custom Search JSON API** - Alta calidad, estructura
- ✅ **NewsAPI.org** - 80k fuentes, tiempo real

#### **Identity Provider** 
- ✅ **Proxycurl LinkedIn API** - Datos estructurados profesionales

#### **Web Fetcher**
- ✅ **Robust HTML Fetcher** con:
  - robots.txt compliance
  - structured data extraction (schema.org)  
  - readability extraction
  - content sanitization

### 4. **Provider Scoring System** ✅

**Scoring Formula:**
```
score = (reliability × 0.35) + (cost × 0.20) + (latency × 0.15) + (successRate × 0.20) + (priority × 0.10)
```

**Factores:**
- **Reliability** (0-100): Basado en histórico + circuit breaker
- **Cost** (0-100): Inverted cost score vs budget
- **Latency** (0-100): Velocidad de respuesta (<500ms = 100)  
- **Success Rate** (0-100): Éxito reciente (24h)
- **Priority** (0-100): Score estático del provider

**Selection Logic:**
1. Score all capable providers
2. Apply filters (budget, latency, reliability)
3. Boost preferred providers  
4. Create fallback chain (top 3)
5. Execute with automatic fallback

### 5. **Registry + Planner Integration** ✅

```typescript
// El Planner ahora usa selección inteligente
const execution = await ctx.providers.executeWithFallback(query, {
  capability: "web_search",
  budget: 0.01,
  maxLatency: 10000,
  minReliability: 60,
  preferredProviders: ["bing_search_api"]
});

// Audit trail automático
providerScoringEngine.logDecision(
  capability,
  selectedProviders,  
  fallbackChain,
  executionResults,
  finalChoice
);
```

### 6. **Observabilidad** ✅

**Cada ejecución registra:**
- Provider seleccionado + razón
- Alternativas descartadas  
- Latency + success/failure
- Costo + ROI
- Fallback chain usado

**Métricas por Provider:**
```typescript
{
  avgLatencyMs: 400,
  successRate: 0.98, 
  errorCount24h: 1,
  costPerRequest: 0.001,
  circuitState: "closed"
}
```

## 🚀 **PROVIDERS CONFIGURADOS**

### Production APIs (Enabled)
1. **bing_search_api** - Priority 90, $0.001/call
2. **google_cse** - Priority 85, $0.005/call  
3. **newsapi_org** - Priority 85, $0.0001/call
4. **proxycurl_linkedin** - Priority 75, $0.02/call
5. **web_fetcher** - Priority 80, FREE

### Legacy (Disabled)
- bing_legacy - HTML scraping (deprecated)
- duckduckgo_legacy - Unreliable scraping (deprecated)

## 📈 **ESCALABILIDAD A 20+ PROVIDERS**

### **Plugin Architecture**
```bash
lib/osint/core/providers/
├── search/
│   ├── bing-search-api.provider.ts
│   ├── google-cse.provider.ts  
│   └── serper-google.provider.ts      # FUTURE
├── news/
│   ├── newsapi.provider.ts
│   └── gnews.provider.ts              # FUTURE  
├── identity/
│   ├── proxycurl-linkedin.provider.ts
│   ├── clearbit.provider.ts           # FUTURE
│   └── pipl.provider.ts               # FUTURE
├── social/  
│   ├── twitter-api.provider.ts        # FUTURE
│   └── instagram-api.provider.ts      # FUTURE
└── provider.factory.ts                # AUTO-DISCOVERY
```

### **Adding New Providers** 
1. Create provider class implementing `OsintProvider`
2. Add to `provider.factory.ts` imports
3. Add config to `PROVIDER_CONFIGS` 
4. **NO code changes needed elsewhere** - auto-discovery

### **Configuration Override**
```bash
# Environment-based control
BING_SEARCH_API_ENABLED=true
BING_API_KEY=your_key_here
GOOGLE_CSE_ENABLED=false  # Disable expensive provider
PROXYCURL_API_KEY=your_key
```

## ⚙️ **INTEGRATION STATUS**

### ✅ **Completed**
- Provider Registry con scoring dinámico
- 5 providers de producción implementados  
- Integración completa con BaseAgent
- Fallback automático + audit trail
- Observabilidad completa
- Sistema extensible a 20+ providers

### 🔧 **Configuration Required**
```bash
# Required API Keys for full functionality
export BING_API_KEY="your-bing-subscription-key"
export GOOGLE_CSE_API_KEY="your-google-api-key"  
export GOOGLE_CSE_ID="your-custom-search-engine-id"
export NEWSAPI_KEY="your-newsapi-key"
export PROXYCURL_API_KEY="your-proxycurl-key"
```

### 🎯 **Next Steps (Phase 8)**
1. **AI Provider Integration** - GPT-4, Claude para analysis
2. **Real-time Data** - Twitter API, Reddit API  
3. **Specialized APIs** - Clearbit, Pipl, Hunter.io
4. **Geographic Providers** - Regional search engines
5. **Compliance Layer** - GDPR, data retention policies

## 🏆 **PRODUCTION BENEFITS**

1. **No Hardcoded Logic** - Dynamic provider selection
2. **Cost Optimization** - Automatic budget management  
3. **High Availability** - Multi-provider fallback
4. **Performance** - Latency-aware selection
5. **Extensibility** - Plugin architecture
6. **Observability** - Full audit trail
7. **Reliability** - Circuit breakers + health checks

**Sistema listo para producción enterprise con 0 downtime y escalabilidad horizontal.**