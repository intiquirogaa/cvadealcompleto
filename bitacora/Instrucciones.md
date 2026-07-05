# Instrucciones — Protocolo de trabajo por sesión

Este archivo registra el protocolo que sigo al iniciar y cerrar cada sesión de
trabajo en este repo. No es un registro de lo que se hizo (eso vive en
`BITACORA.md` y en futuras entradas dentro de esta misma carpeta `bitacora/`)
sino la checklist de *cómo* arranco y cómo cierro.

## Al iniciar sesión

1. Leer `CLAUDE.md` (si existe en el repo) antes que nada.
2. Leer `BITACORA.md` (raíz del repo) y cualquier archivo dentro de
   `bitacora/` para entender el estado y las decisiones de la última sesión
   antes de tocar código.
3. Leer `bitacora/HITOS.md` para entender el avance acumulado sesión a
   sesión.
4. Leer `bitacora/Pendientes.md` para saber qué quedó anotado como tarea
   para esta sesión.
5. Correr `git status` para ver si hay cambios sin commitear (de esta sesión
   o de una anterior) antes de asumir que el working tree está limpio.
6. Revisar si hay procesos relevantes corriendo (`next dev`, el worker de
   BullMQ, Postgres, Redis) con `ps aux` — no asumir que están arriba ni que
   están caídos.
7. Si hay que reiniciar el worker u otro proceso de sesiones anteriores:
   matarlo por PID explícito (`ps aux | grep ... | awk '{print $2}' | xargs
   kill`), nunca por `pkill -f` — confirmado en una sesión anterior que
   `pkill -f` puede no matar el proceso de forma confiable y termina
   acumulando varios workers compitiendo por los mismos jobs.
8. Confirmar con el usuario antes de matar/reiniciar un proceso que no fue
   levantado por mí en la sesión actual.

## Al cerrar sesión

1. Actualizar la bitácora con: qué se hizo, qué bugs reales se encontraron
   (no solo lo que se pidió arreglar), qué quedó pendiente, y qué decisiones
   tomó el usuario (alcance aceptado, cosas explícitamente rechazadas).
2. Escribir el avance de la sesión en `bitacora/HITOS.md` (qué se logró,
   como un registro acumulativo sesión a sesión).
3. Escribir en `bitacora/Pendientes.md` las cosas que deben hacerse en la
   sesión siguiente.
4. Dejar registrado el estado del entorno de prueba: qué queda corriendo
   (worker, `next dev`, DB), qué credenciales/leads de prueba existen, y qué
   haría falta para retomar en la próxima sesión.
5. No hacer commit de los cambios salvo pedido explícito del usuario — es
   una preferencia confirmada, no asumirla como implícita nunca.
6. Señalar explícitamente cualquier decisión abierta que quedó sin resolver
   (ej. limpiar un `.env` de prueba, arreglar algo fuera del alcance
   acordado) en vez de dejarla enterrada en el detalle de la sesión.

## Principios generales

a. No modificar código que funcione. Si no está roto y no es parte de lo
   pedido, no se toca.
b. Inserciones quirúrgicas y precisas, tanto en documentos de análisis como
   en el código que se produzca — cambios acotados al problema puntual, sin
   arrastrar refactors ni limpieza no pedida.
c. No usar supuestos: siempre verificar antes de proceder (leer el archivo
   real, correr el comando, confirmar el dato) en vez de asumir.
d. Tomar el contenido del directorio del proyecto como fuente de verdad
   habitual.
e. Avisar antes de salir a buscar fuentes de verdad en la web.
f. Evitar el sesgo de confirmación: no buscar solo lo que confirme una
   hipótesis propia, considerar activamente qué la refutaría.
g. Tener siempre como objetivo lo que el humano declare como objetivo del
   proyecto — no reemplazarlo por una interpretación propia.
h. Atenerse siempre a las mejores prácticas de desarrollo de software.
