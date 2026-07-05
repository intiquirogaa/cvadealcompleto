# Bitácora — Arreglo del módulo OSINT (CVA Deal)

Registro de trabajo de la sesión. Se actualiza a medida que avanza la tarea,
sobre todo antes de puntos donde la conversación podría resumirse por longitud.

## Objetivo original

El usuario pidió terminar el módulo OSINT del CRM: el botón "Enriquecer
perfil" no generaba scraping real, el overlay de progreso giraba para
siempre.

## Diagnóstico inicial (investigación exhaustiva del código)

Se encontraron tres pipelines OSINT paralelos en el repo (`lib/osint/` es el
único realmente usado en producción; `lib/enrichment/` y `lib/scraper.ts`
son dead code). Causas raíz identificadas:

1. El worker de BullMQ (`lib/queue/osint.worker.ts`) nunca se ejecutaba como
   proceso — ningún script lo levantaba.
2. El planner crasheaba en cada corrida: referencia a una variable
   inexistente (`AGENT_DISCOVERY_PROB`) en `planner-agent.ts`.
3. El `runId` que veía el frontend (vía SSE) nunca coincidía con el que
   usaba internamente el planner — quedaban dos filas `OsintRun` por corrida.
4. Las entidades encontradas nunca quedaban vinculadas al cliente CRM
   (`crmClientId` nunca se seteaba), rompiendo la reutilización de memoria.
5. 4 providers de producción pasaban `timeout` en vez de `timeoutMs` a
   `httpFetch`, y no chequeaban `null` antes de leer `.status`.

## Plan aprobado (alcance acordado con el usuario)

Arreglar el pipeline existente para que el scraping real funcione de punta a
punta, usando lo ya construido (sin agregar Brave/Yahoo/RSS/Medium ni
extractores dedicados — eso queda para una iteración futura). Sin asumir
infraestructura de despliegue (no hay Docker/pm2 en el repo).

## Cambios aplicados (fase 1 — según el plan)

- `lib/osint/core/types/index.ts`: agregado `runId?` a `InvestigationRequest`.
- `lib/osint/core/persistence/graph-store.ts`: `createRun` acepta `id`
  opcional y hace `upsert` en vez de `create` a ciegas.
- `lib/osint/core/agents/planner-agent.ts`: pasa `request.runId` al crear el
  run; arreglada la referencia rota a `AGENT_DISCOVERY_PROB` (línea 1172,
  ahora usa `strategyOptimizer.getDiscoveryProbabilitiesSync()`).
- `lib/osint/core/persistence/knowledge-graph.ts`: nuevo método
  `setCrmClientId()`, llamado en `finalize()` del planner antes de persistir.
- `lib/osint/osint.service.ts` y `lib/queue/osint.worker.ts`: propagan el
  `runId` end-to-end.
- `package.json`: scripts `worker` y `dev:all` (+ `concurrently` como
  devDependency).
- 5 providers corregidos (`timeout`→`timeoutMs` + null-check):
  `google-cse.provider.ts`, `bing-search-api.provider.ts`,
  `newsapi.provider.ts`, `proxycurl-linkedin.provider.ts`,
  `web-fetcher.provider.ts` (este último se encontró durante la limpieza
  final, no estaba en la lista original de 4).
- `.env.example` creado en la raíz, documentando todas las env vars del
  proyecto (no solo OSINT).
- `lib/osint/README-PHASE-7.md`: actualizado (estaba desactualizado sobre
  qué providers están habilitados) + sección de cómo correr el worker.

**Verificación fase 1:** `tsc --noEmit` sin errores nuevos (resolvió 20
preexistentes). Script aislado de scraping real contra Bing/DuckDuckGo en
vivo: PASS (20 resultados, DDG muy relevantes, Bing con resultados
irrelevantes — hallazgo de calidad de datos, no bug).

## QA end-to-end real (fase 2 — a pedido del usuario)

El usuario pidió probar el flujo completo de verdad, no solo tsc + script
aislado. Se instaló Postgres + Redis + Node.js en la VM (con sudo del
usuario, contraseña provista explícitamente por él para esta VM de bajo
riesgo). Se creó `.env` local, se corrió `prisma db push` (el historial de
migraciones del repo está incompleto — problema preexistente, no se tocó),
se creó un admin y un lead de prueba, se levantó `next dev` + el worker, y
se disparó "Enriquecer perfil" **por la API real** (login real, POST real,
mismo endpoint que usa el botón del CRM).

### Bugs adicionales encontrados y arreglados durante la QA real

Estos NO estaban en el plan original — aparecieron recién al correr el
flujo real, que es exactamente el valor de probar en serio en vez de
confiar en tsc/tests:

1. **Deadlock en el rate limiter** (`lib/osint/core/infrastructure/rate-limiter.ts`):
   cuando un caller se quedaba sin tokens y no había otra request en vuelo,
   esperaba un `release()` externo que nunca llegaba — colgaba la
   investigación para siempre, en silencio. Reproducido (colgó 12+ min real).
   Arreglado: `acquire()` ahora hace loop con auto-timeout basado en la tasa
   de refill, no depende de que otro caller lo despierte.
2. **Worker crasheaba al arrancar sin `OPENAI_API_KEY`**
   (`lib/osint/core/agents/ai-reasoner.ts`): el cliente de OpenAI se
   instanciaba a nivel de módulo (top-level), no de forma perezosa. Sin esa
   key opcional, el worker completo moría al bootear. Arreglado: instanciación
   movida dentro de `generateInsights()`, después del chequeo de la key.
3. **`withRetry`/`RetryConfig` con `jitterMs` faltante**
   (`lib/osint/core/infrastructure/retry.ts`): los providers pasan
   `ctx.config` (`ProviderRuntimeConfig`, sin `jitterMs`) donde se esperaba
   `RetryConfig` (con `jitterMs` requerido) → backoff con delay `NaN`.
   Arreglado: `jitterMs` ahora opcional con default 1000ms.
4. **El perfil del cliente CRM nunca se actualizaba tras enriquecer**
   (`lib/queue/osint.worker.ts`): el pipeline generaba entidades en las
   tablas OSINT pero nunca escribía `insights`/`lastEnriched`/`socialLinks`
   de vuelta en `crm_clients` — la tabla que lee la UI. El toast decía
   "éxito" pero la ficha no mostraba nada nuevo. Arreglado: se agregó el
   write-back después de `osintService.enrich()`.
5. **Faltaba el handler `GET` en `/api/crm/clients/[id]`**
   (`app/api/crm/clients/[id]/route.ts`): solo tenía `PUT`/`DELETE`. El
   frontend hace `fetch()` (GET) a esa ruta para refrescar la ficha después
   de "completed" → 405, la UI nunca se actualizaba sin recargar a mano.
   Arreglado: agregado el handler `GET`.

