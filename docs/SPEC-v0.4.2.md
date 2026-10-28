# Cotiza App · v0.4.2 — Navegación simplificada e íconos de redes en el PDF

Aplican las "Reglas que no se rompen" de `docs/SPEC-v0.2.md`. Versión subida con `scripts/bump-version.mjs` (verificada con `check-version.mjs`).

1. **Asistente**: el candado rojo se cambió por el mismo engrane de Cotizaciones, que lleva a `#/ajustes`. La flecha de Ajustes
   regresa al asistente si se abrió desde ahí (el borrador sigue en el mismo paso); si no, a la lista. Se quitaron el estilo
   `.icon-btn.lock` y el ícono del candado. Cerrar sesión sigue al final de Ajustes.
2. **Sin barra inferior** en ninguna pantalla. En la lista (y en Ocultas), botón flotante **+ Nueva**: el mismo componente
   redondo `.act` del asistente (52 px, menta como "Siguiente"), fijo y centrado a `16px + safe area` del borde, con sombra.
   El `padding-bottom` de la lista (120 px) deja ver la última tarjeta. Descartar y Borrador regresan a la lista; Guardar abre Detalle.
3. **Íconos del PDF**: glifos oficiales de Simple Icons (CC0) para WhatsApp, Instagram, Facebook y TikTok, y un globo de línea para el sitio web.
   Van en un círculo `#002C37` con el glifo calado, igual que los de teléfono y correo (que no cambian). Facebook usa su glifo completo,
   que ya es un círculo. PNG de 96×96 con fondo transparente, generados con `scripts/build-redes-icons.mjs` (sharp + simple-icons, devDependencies).
   Mismos nombres de archivo. En el pie del PDF, el texto queda centrado verticalmente con el ícono.
4. **Manifest**: `background_color` `#002C37` (sin destello blanco al abrir). `start_url` sigue en `/#/nueva`.
