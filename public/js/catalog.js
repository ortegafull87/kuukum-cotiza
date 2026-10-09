// Lee el nombre "codificado" de cada producto de Odoo y saca atributos para los chips.
// Ej: "Playera Gildan. Negro. 100% Algodón. 1/DTF/AN. 1/DTF/RE. M - H"
const N = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PRENDAS = [
  ["Sudadera", /sudadera/], ["Polo", /\bpolo\b/], ["Camisa", /camisa/], ["Pañalero", /panalero/],
  ["Playera", /playera|camiseta/], ["Taza", /taza/], ["Tarro", /tarro/], ["Tumbler", /tumbler/],
  ["Termo", /termo/], ["Botella", /botella/], ["Vaso", /vaso/], ["Gorra", /gorra/],
  ["Tote bag", /tote|totte/], ["Lanyard", /lanyard|porta gafete/], ["Libreta", /libreta/],
  ["Bolígrafo", /boligrafo/], ["Stickers", /sticker/], ["Flyers", /flyer/], ["Etiquetas", /etiqueta|sello de seguridad|suaje/],
  ["Señalética", /lamina|senalizacion/], ["Bolsa", /bolsa/], ["Servicio", /envio|estampado/]
];
const COLORES = [
  ["Blanco", /\bblanc[oa]\b/], ["Negro", /\bnegr[oa]\b/], ["Gris", /\bgris\b/], ["Rojo", /\broj[oa]\b/],
  ["Celeste", /celeste/], ["Rosa", /\brosa\b/], ["Arena", /\barena\b/], ["Beige", /beige/],
  ["Verde", /\bverde\b/], ["Azul", /\bazul\b/], ["Naranja", /naranja/], ["Color", /\bcolor(es)?\b/]
];
const MATERIALES = [
  ["Algodón", /algodon/], ["Poliéster", /poo?liester/], ["Licra", /licra/], ["DryFit", /dryfit/],
  ["Cerámica", /ceramica/], ["Vidrio", /vidrio/], ["Aluminio", /aluminio/], ["Acero", /acero/],
  ["Manta", /manta/], ["Plástico", /plastico/]
];
const TECNICAS = [
  ["DTF UV", /dtf\s*\/?\s*uv|uv\s*dtf/], ["DTF", /\bdtf\b/], ["Sublimación", /\bsub\b|sublima/],
  ["Vinil", /vinil/], ["Láser", /laser/], ["Serigrafía", /serigrafia/]
];
const UBICACIONES = [
  ["Frente", /\/an\b|\/anv\b|\/a\b|\/fre\b|anverso|frente/], ["Espalda", /\/re\b|\/rev\b|reverso|espalda/],
  ["Logo 10 cm", /logo\/10/], ["Manga", /\/man\b|manga larga/], ["Circular", /\/cir\b/], ["2 caras", /2 caras|full ?print/]
];
const TALLAS = ["CH", "M", "G", "XL", "XXL", "XG", "1T", "2T", "3T"];
const GENERO = { H: "Caballero", C: "Caballero", M: "Dama", D: "Dama", I: "Infantil", B: "Infantil", U: "Unisex" };
const SOLO_GENERO = new Set(["H", "C", "D", "I", "B", "U"]);

function pick(list, n) { return list.filter(([, re]) => re.test(n)).map(([v]) => v); }

function sizeAndGender(name) {
  const last = String(name).split(".").map((s) => s.trim()).filter(Boolean).pop() || "";
  const toks = last.toUpperCase().split(/[\s\-_]+/).filter(Boolean);
  if (!toks.length || toks.length > 2 || !toks.every((t) => TALLAS.includes(t) || GENERO[t] || t === "V")) return {};
  if (toks.length === 1) return TALLAS.includes(toks[0]) ? { talla: toks[0] } : {};
  let [a, b] = toks;
  if (SOLO_GENERO.has(a) && TALLAS.includes(b)) [a, b] = [b, a];
  return { talla: TALLAS.includes(a) ? a : undefined, genero: GENERO[b] };
}

export const FACETAS = [
  ["prenda", "Prenda"], ["genero", "Género"], ["material", "Material"], ["color", "Color"],
  ["talla", "Talla"], ["tecnica", "Técnica"], ["ubicacion", "Ubicación"]
];

export function enrich(products) {
  return products.map((p) => {
    const n = N(p.n);
    const sg = sizeAndGender(p.n);
    let tecnica = pick(TECNICAS, n);
    if (tecnica.includes("DTF UV")) tecnica = tecnica.filter((x) => x !== "DTF");
    return {
      ...p,
      _q: n,
      tags: {
        prenda: pick(PRENDAS, n).slice(0, 1),
        genero: sg.genero ? [sg.genero] : [],
        material: pick(MATERIALES, n),
        color: pick(COLORES, n),
        talla: sg.talla ? [sg.talla] : [],
        tecnica,
        ubicacion: pick(UBICACIONES, n)
      }
    };
  });
}

// Filtra por chips seleccionados ({faceta: valor}) y texto libre.
export function filter(products, sel, text) {
  const words = N(text || "").split(/\s+/).filter(Boolean);
  return products.filter((p) =>
    Object.entries(sel).every(([k, v]) => !v || p.tags[k].includes(v)) && words.every((w) => p._q.includes(w)));
}

// Valores disponibles por faceta dentro del conjunto actual (para no mostrar chips sin resultados).
export function facetValues(products) {
  const out = {};
  for (const [k] of FACETAS) {
    const m = new Map();
    for (const p of products) for (const v of p.tags[k]) m.set(v, (m.get(v) || 0) + 1);
    out[k] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }
  return out;
}
