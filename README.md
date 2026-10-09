# Kuukum Cotiza (MVP0)

App web instalable (PWA) para cotizar desde el teléfono, con o sin internet. Sincroniza clientes y cotizaciones con Odoo y comparte el PDF por WhatsApp.

- **Frontend**: `public/`. HTML/JS sin build. Funciona offline gracias al service worker.
- **API**: `functions/api/`, sobre Cloudflare Pages Functions. Hace el login con Google, el sync con Odoo (JSON-2) y la verificación de sellos.
- **Datos en Cloudflare**: un KV llamado `KK` guarda la configuración, la idempotencia del sync, los sellos y el último folio de cada usuario.

## 1. Google Cloud (proyecto "Kuukum Cotiza")
En la credencial OAuth (tipo Aplicación web, Client ID `273765990336-id4d6…`):
- **Orígenes de JavaScript autorizados**: `https://cotiza.kuukum.mx` y `https://kuukum-cotiza.pages.dev`.
- **URI de redireccionamiento autorizados**: `https://cotiza.kuukum.mx/api/auth/google` y `https://kuukum-cotiza.pages.dev/api/auth/google`.
- **Pantalla de consentimiento**: tipo Externa, con los scopes `openid`, `email` y `profile`. Puedes publicarla a Producción porque estos scopes no requieren verificación de Google.

## 2. Odoo
Loida entra a **Mis preferencias → Seguridad de la cuenta → Nueva clave API**. Le pone de nombre "Kuukum Cotiza". La clave va directo a Cloudflare (paso 3). No la mandes por chat ni la guardes en el repo.

## 3. Cloudflare
```bash
npm install
npx wrangler login
npx wrangler kv namespace create KK          # copia el id a wrangler.toml
npx wrangler pages project create kuukum-cotiza --production-branch main
npx wrangler pages secret put ODOO_API_KEY   --project-name kuukum-cotiza
npx wrangler pages secret put SESSION_SECRET --project-name kuukum-cotiza   # openssl rand -base64 32
npx wrangler pages secret put SEAL_SECRET    --project-name kuukum-cotiza   # openssl rand -base64 32
npm run deploy
```
**`SEAL_SECRET` no se cambia nunca.** Si cambia, los sellos de todas las cotizaciones anteriores dejan de verificar. Guárdalo en tu gestor de contraseñas.

Para `SESSION_SECRET` la regla es otra: cambiarlo cierra la sesión de todos los usuarios, nada más.

## 4. Subdominio en IONOS
1. En Cloudflare: **Pages → kuukum-cotiza → Custom domains → Add**, y escribes `cotiza.kuukum.mx`.
2. En el DNS de IONOS: crea un registro **CNAME** `cotiza` → `kuukum-cotiza.pages.dev`.
3. Espera a que Cloudflare muestre el dominio como *Active*. El SSL se emite solo.

## 5. Instalar en el iPhone
1. Abre `https://cotiza.kuukum.mx` en **Safari** y entra con Google.
2. Toca Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde el ícono. A partir de ahí funciona sin internet.

Primera prueba recomendada: entrar con Google **desde el ícono instalado**. iOS maneja las PWAs instaladas con su propio almacenamiento. Si el login no regresa a la app, entra primero desde Safari y luego agrégala a la pantalla de inicio.

## Cómo funciona
- **Folios**: `KK-` + la letra del usuario + un consecutivo (`KK-L0012`). Al sincronizar, Odoo le asigna su número `S000xx`. El folio de la app queda en *Referencia del cliente*.
- **Sync**: guarda todo en el teléfono y lo sube a Odoo en cuanto hay internet. Ocurre al abrir la app, al recuperar la conexión, cada minuto si hay pendientes, o tocando el indicador de sync. Es idempotente: reintentar no duplica cotizaciones en Odoo.
- **Qué crea en Odoo**:
  - `sale.order` en borrador, con cliente, canal (`source_id`), vigencia, términos, líneas con descuento, IVA (impuesto id 14) y costo (`purchase_price`).
  - Se marca como **Enviada** cuando se comparte el PDF.
  - Los clientes nuevos se buscan por teléfono y, si no existen, se crean.
  - Las líneas de "Producto libre" usan el producto `KK-LIBRE`, que se crea solo la primera vez.
- **Sello**: HMAC-SHA256 del contenido (folio, fecha, cliente, partidas, descuento, IVA, total y anticipo), con una llave derivada por usuario. La llave vive en el teléfono como `CryptoKey` no extraíble. La pantalla **Ajustes → Verificar sello** (o el QR del PDF) muestra lo que realmente se cotizó.
- **Catálogo**: los chips (prenda, género, material, color, talla, técnica, ubicación) salen del nombre de cada producto en Odoo. Se ocultan los gastos internos y los productos con precio ≤ $1 o más de 20 veces su costo. La lista de ocultos aparece en Ajustes.
- **Configuración**: el correo, los teléfonos, las redes, el banco, el anticipo, la entrega, los términos y los correos con acceso se editan en **Ajustes** y aplican para todos.

## Desarrollo local
```bash
printf 'ODOO_API_KEY=...\nSESSION_SECRET=dev\nSEAL_SECRET=dev\n' > .dev.vars
npx wrangler pages dev public
```
El login con Google no funciona en `localhost` a menos que lo agregues como origen y redirect en la credencial.
