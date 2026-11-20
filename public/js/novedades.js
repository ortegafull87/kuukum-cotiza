// Recorridos guiados de novedades (Driver.js, en public/vendor/driver.js). La primera vez que ella llega a la pantalla
// donde ocurrió un cambio, 1–3 burbujas lo explican; si ya lo vio o lo saltó, no vuelve a salir.
// Los vistos viven en localStorage (kk_tours) y nunca se borran al reparar ni al actualizar.
import { ls, logError } from "./store.js?v=0.4.26";

// Una entrada por cambio visible. El id nunca se reutiliza ni se cambia (es lo que se guarda como "visto").
// Se conservan las de las últimas ~3 versiones; las más viejas se borran del archivo.
export const NOVEDADES = [
  {
    id: "0.4.26-tecnica",
    titulo: "Precio con la técnica incluida",
    ruta: "#/nueva",
    pasos: [
      { el: "button.dashed[data-act=openSheet]", titulo: "Elige la técnica en el buscador",
        texto: "Algunos productos ahora salen una vez por técnica, por ejemplo «Bolígrafo Láser · Grabado láser». El precio por cantidad ya trae la pieza y la técnica sumadas, igual que en la tienda; ya no hace falta agregar la técnica aparte." }
    ]
  },
  {
    id: "0.4.25-comparativa",
    titulo: "Cotización comparativa",
    ruta: "#/nueva",
    pasos: [
      { el: "#comparativa", titulo: "Cotización comparativa",
        texto: "Para que el cliente compare la misma pieza con 20, 50 o 100 piezas. Cada renglón sale como opción con su SKU y su total con IVA, no se suman y el PDF dice que no es válida para facturación. Se activa aquí, o sola cuando agregas un producto que ya estaba." },
      { el: "#mini3", titulo: "Opciones",
        texto: "Aquí ves cada opción con y sin IVA. Cuando el cliente elija, abre la cotización y toca «Convertir en formal»: se hace la siguiente revisión ya con total, anticipo y datos de pago." }
    ]
  },
  {
    id: "0.4.24-mismo-producto",
    titulo: "Mismo producto, varias cantidades",
    ruta: "#/nueva",
    pasos: [
      { el: "button.dashed[data-act=openSheet]", titulo: "Mismo producto, varias cantidades",
        texto: "Si agregas un producto que ya está en la cotización, ahora entra en otro renglón en vez de sumarse. Así puedes cotizar la misma pluma con 20, 50 y 100 piezas y el cliente compara; cada renglón toma el precio de su cantidad." }
    ]
  },
  {
    id: "0.4.21-guia-sku",
    titulo: "Guía de SKU",
    ruta: "#/ajustes",
    pasos: [
      { el: "#btn-guia-sku", titulo: "Guía de SKU",
        texto: "¿Qué significa cada letra del SKU? Aquí está la guía con las categorías y los colores. También la abres tocando el SKU de cualquier producto en el buscador o en la Ficha (i), donde además ves el código de cada proveedor para copiarlo." }
    ]
  },
  {
    id: "0.4.20-buscador-sku",
    titulo: "Buscar por SKU",
    ruta: "#/nueva",
    // Los recorridos no salen con la hoja abierta: se apunta al botón que abre el buscador.
    pasos: [
      { el: "button.dashed[data-act=openSheet]", titulo: "Buscar por SKU",
        texto: "Ahora puedes pegar en el buscador el SKU que te llega por WhatsApp, el código del proveedor, el nombre o la categoría. Mientras escribes, los filtros se esconden para que veas más resultados; puedes cambiarlo en Ajustes." }
    ]
  },
  {
    id: "0.4.14-ficha-rangos",
    titulo: "Ficha y precio por cantidad",
    ruta: "#/nueva",
    pasos: [
      { el: ".line .info-btn", titulo: "Ficha del producto",
        texto: "Toca el botón morado (i) para ver las fotos del producto y su tabla de precio por cantidad, con y sin IVA. Abajo de la foto puedes compartirla por WhatsApp o abrir el producto en la tienda." },
      { el: ".line .tramo", titulo: "Precio por cantidad",
        texto: "En los productos con logo incluido, el precio cambia solo según las piezas. Si escribes un precio a mano, se respeta; para regresar al de Odoo toca «volver al tramo»." },
      { el: '.line [data-f="q"]', titulo: "Cantidad mínima",
        texto: "Al agregarlo arranca en el mínimo programado. Puedes poner menos: solo te aparecerá un aviso." }
    ]
  },
  {
    id: "0.4.6-margen",
    titulo: "Ganancia por producto",          // se lista en Ajustes
    ruta: "#/nueva",                           // prefijo de location.hash donde aplica
    pasos: [
      { el: '.line [data-f="c"]', titulo: "Tu costo",
        texto: "Empieza aquí: escribe lo que te cuesta a ti." },
      { el: '.line [data-f="m"]', titulo: "Ganancia %",
        texto: "Escribe cuánto quieres ganar y el precio se calcula solo. Es el % sobre la venta, el mismo de “Tu ganancia” abajo. Verde 45% o más, amarillo 30–44%, rojo menos de 30%." },
      { el: '.line [data-f="p"]', titulo: "Precio unitario",
        texto: "¿Prefieres poner el precio? Escríbelo y el % se ajusta. Si cambias el costo, se respeta lo último que escribiste." }
    ]
  }
];

