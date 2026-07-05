# Hitos — registro acumulativo de avance por sesión

Cada sesión agrega una entrada nueva al final. No se borra lo anterior.

## 2026-07-04

- Se integró **SerpApi** (`lib/osint/core/providers/search/serpapi.provider.ts`)
  como nuevo provider de búsqueda: resultados reales de Google sin necesitar
  Custom Search Engine ID, a diferencia de `google_cse` (que resultó estar
  roto — 403, API no habilitada en el proyecto de GCP, pre-existente).
- Se encontraron y arreglaron dos bugs reales en la selección inteligente de
  providers (`provider.registry.ts` / `base-agent.ts`) que hacían que
  SerpApi (y cualquier provider nuevo) nunca llegara a competir de verdad:
  el fallback se cortaba ante cualquier respuesta sin excepción aunque
  trajera 0 resultados, y el budget de la búsqueda dejaba a SerpApi con
  score de costo = 0 por coincidir exactamente con el límite configurado.
- Se agregaron campos Profesión/Empresa a la tarjeta "Información
  principal" del CRM, y se arregló el write-back en `osint.worker.ts`: el
  pipeline detectaba profesión/empresa pero nunca los persistía en
  `crm_clients.profession/company` (solo se cargaban a mano).
- Se convirtieron los "Insights" de estadísticas crudas ("X perfiles
  encontrados") a conclusiones de venta accionables ("Está contratando
  vendedores", "Empresa en expansión"), reutilizando la categorización de
  noticias que `news-agent.ts` ya calculaba pero nunca se usaba
  (`lib/osint/core/infrastructure/news-conclusions.ts`, nuevo).
- Se encontraron y arreglaron dos bugs de calidad en `social-agent.ts`:
  URLs no-perfil (`/reel/`, `/groups/`, etc.) se parseaban como si el
  segmento reservado fuera un username, y el filtro anti-gasto-en-Apify
  comparaba contra el título del artículo en vez de contra la cuenta real
  (dejaba pasar cualquier post de un medio que solo mencionara al lead).
- Se encontró un gap real en el Planner (Fase 5 del roadmap): el
  presupuesto `maxDurationMs` no se aplicaba dentro del loop de un agente
  individual — una corrida llegó a tardar 330s contra un presupuesto de
  60s. Se agregó `executeActionWithTimeout` en `planner-agent.ts` (race
  contra el presupuesto restante) + un tope de 3 candidatos priorizados
  por name-match en `social-agent.ts` antes de gastar en Apify. **Fix
  aplicado pero la verificación con una corrida real quedó interrumpida al
  cierre de esta sesión** — confirmar en la próxima (ver `Pendientes.md`).
- Se creó la carpeta `bitacora/` con este archivo, `Pendientes.md` e
  `Instrucciones.md` (protocolo de inicio/cierre de sesión).
- Se completó `Instrucciones.md` con los principios generales de trabajo
  (a-h: no tocar código que funcione, inserciones quirúrgicas, no asumir,
  el directorio del proyecto como fuente de verdad, avisar antes de buscar
  en la web, evitar sesgo de confirmación, seguir el objetivo declarado por
  el humano, mejores prácticas de desarrollo).
- Se creó `CLAUDE.md` en la raíz del proyecto (con el skill `/init`):
  comandos de desarrollo (no hay test suite configurado; nota sobre
  `pnpm-workspace.yaml` roto) y arquitectura de las dos partes del repo (la
  app Next.js/CRM estándar, y el pipeline multi-agente de OSINT), más los
  puntos rotos/incompletos ya conocidos para no volver a descubrirlos.
  Apunta a leer `bitacora/Instrucciones.md` antes de tocar código.
- Se verificó con una corrida real el fix de presupuesto del planner
  (pendiente de la sesión anterior): quedó dentro del budget de 60s. Se
  arregló `pnpm-workspace.yaml` (faltaba el campo `packages`).
- Se implementó el primer bloque de alertas preconfigurables del CRM
  (fecha/intervalo): recordatorio de llamada + re-enriquecimiento
  automático periódico, con job real de BullMQ (existía como dead code,
  nunca se llamaba) y UI en la pestaña Alertas del lead.
- Se encontraron y arreglaron dos bugs reales durante la verificación:
  (1) la ventana de "hoy" del job de recordatorios se calculaba en
  timezone local en vez de UTC, desalineándose 3h contra cómo se guarda
  `nextContactDate`; (2) el worker de OSINT nunca moría con `kill`
  (SIGTERM) porque `browser-pool.ts` registra un handler de shutdown que
  nunca llama a `process.exit()` — explica el problema ya documentado de
  workers acumulándose entre sesiones.
