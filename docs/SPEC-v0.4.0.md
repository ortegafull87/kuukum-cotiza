# Cotiza App · v0.4.0 — Estado de Odoo reflejado en la app

Aplican las "Reglas que no se rompen" de `docs/SPEC-v0.2.md`. Odoo manda: la app solo lee el estado, nunca lo cambia.

| Estado en Odoo | Etiqueta | Se permite |
|---|---|---|
| `draft` / `sent` | como antes | todo |
| `sale` | **Pedido confirmado** (menta) | Reenviar PDF, Texto, Duplicar, Abrir en Odoo (sin Editar ni correo) |
| `cancel` | **Cancelada en Odoo** (rojo tenue, atenuada) | Duplicar, Abrir en Odoo, Ocultar |
| no existe | **Eliminada en Odoo** (gris, atenuada) | Duplicar, Ocultar |

- Detalle de cancelada o eliminada: aviso "Esta cotización se canceló en Odoo el 12 oct. Para cotizar de nuevo usa Duplicar." (fecha de `write_date`).
- **Ocultar** (`oculta: true`) solo la quita de la lista en ese teléfono; "Ver ocultas (N)" al final de la lista y "Mostrar en la lista" en Detalle.
- `POST /api/estado {uuids}` (máx 200): `sync:<uuid>` → id; una sola llamada `sale.order.search_read` por ids; los que no regresan = `eliminada`.
  Guarda `estadoOdoo`/`estadoFecha` en `sync:<uuid>` (solo si cambió). Con log estructurado.
- Consulta: al abrir la lista, al volver a primer plano y tras cada `syncAll()` exitoso, máx. 1 vez cada 5 min (cuenta el intento).
  Sin límite al jalar la lista hacia abajo o al tocar el estado en Detalle. Solo en línea y para `sync: "ok"` no eliminadas.
- Servidor: revisión sobre orden eliminada → 409 "Esta cotización se eliminó en Odoo. Duplícala para hacer una nueva." (`codigo: "eliminada"`);
  cancelada → 409 `codigo: "cancel"`. `/api/correo` cancelada/eliminada → 409 con `codigo` (la app deja de reintentar).
  `/api/verificar` agrega `estadoOdoo` (el campo `estado` ya era el resultado del sello): "✅ Sello auténtico · ⚠️ Cotización cancelada (no vigente)".
- Lectura de órdenes con `search_read` por id (`leerOrden`): en Odoo, `read` de un id eliminado lanza MissingError. El mock ahora se comporta igual.
- Marcar "enviada" solo si la orden sigue en borrador: el fallback `write state=sent` habría "des-cancelado" una orden cancelada.
