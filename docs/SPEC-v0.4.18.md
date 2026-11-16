# Cotiza 0.4.18 — Ficha: botón redondo, botonera y foto que no se aplasta

- **Botón Ficha**: círculo morado de marca (#5B47D6, 48 px), solo el ícono (i), al centro del renglón de abajo de la línea.
- **Foto**: el carrusel mide 280 px fijos. La hoja de la ficha usa `grid-auto-rows: max-content` para que una tabla larga
  no aplaste la foto (era la causa de la foto "cortada", del botón de compartir oculto y de la foto que "a veces no sale").
- **Carga**: cada foto se descarga una sola vez (`/api/imagen`, un reintento a los 800 ms) y se muestra desde ese blob;
  compartir usa la misma copia. Mientras carga se ve un brillo. Si no hay Foto 2, su cuadro se quita.
- **Botonera** debajo de la foto, solo íconos: Compartir (la foto visible, sin texto) y Ver en la tienda.
- **Ver en la tienda**: `GET /api/tienda?sku=` busca en la Store API pública de WooCommerce el padre (3 primeros segmentos
  del SKU, como geek-sync) y devuelve su `permalink`. Si no está publicado, el botón queda tenue y avisa.
- **Fondo fijo**: con cualquier hoja abierta, `html.hoja-abierta` bloquea el scroll de la pantalla de atrás.
