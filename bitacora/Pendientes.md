# Pendientes — para la próxima sesión

- **Media real confirmada** (imagen/video/audio/documento) — ya no está
  pendiente, se confirmó con un video real de estado de 3.8MB
  descargándose/descifrándose y reproduciendo correctamente en el visor.
- **Estados de WhatsApp**: implementado y verificado con datos reales
  (ver `BITACORA.md`). Lo que queda, no bloqueante:
  - Postear el propio estado (requiere lista de contactos /
    `statusJidList`, no integrado).
  - Nombres de poster: solo se resuelven si vinieron en el
    `messaging-history.set` inicial — posters sin ese dato muestran el
    número de jid en vez del nombre (fallback aceptable, no es un bug).
- **Alertas de cambio** (cambió de trabajo, nueva publicación en LinkedIn,
  apareció en noticias, etc.): siguen sin implementar. Requieren un
  snapshot comparable entre corridas de enriquecimiento (hoy `insights` se
  pisa cada vez, no hay historial) — acordar el formato del diff antes de
  implementar.
- **Hallazgo sin arreglar** (documentado en `BITACORA.md`, no bloqueante):
  al terminar una corrida por timeout, algunas evidencias nuevas fallan
  por `Foreign key constraint` (entidad descubierta justo antes del corte
  de tiempo, nunca persistida) — pérdida de evidencia acotada, no
  crashea. Separado: 252 evidencias recuperadas de memoria fallan por
  `Unique constraint` en cada corrida repetida (ruido, no pérdida de
  datos, pero desperdicia writes).
- Preguntar si dejar o limpiar el `.env` de prueba de esta VM (Postgres
  local, Apify token, SerpApi key, admin/lead de prueba).
- No se ha hecho commit de ninguno de los cambios de la sesión del
  2026-07-04 — sigue explícitamente pedido por el usuario no commitear
  salvo que lo pida.
- Pendiente de decisión previa (no de esta sesión, sigue abierta): activar
  Google CSE / AI Reasoner real si el usuario consigue
  `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_ID` (nota: `google_cse` da 403 — el
  proyecto de GCP no tiene la Custom Search JSON API habilitada, revisar
  eso si se retoma) u `OPENAI_API_KEY`. También quedó planteado conseguir
  `PROXYCURL_API_KEY` (LinkedIn estructurado) y/o `NEWSAPI_KEY` como
  siguiente mejora de enriquecimiento, sin decisión del usuario todavía.

## Estado del entorno al cierre

- `next dev` corriendo en el puerto 3000 (levantado en esta sesión).
- Worker de OSINT corriendo con todos los fixes de esta sesión aplicados,
  **incluido el fix de `browser-pool.ts`** que hacía que el proceso no
  muriera con `kill` — a partir de este fix un `kill <pid>` normal alcanza,
  ya no debería hacer falta `kill -9` ni `pkill -f` para reiniciarlo (pero
  seguir verificando por las dudas con `ps aux` después de un restart).
- Postgres y Redis activos (systemd).
- Nada de esta sesión está commiteado — sigue pedido explícito del usuario
  no commitear salvo que lo pida.