let activo = false;
const vistos = () => ls.get("tours", []);
function marcarVisto(id) { const v = vistos(); if (!v.includes(id)) ls.set("tours", [...v, id]); }
const visible = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length ? el : null; };

// Algo en pantalla que un recorrido no debe tapar: escáner, hoja inferior, botón cargando, rescate o app en segundo plano.
function pantallaOcupada() {
  return document.visibilityState !== "visible" || !!document.querySelector(".scanner, #sheet-root > *, #guia-root > *, .loading, [aria-busy=\"true\"], #kk-rescue");
}

// Se llama al final de cada render. `ocupada()` dice si la app está en algo que no se debe interrumpir (p. ej. un envío).
export function maybeTour(ocupada = () => false) {
  setTimeout(() => {
    if (activo || ocupada() || pantallaOcupada()) return;
    const v = vistos();
    const n = NOVEDADES.find((x) => !v.includes(x.id) && location.hash.startsWith(x.ruta) && visible(x.pasos[0].el));
    if (n) startTour(n.id);
  }, 400);
}

// forzar (desde Ajustes): ignora los vistos, no exige que existan los elementos y no cambia la marca de visto.
export function startTour(id, { forzar = false } = {}) {
  const n = NOVEDADES.find((x) => x.id === id);
  if (!n || activo || !(window.driver && window.driver.js && window.driver.js.driver)) return;
  activo = true;
  try {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // cierra el teclado
    const d = window.driver.js.driver({
      showProgress: true, progressText: "{{current}} de {{total}}",
      nextBtnText: "Siguiente", prevBtnText: "Atrás", doneBtnText: "Entendido", closeBtnLabel: "Cerrar",
      allowClose: true, overlayClickBehavior: "close", smoothScroll: true, stagePadding: 6,
      // Pasos cuyo elemento no está en pantalla salen como burbuja centrada.
      steps: n.pasos.map((p) => ({ element: visible(p.el) || undefined, popover: { title: p.titulo, description: p.texto } })),
      onDestroyed: () => { activo = false; if (!forzar) marcarVisto(n.id); }
    });
    d.drive();
  } catch (e) {
    // Un recorrido roto no se vuelve a intentar.
    activo = false;
    logError({ tipo: "tour", mensaje: `${n.id}: ${e.message || e}` });
    marcarVisto(n.id);
  }
}
