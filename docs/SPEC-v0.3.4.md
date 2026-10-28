# Cotiza App · v0.3.4 — Ajustes, correo de reportes y "Ver mis cotizaciones"

Aplican las "Reglas que no se rompen" de `docs/SPEC-v0.2.md`.

1. **Ajustes**: después de Guardar ajustes y Datos, termina en Ayuda → Registro del servidor → Versión → Verificar → Sesión
   (Cerrar sesión, en rojo, hasta abajo). La tarjeta "Seguridad" se dividió en Verificar y Sesión. Padding inferior `24px + safe area`.
2. **Correo de reportes**: `REPORTES_EMAIL = "hola@kuukum.mx"` en `wrangler.toml` `[vars]`. Sin valor por defecto en el código:
   si falta, `/api/reportes` responde 500 con `requestId` (el ticket queda guardado para reintentar). `reportes_email` salió de
   `DEFAULT_CONFIG` y de Ajustes, y se ignora si llega en `PUT /api/config` o si sigue en el KV. Ayuda dice "Los reportes llegan al equipo de Kuu Kum."
   Remitente comprobado: `"Cotiza App" <notifications@kuukum.odoo.com>` y `reply_to` = quien reporta (desde la 0.3.3).
3. **Ver mis cotizaciones**: al final de Detalle, debajo de "Abrir S000xx en Odoo", con el mismo estilo de contorno; va a `#/cotizaciones`.
   Después de Guardar/Enviar en el Paso 4 la app abre Detalle (no hay pantalla de confirmación aparte), así que el botón aparece ahí.

## Criterios de aceptación
- Ajustes termina en: Ayuda → Registro del servidor → Versión → Verificar → Sesión.
- Ajustes ya no muestra el correo de reportes; los reportes llegan a `hola@kuukum.mx` vía `REPORTES_EMAIL`.
- Detalle termina con **Ver mis cotizaciones**.
