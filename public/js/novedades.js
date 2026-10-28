// Recorridos guiados de novedades (Driver.js, en public/vendor/driver.js). La primera vez que ella llega a la pantalla
// donde ocurrió un cambio, 1–3 burbujas lo explican; si ya lo vio o lo saltó, no vuelve a salir.
// Los vistos viven en localStorage (kk_tours) y nunca se borran al reparar ni al actualizar.
import { ls, logError } from "./store.js?v=0.4.9";

// Una entrada por cambio visible. El id nunca se reutiliza ni se cambia (es lo que se guarda como "visto").
// Se conservan las de las últimas ~3 versiones; las más viejas se borran del archivo.
export const NOVEDADES = [
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
  return document.visibilityState !== "visible" || !!document.querySelector(".scanner, #sheet-root > *, .loading, [aria-busy=\"true\"], #kk-rescue");
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