### Resultado final de la QA

Tres corridas de enriquecimiento reales contra la web:
- Run 1 (`efd79f06...`): quedó colgado por el deadlock del rate limiter,
  se resolvió solo al reiniciar el worker con el fix (BullMQ reintentó el
  job stalled) → completó en 17s.
- Run 2 (`e2bdc835...`): completó en 17.6s, 8 ciclos, 25 entidades reales
  creadas y vinculadas correctamente al cliente (persona, empresa, emails,
  redes sociales, noticias) — pero el cliente CRM no se actualizaba (bug 4).
- Run 3 (`b89636b8...`): completó en 16.1s, 8 ciclos, y esta vez sí
  actualizó `crm_clients.insights`/`lastEnriched`/`socialLinks`. Confirmado
  con `GET /api/crm/clients/qa-test-lead-1` → 200 con el perfil completo.

`/api/admin/osint/metrics`: 3 runs, 100% éxito, 8 ciclos promedio.

### Hallazgos de calidad de datos (no son bugs de código)

- El scraper gratuito de Bing (`bing_legacy`) devuelve resultados
  irrelevantes en este entorno de red (ej. buscando "Satya Nadella
  Microsoft" trae LATAM Airlines, psoriasis, autos usados). El de
  DuckDuckGo funciona bien y trae resultados relevantes. El sistema arma
  igual un perfil parcialmente útil combinando fuentes, pero con confianza
  baja (~24%) por el ruido de Bing. No se tocó — es un problema de la fuente
  externa, no del código.

### Problemas preexistentes encontrados pero NO tocados (fuera de alcance)

- `pnpm-workspace.yaml` corrupto (valores placeholder sin completar, falta
  el campo `packages`) — bloquea `pnpm install`. Se usó `npm install
  --legacy-peer-deps` para poder verificar sin tocar la config del usuario.
- Historial de migraciones de Prisma incompleto (falta la migración base
  que crea `crm_clients` y el resto de las tablas). Se usó `prisma db push`
  para la QA, sin generar ni modificar migraciones.
- `provider.factory.ts`: los IDs de `bing-osint.provider.ts`/
  `duckduckgo-osint.provider.ts` (`"bing"`/`"duckduckgo"`) no coinciden con
  las claves de `PROVIDER_CONFIGS` (`"bing_legacy"`/`"duckduckgo_legacy"`),
  así que usan la config genérica de fallback en vez de la afinada. No
  rompe nada (el fix del rate limiter aplica igual), es solo una
  desprolijidad de tuning.

## Estado del entorno de prueba (para continuar después)

- Postgres y Redis quedaron instalados y corriendo en esta VM (systemd).
- Base `cvadeal` creada, schema sincronizado con `prisma db push`.
- `.env` en la raíz del repo con credenciales de prueba (usuario postgres:
  password `perro`) — está en `.gitignore`, no se va a commitear.
- Usuario admin de prueba: `qa-admin@test.local` / `test1234`.
- Lead de prueba: `qa-test-lead-1` (Satya Nadella / Microsoft), ya
  enriquecido varias veces. Segundo lead de prueba: Lionel Messi
  (id `cmr4cp4p10000ktzvp4rrv3g7`), enriquecido 3 veces (la última con
  Playwright+stealth y el fix de reconciliación de IDs, evidencia OK).
- `next dev` y el worker corriendo en esta VM (puerto 3000) para que el
  usuario los probara en vivo en el navegador — pueden estar detenidos si
  no se relevantaron después. Relevantar con `npx next dev -p 3000` +
  `npx tsx --require dotenv/config lib/queue/osint.worker.ts` en paralelo
  (o `npm run dev:all` una vez resuelto el tema de `pnpm-workspace.yaml`).
- Chromium headless (Playwright) instalado para el usuario `inti` en
  `~/.cache/ms-playwright/` — necesario para que `bing`/`duckduckgo`
  funcionen. Instalado con `npx playwright install --with-deps chromium`
  (deps del sistema vía apt, requiere sudo) + `npx playwright install
  chromium` (binario, sin sudo, por usuario).
- Nuevas dependencias en `package.json`: `playwright`, `playwright-extra`,
  `puppeteer-extra-plugin-stealth`. **`pnpm-lock.yaml` no las tiene
  reflejadas** (no se pudo correr `pnpm install` por el
  `pnpm-workspace.yaml` roto) — falta sincronizar cuando se resuelva eso.

## Auditoría contra el roadmap original de 10 fases

El usuario compartió el documento de diseño original del módulo (Fase 1 a
Fase 10: Fundación, Knowledge Graph, Infrastructure, Confidence Engine,
Adaptive Planner, Memory System, Provider Registry, AI Reasoner, Observability,
Async Processing). Se auditó cada tarea contra el código real. Resumen:

- **Se construyó casi todo el roadmap** (arquitectura sofisticada), pero
  tenía bugs de "última milla" que impedían que funcionara en la práctica
  hasta la sesión de hoy: el deadlock del rate limiter, el crash de
  ai-reasoner sin OPENAI_API_KEY, el write-back faltante a `crm_clients`, el
  handler GET faltante, y el `crmClientId` nunca seteado (todos ya
  arreglados, ver arriba).
- **Genuinamente no construido** (no es bug, es trabajo no hecho):
  - Fase 1: dead code sin eliminar (`lib/scraper.ts`, `lib/enrichment/*`
    siguen ahí; `GoogleProvider` sigue mal nombrado — scrapea DuckDuckGo).
  - Fase 4/6/8: aprendizaje real desde histórico — `strategy-optimizer.ts`
    devuelve probabilidades hardcodeadas, nunca consulta `OsintRun`
    histórico pese a que el docstring lo promete.
  - Fase 6: invalidación por contradicción — `memory-store.ts` tiene
    `invalidate()`/`invalidateByType()` pero nada los llama nunca (dead code).
- **Roto y no arreglado hoy** (pre-existente, no tocado — fuera del alcance
  acordado con el usuario para esta sesión):
  - `weight-calibrator.ts` importa `{ db }` de `@/lib/db`, que exporta
    `prisma`, no `db` — error de compilación real. Todo el loop de
    feedback humano → recalibración de pesos está muerto en la práctica.
  - `estimatedCostUsd` en `/api/admin/osint/metrics` es un placeholder
    (`totalRuns * 0.15`), no un cálculo real de costo por provider.
- **Confirmado funcionando de verdad** (no solo código, sino verificado en
  esta sesión con corridas reales): search cache con TTL (lectura/escritura
  real en `base-agent.ts`), Knowledge Graph, entity resolver, confidence
  engine de 5 dimensiones, dedup de 3 capas, EIG scorer, SSE.

## Playwright + stealth para mejorar la precisión del scraping gratuito

El usuario probó enriquecer un lead real ("Lionel Messi") y notó que el
scraping no traía datos relevantes (profesión, empresa, ubicación,
ingreso). Investigación y arreglo en dos etapas:

**Etapa 1 — diagnóstico de por qué faltan esos campos**: `identity-agent.ts`
extrae profesión con 16 keywords fijas + "contains", ubicación con un único
regex que busca literalmente la frase "vive en"/"ubicación:" (casi nunca
aparece así en la web real), y el sistema **nunca descubre** dónde trabaja
alguien si no se cargó la empresa a mano al crear el lead (`company-agent`
solo enriquece una empresa ya conocida, no la descubre). "Ingreso promedio"
no se intenta en ningún lado; lo más cercano es una estimación categórica
de IA (Alto/Medio/Bajo) basada en cargo+empresa. Se acordó con el usuario:
para profesión/empresa/ubicación laboral el camino real es conseguir
`PROXYCURL_API_KEY` (LinkedIn estructurado, ya integrado en el código); para
"ingreso" no inferir de la web (sensible + poco confiable) sino usar datos
propios del sitio (qué propiedades mira/favorita el lead); para "dónde
vive" no intentar precisar más que la localidad que el lead ya declaró.

**Etapa 2 — el usuario propuso Playwright** para el problema de fondo:
Bing devolvía resultados irrelevantes (probado con "Satya Nadella
Microsoft" → LATAM Airlines, psoriasis, autos usados). Implementado:

- `lib/osint/core/infrastructure/browser-pool.ts` (nuevo): una sola
  instancia de Chromium headless compartida y reusada durante toda la vida
  del worker (no se relanza por query), con `withPage()`/
  `fetchRenderedHtml()`.
- `lib/enrichment/providers/bing.provider.ts` y `google.provider.ts` (el
  que en realidad scrapea DuckDuckGo): cambiado el transporte de `fetch()`
  crudo a navegación real vía `browserPool` — el parseo/regex existente no
  se tocó, ya funcionaba bien cuando el HTML era el correcto.
- **Primer intento (solo Playwright, sin stealth): no alcanzó.** Bing
  seguía devolviendo contenido irrelevante (charlie randomizado: "Twitter
  Ads", después "Jack Reacher" la película) pese a status 200 y título
  correcto — resultó ser contenido señuelo servido a tráfico detectado como
  automatizado, no un tema de fingerprint de browser nomás. DuckDuckGo dio
  403 en el endpoint liviano.
- **Fix real: `playwright-extra` + `puppeteer-extra-plugin-stealth`**
  (parcha `navigator.webdriver` y otras señales de detección de headless).
  Con esto, **tanto Bing como DuckDuckGo pasaron a devolver resultados
  100% relevantes** (confirmado con la query de prueba: 9/9 y 10/10
  resultados relevantes respectivamente, vía los providers reales, no solo
  un script aislado).
- `provider.factory.ts`: se encontró y arregló que `PROVIDER_CONFIGS` tenía
  las claves `bing_legacy`/`duckduckgo_legacy`, que **nunca coincidían**
  con el `.id` real de los providers (`"bing"`/`"duckduckgo"`) — la
  prioridad configurada (30/20) nunca se aplicaba, ambos caían al fallback
  genérico. Renombradas las claves para que coincidan, y emparejada la
  prioridad (30/30) ya que DuckDuckGo venía rindiendo mejor pese a tener
  prioridad más baja.
- **Límite explícito, discutido con el usuario**: no usar esto para
  scrapear LinkedIn (Proxycurl sigue siendo el único camino ahí, es pago
  pero cumple ToS). El usuario sugirió además crear cuentas automatizadas
  en redes sociales para saltar el login y scrapear detrás — **se rechazó
  esa idea explícitamente**: viola ToS de todas las plataformas de forma
  directa, expone a la empresa a riesgo legal real (tipo CFAA, litigado
  activamente por Meta contra Bright Data), y es vigilancia encubierta
  sobre leads que no dieron ese consentimiento. Si se retoma este tema en
  el futuro, la respuesta debe seguir siendo no.

**Bug adicional encontrado y arreglado al volver a probar (revelado por el
propio fix de `crmClientId` de antes, primera vez que la reutilización de
memoria se ejerce de verdad)**: `graph-store.ts::upsertEntity()` hace
`upsert` por `{type, naturalKey}` — cuando una entidad ya existía de una
corrida anterior, Prisma actualiza la fila existente pero **mantiene su id
original**, mientras que el grafo en memoria de la corrida actual sigue
usando el id recién generado. Las relaciones y evidencia de esa corrida
apuntaban al id nuevo (que nunca se escribió), causando "foreign key
violation" en el 100% de las relaciones y **pérdida total de evidencia**
(0 filas) en cualquier segundo enriquecimiento del mismo lead. Arreglado:
`upsertEntitiesBatch` ahora devuelve un mapa id-original→id-persistido, y
`KnowledgeGraph.persistToStore()` remapea `sourceId`/`targetId`/`entityId`
antes de guardar relaciones y evidencia. Además se hizo `insertEvidenceBatch`
resiliente a fallas parciales (antes un solo registro malo tiraba abajo
todo el batch por ser un `createMany` atómico). Confirmado con una tercera
corrida real sobre el lead de Messi: pasó de 0 a 9 evidencias guardadas,
cero errores de FK en el log.

## Verificación de identidad por hallazgo (social-agent + website-agent)

Objetivo: que perfiles como "Diario Olé"/"La Nación" (encontrados junto al
real "leomessi" en las pruebas de Messi) no aparezcan con la misma
confianza que el hallazgo correcto.

- Nueva función `computeNameMatchScore(candidateText, firstName, lastName)`
  en `normalization.ts`: compara el username/displayName de un perfil
  contra variantes del nombre del lead (reusa `generateNameVariants`, ya
  existente) y devuelve 0-1. Probada directamente: "diario.ole"/"MARCA" → 0.00,
  "Lionel Messi lionelmessi" → 0.75, "Cristiano Ronaldo cristiano" → 0.75,
  "Leo Messi leomessi" → 0.22 (apodo "Leo" no está en las variantes
  generadas para "Lionel", limitación conocida y aceptable — mejor
  subestimar que aceptar falsos positivos).
- **Trampa encontrada**: setear `entity.confidence` directamente en
  `social-agent.ts` no alcanzaba — `ConfidenceEngine.scoreAndUpdateEntities()`
  (corre en `finalize()`) **sobreescribe** `entity.confidence` recalculándolo
  desde `entity.evidence` (un array de `EvidenceRef` con `matchType:
  SignalType`, tabla `SIGNAL_SPECIFICITY`), no desde lo que el agente haya
  seteado. Fix real: mapear el match score a un `SignalType` existente
  (`matchScoreToSignalType()`) y empujarlo a `entity.evidence` vía
  `makeEvidenceRef()` — mismo mecanismo que ya usa `identity-agent.ts`.
- **Segundo agente con el mismo problema, encontrado al debuggear**:
  `website-agent.ts` también crea entidades `social_profile` (de links
  encontrados al escrapear una página, ej. redes del pie de página de un
  sitio de noticias) con confianza fija 60 y **sin evidencia en absoluto**
  — aplicado el mismo fix ahí. Requirió además pasarle `firstName`/
  `lastName`: `planner-agent.ts::executeAction()` solo pasaba los hints
  específicos de la acción (`action.hints`), nunca los hints globales de la
  investigación (`this.hints`) — corregido para mergearlos.
- **Bug operativo encontrado mientras se verificaba** (no relacionado al
  fix): reinicios sucesivos del worker con `pkill` no estaban matando al
  proceso anterior de forma confiable en este entorno — llegaron a
  acumularse **5 workers corriendo en simultáneo**, compitiendo por los
  mismos jobs de BullMQ, algunos con código viejo. Esto explica varios
  resultados inconsistentes durante la sesión. Solución: matar por PID
  explícito (`ps aux | grep ... | awk '{print $2}' | xargs kill -9`) en vez
  de confiar en `pkill -f`.
- **Verificación**: no se logró una prueba end-to-end 100% limpia contra
  `social_profile` en vivo — el planner corta la investigación apenas
  llega a `"Confidence threshold met"` (por diseño, para ahorrar costo),
  y para figuras públicas conocidas eso pasa en el ciclo 2, antes de
  llegar a `social-agent`/`website-agent`. Se validó en cambio: (a) la
  función de matching da los valores correctos de forma aislada, (b) el
  mecanismo de scoring por evidencia funciona de verdad en runs reales
  (65% vs 22% para emails con vs. sin evidencia, confirmado en logs). No
  hay razón para dudar de que el pipeline completo funcione — pero
  técnicamente falta un caso donde el planner llegue hasta el final con
  un lead que tenga match ambiguo, para verlo confirmado de punta a punta.

## Límite reforzado: no evadir detección anti-bot de redes sociales

El usuario pidió explícitamente "hacer webscraping en redes sociales, solo
contenido público, es para prueba" después de que el freno de seguridad
automático (auto mode classifier) bloqueara un intento de navegar a
Instagram/X/Facebook/LinkedIn con Playwright en modo stealth. Se sostuvo la
negativa: usar un navegador camuflado para evadir la detección anti-bot de
esas plataformas es la misma técnica de riesgo (tipo Meta v. Bright Data)
sin importar si el contenido final es público o si es "solo una prueba" —
el riesgo lo genera el método, no el dato ni la intención. El usuario
aceptó y redirigió hacia una alternativa segura: mejorar las búsquedas en
buscadores (Google/Bing/DDG) + motor de inferencia propio sobre el
contenido ya indexado, en vez de tocar las plataformas directamente. Esta
decisión debe mantenerse si el tema vuelve a aparecer.

## Motor de reglas para inferir ocupación / poder adquisitivo / región

El usuario no tiene `OPENAI_API_KEY` todavía, así que en vez del AI
Reasoner (que hasta ahora se saltaba silenciosamente sin esa key, dejando
`purchasingPower`/`professionalProfile` vacíos para todos los leads) se
armó un motor por reglas:

- `lib/osint/core/agents/rule-based-reasoner.ts` (nuevo): produce el mismo
  contrato `AIInsights` que `ai-reasoner.ts`. Clasifica ocupación/ingreso
  (Alto/Medio/Bajo/Desconocido) por keywords sobre profesión + cargo +
  título/snippet de noticias + industria de la empresa, y detecta
  provincia/región argentina (24 provincias + CABA) desde la localidad
  declarada o el texto de evidencia.
- `osint.service.ts`: `aiInsights ?? ruleBasedReasoner.generateInsights(...)`
  — usa IA si hay key, si no cae al motor de reglas. Antes simplemente no
  generaba nada sin key.
- **Bug real encontrado y arreglado en el camino**: `crm-content.tsx` leía
  `enrichmentResult.aiAnalysis.estimatedPurchasingPower.value`, un campo
  que el backend **nunca produce** (produce `purchasingPower`, string
  plano) — sin optional chaining, esto tiraba `TypeError` y rompía esa
  sección de la UI cada vez que había análisis de IA/reglas disponible.
  Arreglado para leer `purchasingPower` directamente.
- **Verificado con los ejemplos exactos del usuario** (Messi/Elias
  Figueroa) llamando al motor directo: Messi (noticias con "jugador
  profesional", "futbolista", "selección nacional") → Alto. Elias Figueroa
  (estudiante + "busca empleo" + "CV disponible") → Bajo + región
  "Córdoba" detectada desde la localidad declarada. Coincide exactamente
  con el razonamiento que el usuario describió a mano.
- Pendiente si el usuario consigue `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_ID` u
  `OPENAI_API_KEY`: activar Google CSE (ya integrado, solo falta la key) y
  hacer que `ai-reasoner.ts` tenga prioridad sobre el motor de reglas
  cuando haya key disponible (ya está así, `aiReasoner` se intenta primero).

## Pendiente / decisiones del usuario

- **No hacer commit todavía** — el usuario lo pidió explícitamente. Todos
  los cambios están en el working tree, sin commitear.
- Preguntar si quiere que arregle el `pnpm-workspace.yaml` (separado de
  esta tarea).
- Preguntar si dejar o limpiar el `.env` de prueba.
- Fuera de esta iteración (documentado y acordado con el usuario): Brave,
  Yahoo, RSS/Reuters/Medium, navegación a subpáginas de empresa,
  extractores dedicados, selección de estrategia vía LLM.

## Integración de Apify para enriquecimiento social (Instagram/Facebook)

El código base ya existía al retomar la sesión (`apify-social.provider.ts`,
wiring en `provider.factory.ts` y `social-agent.ts`) pero nunca se había
probado con un token real ni en el pipeline completo. El usuario pasó un
`APIFY_API_TOKEN` real (guardado en `.env`, gitignoreado) y se validó todo
de punta a punta.

**Qué hace**: dado un perfil de Instagram o Facebook ya encontrado, corre
un actor mantenido de Apify Store (`apify~instagram-profile-scraper` /
`apify~facebook-pages-scraper`, vía `run-sync-get-dataset-items`) para
traer bio/seguidores/siguiendo/posts/última actividad reales — datos que
ningún otro provider completaba. Twitter/X e LinkedIn quedan afuera a
propósito (Twitter porque los scrapers públicos de Apify para X se rompen
constantemente; LinkedIn ya lo cubre `proxycurl_linkedin`).

**Verificación aislada**: probado directo contra la API real (Instagram:
perfil de Messi, 511M seguidores correctos, verificado; Facebook: FC
Barcelona 126M, Taylor Swift 78M) — el provider en sí funcionaba perfecto
desde el primer intento.

**El problema real estaba en el pipeline**: en 3 corridas reales
consecutivas contra leads nuevos (Emma Watson, Dua Lipa, Rihanna) el
`SocialAgent` —el único agente conectado a Apify— **nunca llegó a
ejecutarse**, pese a que la búsqueda real encontraba la URL correcta de
Instagram/Facebook. Se encontraron y arreglaron 5 causas en cascada
(cada fix revelaba la siguiente capa del problema):

1. **Gate del planner por presencia de tipo, no por calidad**
   (`planner-agent.ts::generateMissingTypeActions`): solo se disparaba
   `SocialAgent` si no existía *ninguna* entidad `social_profile` — sin
   importar su confianza. `WebsiteAgent` crea entidades `social_profile`
   de baja confianza como efecto secundario de scrapear cualquier página
   (íconos de "seguinos" en el pie de un sitio de noticias), lo cual
   bloqueaba a `SocialAgent` para siempre en cuanto aparecía la primera.
   Fix: el gate ahora exige `confidence >= 40` (por encima del rango
   ~12-20 que reciben los matches basura, por debajo del ~43+ de un
   match real).
2. **`SearchAgent` mandaba la URL social directa a `WebsiteAgent`**
   (`search-agent.ts`): cuando la propia búsqueda encontraba
   `instagram.com/emmawatson` como resultado top, se generaba una
   sugerencia `fetch_page` genérica hacia esa URL. `WebsiteAgent` la
   trataba como página cualquiera (llegó a extraer un falso positivo de
   teléfono del HTML de Instagram) y de paso creaba una entidad
   `social_profile` de *alta* confianza (por ser la real) — satisfaciendo
   el gate del punto 1 antes de que `SocialAgent` corriera. Fix: se excluyen
   los dominios de redes sociales (instagram/facebook/twitter/x/linkedin)
   de las sugerencias `fetch_page` de `SearchAgent`; esas URLs quedan para
   que las maneje `SocialAgent`.
3. **`WebsiteAgent` también encuentra el perfil real por link-extraction**
   (caso Taylor Swift): incluso sin la URL social directa, `WebsiteAgent`
   encuentra el perfil real de la persona como link dentro de OTRAS páginas
   (ej. un artículo de Vogue con "seguila en instagram.com/taylorswift").
   Esto vuelve a satisfacer el gate del punto 1 con una entidad legítima,
   pero sin pasar nunca por Apify. Fix: `social-agent.ts` ahora también
   recoge perfiles instagram/facebook ya existentes en `ctx.graph` que
   todavía no tengan `followers` (sin enriquecer) y los suma a su propio
   loop de enriquecimiento vía Apify — exactamente lo que el comentario de
   diseño original del archivo ya prometía pero nunca se implementaba.
4. **El cálculo de EIG no distinguía "encontrado" de "enriquecido"**
   (`planner-agent.ts::isFieldFulfilled`): aun generando la acción de
   `SocialAgent` correctamente (fix 1), el scoring de "campos cumplidos"
   consideraba `person.instagram`/`person.facebook` satisfechos con solo
   la presencia del tipo, sin mirar si ya estaba enriquecido. Fix: para
   instagram/facebook, el campo solo cuenta como cumplido si la entidad
   tiene `followers`.
5. **El modelo de EIG favorece cantidad de fetches especulativos sobre
   una acción certera** (`planner-agent.ts::scoreActions`): confirmado
   con `audit_trail_json` de una corrida real — cada sugerencia
   `fetch_page` de `WebsiteAgent` (aunque fuera un video de YouTube o una
   página ya vista) puntuaba EIG=0.7 fijo (se calcula sobre los campos
   pendientes de *todo* `WebsiteAgent`, no de esa URL puntual), mientras
   que la acción de `SocialAgent` puntuaba 0.36 — perdiendo la competencia
   los 8 ciclos de la corrida. Fix acotado (no se rediseñó el modelo de
   EIG completo): la acción de `SocialAgent` generada por el gate del
   punto 1 (`source === "missing_type"`) tiene un piso de `eig = 1.0`,
   ya que es una acción determinística, barata (1 query) y de payoff
   conocido — no debería competir en igualdad de condiciones con fetches
   especulativos.

**Confirmado end-to-end** (lead real "Taylor Swift", vía API real +
worker real, sin atajos): tras los 5 fixes, `SocialAgent` ganó la
competencia de EIG en el ciclo 2, corrió, y enriqueció con Apify los
perfiles ya encontrados por `WebsiteAgent`:
- Instagram: 273.5M seguidores, bio real, 708 posts, última actividad
  2026-06-05, confidence subió de 58 a 70.
- Facebook: 78M seguidores, bio real, confidence 58→70.

**Nota sobre Google CSE** (hallazgo colateral, no tocado): la
`GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_ID` ya presentes en `.env` devuelven
403 ("This project does not have access to Custom Search JSON API") en
todos los intentos durante esta sesión, incluso después de que el usuario
confirmó haber habilitado la API y revisado las restricciones de la key.
Pendiente: confirmar facturación vinculada al proyecto y que la API
habilitada sea exactamente "Custom Search API". Mientras tanto el sistema
sigue cayendo a Bing sin problema (fallback ya funcionaba de antes).

**Scripts de prueba nuevos**: `scripts/test-apify-social.ts` (prueba
aislada del provider contra la API real de Apify, toma la URL de
`process.argv[2]`).

## Incidente: freeze total de la VM al enriquecer desde la UI

Después de confirmar el fix de Apify, el usuario probó "Enriquecer perfil"
desde la UI real (no la API directa) y la máquina entera se colgó — tuvo
que reiniciar la PC. Tras el reinicio (`uptime` confirmó ~3 min de vida),
se encontró la causa más probable: `lib/queue/osint.worker.ts` tenía
`concurrency: 5` en el Worker de BullMQ, y esta VM tiene solo **4 núcleos
y 6.1GB de RAM** (797MB de swap). Cada investigación puede levantar un
Chromium real vía Playwright (`browser-pool.ts`, para scraping de
Bing/DuckDuckGo) además de llamadas a Apify — 5 investigaciones en
paralelo en una máquina así alcanza para agotar la memoria y colgar el
sistema completo, no solo el proceso de Node. La cola de Redis en el
momento del diagnóstico estaba prácticamente vacía (0 waiting, 1 active
fantasma), así que no fue necesariamente "5 jobs viejos disparándose
juntos" — más bien el propio worker con esa concurrencia es un riesgo
latente en este hardware.

**Fix aplicado**: `concurrency: 5` → `concurrency: 1` en
`lib/queue/osint.worker.ts`. Documentado en el propio código el motivo
(hardware limitado + Chromium real por investigación). Después del
reinicio se volvieron a levantar `next dev` (puerto 3000) y el worker
manualmente (no hay systemd/pm2 para estos dos, a diferencia de
Postgres/Redis que sí son servicios systemd y sobrevivieron el reboot
solos). Sesión de prueba vieja (cookies del admin QA) quedó invalidada
por el restart — hay que loguearse de nuevo desde el navegador.

**Pendiente**: confirmar con el usuario, tras una prueba real desde la UI
con concurrency=1, que el freeze no se repite. Si concurrency=1 resulta
demasiado lento para uso normal, considerar subir a 2 con monitoreo de
memoria, pero no volver a 5 en esta VM sin más RAM.

## Troubleshooting Google CSE (sin resolver al cierre de esta sesión)

La `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_ID` en `.env` siguen devolviendo 403
("This project does not have the access to Custom Search JSON API") en
**todos** los intentos a lo largo de toda la sesión, incluso después de
que el usuario confirmó explícitamente:
- Haber habilitado "Custom Search API" en el proyecto de GCP.
- Que la API key no tiene restricciones que excluyan esa API (Custom
  Search API está en la lista de APIs permitidas de la key).

El error es siempre idéntico y viene del lado de Google (no es un typo de
key/cx, porque daría un error distinto tipo "API key not valid"). Se le
armó al usuario un prompt para pedirle ayuda a Gemini, apuntando
específicamente a dos sospechosos no descartados todavía: (a) falta de
cuenta de facturación (billing) vinculada al proyecto, y (b) que el `cx`
(Search Engine ID) generado en programmablesearchengine.google.com
pertenezca a un proyecto de GCP distinto del de la key. Mientras tanto el
sistema sigue funcionando con Bing como fallback (sin degradar nada, ya
era el comportamiento antes de esta sesión). No se tocó código por este
tema — es 100% configuración del lado de Google Cloud.

## Estado del entorno al cierre de esta sesión

- VM reiniciada por el usuario durante la sesión; Postgres/Redis
  (systemd) se recuperaron solos, `next dev` y el worker se relevantaron
  manualmente y están corriendo (puerto 3000).
- Worker con `concurrency: 1` (bajado de 5 por el incidente de freeze).
- Leads de prueba creados esta sesión (además de los de la sesión
  anterior: Messi, Cristiano Ronaldo): Emma Watson, Dua Lipa, Rihanna
  Fenty, Taylor Swift (esta última enriquecida con éxito vía Apify,
  confidence 70 en sus perfiles de Instagram/Facebook).
- **Seguimos sin commitear nada** — el usuario no lo pidió en ningún
  momento de esta sesión tampoco.
- Pendiente de decisión del usuario (arrastrado de la sesión anterior,
  sigue sin resolver): `pnpm-workspace.yaml` roto, y si limpiar o dejar
  el `.env`/datos de prueba.

## Continuación 2026-07-04 — verificación del fix de presupuesto, `pnpm-workspace.yaml`, y alertas de fecha/intervalo

### Verificación del fix de presupuesto del planner (pendiente de la sesión anterior)

Confirmado con una corrida real (`qa-test-lead-1`): la investigación terminó
en 60010ms contra un `maxDurationMs` de 60000ms (antes tardaba hasta 330s),
y logueó `"Action agent:company:... exceeded remaining time budget"` como
se esperaba. El resultado quedó `status: "timeout"` sin crashear, y el
write-back a `crm_clients` funcionó igual.

**Hallazgo nuevo en esa misma corrida, no arreglado (documentado, no
tocado)**: al finalizar con timeout, 252 evidencias recuperadas de memoria
fallan por `Unique constraint` (reintentan insertar evidencia que ya existe
— ruido, no pérdida de datos) y 9 evidencias nuevas fallan por `Foreign key
constraint` (entidades descubiertas justo antes del corte de tiempo, cuya
entidad nunca llegó a persistirse) — pérdida de evidencia acotada, no
crashea gracias al fix de resiliencia de la sesión anterior.

### `pnpm-workspace.yaml` arreglado

Faltaba el campo `packages` (por eso `pnpm install` fallaba con "packages
field missing or empty") y `allowBuilds` tenía placeholders literales
(`"set this to true or false"`) en vez de booleanos. Agregado
`packages: ['.']` y `true` en los 10 paquetes (son dependencias reales:
prisma, bufferutil, utf-8-validate, baileys, esbuild, etc.). Verificado que
`pnpm list` ya no tira el error. No se corrió `pnpm install` completo para
no tocar el `node_modules` actual instalado con npm.

### Sistema de alertas de fecha/intervalo (nuevo)

A pedido del usuario, se separó "alertas de cambio" (requieren diff entre
corridas de enriquecimiento, no implementado, queda para más adelante) de
"alertas de fecha/intervalo" (implementado hoy):

- **Schema**: `CRMClient.autoEnrichEnabled` (Boolean) y
  `autoEnrichIntervalDays` (Int?, default 30).
- **Job real de BullMQ**: se encontró que `scheduled-enrichment-batch` y
  `setupScheduledEnrichment()` ya existían en el código pero **nunca se
  llamaban desde ningún lado** — dead code. Se reescribió el handler para
  usar el intervalo por-cliente (antes era un hardcode global de 30 días
  sin opt-in) y se agregó la lógica de recordatorio de llamada
  (`nextContactDate` == hoy → `CRMActivityLog` idempotente por día). Se
  llama `setupScheduledEnrichment()` al boot del worker (BullMQ dedupea por
  `jobId`, seguro llamarlo en cada restart). Corre diariamente a las 09:00.
- **API**: `PUT /api/crm/clients/[id]` acepta `autoEnrichEnabled`/
  `autoEnrichIntervalDays`.
- **UI**: nueva sección en la pestaña "Alertas" del perfil del lead con
  edición de recordatorio de llamada (fecha/nota) y toggle + selector de
  intervalo (7/15/30/60 días) para el re-enriquecimiento automático.

**Bugs reales encontrados y arreglados durante la verificación end-to-end**
(no estaban en el plan, aparecieron al probar de verdad):

1. **Ventana de "hoy" calculada en timezone local en vez de UTC**
   (`osint.worker.ts`): `nextContactDate` se guarda como medianoche UTC
   literal (`new Date("2026-07-04")` siempre parsea a
   `2026-07-04T00:00:00.000Z` sin importar el timezone del servidor), pero
   la ventana del job usaba `setHours(0,0,0,0)` — hora **local** del
   servidor (`America/Argentina/Buenos_Aires`, UTC-3). Esto desalineaba la
   ventana 3 horas y el recordatorio de "hoy" no matcheaba nunca.
   Reproducido con un script aislado (`dueToday count: 0` con el bug,
   `count: 1` con el fix). Arreglado calculando los límites del día con
   `Date.UTC(...)` en vez de `setHours()`, igual que ya hace
   `crm-dashboard.tsx` (comparación de string ISO) para el mismo campo.
2. **El worker de OSINT no muere con `kill` (SIGTERM)**
   (`browser-pool.ts`): el handler de shutdown (`process.on("SIGTERM",
   closeAndExit)`) cierra Chromium pero nunca llama a `process.exit()` —
   al registrar el listener, Node desactiva el comportamiento default de
   terminar el proceso, así que el worker queda vivo para siempre pase lo
   que pase. **Esto explica el problema ya documentado en sesiones
   anteriores** ("pkill -f no mata el proceso de forma confiable, se
   acumulan varios workers") — no era `pkill -f` el problema, era que
   ningún `kill` (ni por PID) iba a funcionar mientras el proceso hubiera
   tocado alguna vez `browser-pool.ts`. Arreglado agregando
   `process.exit(0)` al final del handler. Confirmado: antes del fix, un
   `kill <pid>` explícito no terminaba el proceso (quedó vivo 3+ minutos
   sin ninguna señal de actividad); después del fix, el restart funcionó
   con `kill` normal.

**Verificado end-to-end** (leads reales, sin atajos): auto-enriquecimiento
con intervalo 0 días disparó en ambas corridas del batch (esperado, 0 =
siempre vencido); intervalo 60 días nunca disparó; recordatorio de llamada
se logueó una sola vez pese a correr el batch dos veces seguidas
(idempotencia confirmada). Datos de prueba reseteados al terminar.

**Pendiente para la próxima sesión**: nada bloqueante quedó pendiente de
esta parte. El diff entre corridas de enriquecimiento (para las "alertas
de cambio": cambió de trabajo, nueva publicación, etc.) sigue sin
implementar — es la continuación natural una vez que se acuerde el
formato del snapshot a comparar.

## Integración de WhatsApp arreglada de punta a punta

El usuario pidió terminar la integración de WhatsApp (`lib/whatsapp/`):
el QR de la pestaña Chat del CRM no se veía, y al escanearlo no dejaba
entrar a la cuenta. Se encontraron y arreglaron **cinco bugs reales en
cascada** (cada uno se hizo visible recién al arreglar el anterior y
probar de nuevo con un teléfono real):

1. **Evento de Baileys renombrado, nunca disparaba**
   (`lib/whatsapp/service.ts`): escuchaba `chats.set` para poblar la
   lista de chats — Baileys v7 (instalado: `7.0.0-rc13`) lo renombró a
   `messaging-history.set`. El chat list quedaba vacío para siempre tras
   cualquier pairing.
2. **`socket.fetchMessages()` ya no existe** (`lib/whatsapp/messages.ts`):
   Baileys v7 no tiene forma de pedir historial on-demand — solo llega
   empujado por el servidor (`messaging-history.set` en el pairing,
   `messages.upsert` después). Se reescribió para cachear lo que llega en
   vez de intentar "pedirlo".
3. **El reconnect obligatorio post-pairing nunca pasaba**
   (`service.ts::handleConnectionUpdate`): tras escanear, WhatsApp
   siempre cierra la conexión con código 515 ("restart required") y
   exige reconectar — es normal, no un error. `scheduleReconnect()`
   marcaba el estado como `"connecting"` *antes* de que el timer
   disparara, y `connect()` tiene un freno que dice "si ya estoy
   conectando, no hagas nada" — con lo cual la reconexión jamás ocurría.
   Confirmado en vivo: el teléfono emparejaba con éxito
   (`"pairing configured successfully"`, con el nombre real del usuario),
   pero después no pasaba nada más, para siempre.
4. **Reconectar demasiado rápido generaba un loop infinito de
   `conflict`**: al arreglar (3), reconectar en el mismo tick (sin
   delay) chocaba con el cierre del socket viejo del lado de WhatsApp
   (que no había terminado su handshake de cierre), y el servidor
   expulsaba la conexión nueva con `440 connectionReplaced`. Esto se
   repetía cada ~4s indefinidamente. Arreglado: (a) usar
   `socket.end()` (el cierre "prolijo" que Baileys expone, en vez de
   `ws.close()` crudo) para que el cierre viejo quede resuelto antes de
   abrir uno nuevo, y (b) un delay corto (1.2s) antes de reconectar tras
   un 515, en vez de instantáneo.
5. **El singleton de WhatsApp estaba duplicado por ruta** (el más grave,
   encontrado con un ID de instancia de diagnóstico): Next.js en modo
   dev compila cada ruta de API en su propio grafo de módulos — un
   singleton normal (`static instance` a nivel de módulo) termina
   duplicado, una copia independiente por ruta. Confirmado: `/connect`,
   `/chats` y `/events` tenían **tres instancias distintas** del
   servicio, sin compartir estado entre sí — por eso conectaba por un
   lado ("connected") y `/chats` decía "no conectado" por otro. Arreglado
   con el mismo patrón que ya usa Prisma en `lib/db.ts` (`globalThis` en
   vez de un singleton de módulo) — aplicado a `service.ts` y también a
   los caches de `chats.ts`/`messages.ts` (mismo bug, mismo fix, tres
   archivos).

**Bug adicional de diseño, no de código**: WhatsApp solo manda el
historial completo la primera vez que un dispositivo se vincula
(`authState.creds.accountSyncCounter === 0`, confirmado leyendo el
código fuente de Baileys). En cualquier reconexión posterior, el
servidor asume que el cliente ya persistió esos datos localmente y
**nunca los vuelve a mandar** — no hay forma de forzar un re-sync
completo vía config. Como el proyecto solo persistía las credenciales
(no los chats/mensajes), cada reinicio del proceso volvía a arrancar con
la lista vacía aunque el pairing siguiera siendo válido. Se agregó
persistencia real a disco (`data/whatsapp/_chats_cache.json` y
`_messages_cache.json`, cargados al boot y guardados con debounce de
500ms) para que sobreviva reinicios — esto requirió **un último**
escaneo fresco del usuario (con "Limpiar sesión y reintentar") para
capturar el sync inicial completo; de ahí en más nunca hace falta
repetirlo.

**Verificado end-to-end, con teléfono real del usuario**: tras los 5
fixes, pairing limpio, conexión estable sin loops (0 conflicts en 15s+),
`/connect` y `/chats` coinciden en el estado, y `/chats` devuelve
**1714 chats reales** (nombres, grupos, no-leídos) incluso pidiéndolo
en frío (ruta recién compilada, antes de cualquier connect en esa
sesión de proceso) — sobrevive un restart completo de `next dev`.

## Vista de Chat: funcionalidades tipo WhatsApp real

Con la conexión ya estable, el usuario pidió acercar la vista a un
WhatsApp real: imágenes/video/audio/documentos, fotos de perfil,
selector de emojis, y (al aclarar qué significaba "vistas") tanto un
visor en grande de imágenes/video dentro del chat como una futura
sección de Estados/Stories (esta última quedó pendiente, ver
`Pendientes.md`).

- **Media** (`lib/whatsapp/messages.ts`): `formatMessage()` ahora
  detecta `imageMessage`/`videoMessage`/`audioMessage`/
  `documentMessage`/`stickerMessage` y guarda tipo/mimetype/nombre de
  archivo/dimensiones. El mensaje crudo de Baileys (necesario para
  descifrar la media después, `downloadMediaMessage()` no acepta solo
  una URL) se guarda en un cache aparte **solo en memoria, no en disco**
  — persistirlo requeriría un (de)serializador custom para los campos
  binarios (`mediaKey`, etc.) y las URLs de WhatsApp expiran igual, así
  que la media de mensajes de sesiones anteriores al restart no es
  recuperable (limitación aceptada, documentada en el propio código).
- **Nueva ruta `/api/whatsapp/media?id=`**: descifra y sirve la media
  bajo demanda vía `downloadMediaMessage()`.
- **Fotos de perfil** (`lib/whatsapp/avatars.ts` +
  `/api/whatsapp/avatar?jid=`): a diferencia de la media de mensajes,
  las fotos de perfil son URLs directas del CDN de WhatsApp (no
  encriptadas) — se cachean (incluso "sin foto", para no re-consultar)
  y el frontend las usa directo como `<img src>`. Carga lazy por fila
  vía `IntersectionObserver` (hay 1714+ chats, pedirlas todas de una
  saturaría la API).
- **UI** (`components/whatsapp-chat.tsx`): `MessageContent` renderiza
  imagen/video/audio/documento/sticker según corresponda; click en
  imagen o video abre un `Lightbox` (visor en grande, fondo oscuro,
  cierra con click afuera o la X). Selector de emojis propio (grid de
  32, sin librería externa) en un `Popover` junto al input.
- **Bug de instancias duplicadas, otra vez**: se aplicó preventivamente
  el mismo patrón `globalThis` (ver el bug #5 de la sección anterior) a
  los caches nuevos de `avatars.ts` desde el principio, para no volver
  a pisar el mismo problema.

**Verificado con datos reales** (Playwright + sesión real reconectada):
1715 chats cargando, chat real abierto con mensajes reales, 3 fotos de
perfil cargadas (`<img>` real, no placeholder), selector de emojis
abre y es clickeable.

**Bug de scroll encontrado y arreglado en el camino**: el usuario reportó
que abrir un chat expandía la pantalla en vez de scrollear — clásico bug
de flexbox anidado (`Card`/`CardContent` sin `min-h-0`, el contenido
empujaba el contenedor a crecer en vez de activar el `ScrollArea`
interno). Arreglado agregando `min-h-0` en toda la cadena. Verificado con
medición precisa: 0px de cambio de altura de página al abrir un chat
(antes/después), ambas columnas quedan fijas en 598px.

**Estados de WhatsApp (Stories) — implementado y verificado con datos
100% reales**: Baileys entrega los estados como mensajes normales
dirigidos a `status@broadcast` — se encontró que esto **ya estaba
contaminando la lista de chats** (aparecía como un chat falso llamado
"status"). Se separó en `lib/whatsapp/statuses.ts` (cache por poster,
expira a las 24hs) + `lib/whatsapp/contacts.ts` (nombre real desde
`messaging-history.set`), filtrado de `chats.upsert/update` y
`messaging-history.set`, nueva ruta `/api/whatsapp/statuses`, y una tira
de círculos arriba de la lista de chats con un visor tipo stories
(next/prev, barra de progreso, cierra con X) reutilizando la
infraestructura de media ya construida.

Mientras se verificaba, **llegó un estado real en vivo** de un contacto:
video de 3.8MB, se descargó y descifró correctamente
(`downloadMediaMessage`), se confirmó archivo MP4 válido por fuera, y se
vio reproduciendo en el visor real vía Playwright — confirmación end-to-end
completa de toda la cadena de media construida hoy (detección → cache →
descifrado → servido → UI), no solo de Estados.

**Nota operativa**: durante esta verificación la VM llegó a swap 100%
lleno (memoria realmente ajustada — es una VM de escritorio compartida
con Firefox/GNOME, no dedicada). Se reinició `next dev` para liberar
memoria; sin incidentes mayores, pero vale la pena tenerlo en cuenta si
se repiten sesiones largas con muchas reconexiones/pruebas de Playwright.

### Notificación de las alertas: bell/badge en el header del CRM

Se detectó que las alertas de fecha/intervalo recién armadas solo escribían
un `CRMActivityLog` — nadie se enteraba salvo que abriera el lead puntual a
mano. Se agregó una notificación pasiva (no push, el usuario tiene que
tener el CRM abierto):

- `app/crm/_components/crm-content.tsx`: `todayAlerts` (useMemo) computa,
  sin pedidos nuevos al backend, los `CRMActivityLog` de tipo
  `reminder_call`/`auto_enrich_queued` de hoy a partir de
  `client.activityLogs` (ya venía incluido en `GET /api/crm/clients`).
  Botón campana en el header persistente (visible en las 4 vistas del
  CRM) con badge de conteo + `Popover` (`@radix-ui/react-popover`, ya
  estaba instalado) listando cliente + título, click navega al perfil.
  Toast de `sonner` una vez por carga de página si hay alertas.
- Verificado visualmente con Playwright (login real + captura de
  pantalla): badge mostró el conteo real, popover con la lista, toast
  "Tenés N alertas de hoy" visible, y click en un item abrió el perfil
  correcto del cliente.
- **Limitación conocida, discutida con el usuario**: sigue siendo *pull* —
  si nadie abre el CRM ese día, la alerta no llega a ningún lado. Se
  planteó WhatsApp (ya integrado en el proyecto) como capa push real para
  una iteración futura, no implementado todavía.
