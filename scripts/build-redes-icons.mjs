// Genera los íconos de redes del pie del PDF en public/img/redes/ (se commitean: el deploy no tiene paso de build).
// Glifos oficiales de Simple Icons (CC0): WhatsApp, Instagram, Facebook y TikTok. El sitio web usa un globo de línea,
// como los íconos de la app. Todos en un círculo #002C37 con el glifo calado (transparente), 96×96, igual que los de
// teléfono y correo, para que la fila del pie se vea pareja. Los glifos no se deforman: escala uniforme y centrados.
// Uso: node scripts/build-redes-icons.mjs   (requiere las devDependencies sharp y simple-icons)
import sharp from "sharp";
import { siWhatsapp, siInstagram, siFacebook, siTiktok } from "simple-icons";

const OUT = new URL("../public/img/redes/", import.meta.url);
const COLOR = "#002C37", SIZE = 96;

// Círculo con el contenido calado: lo negro de la máscara queda transparente.
const circulo = (calado) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs><mask id="m"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${calado}</mask></defs>
  <circle cx="48" cy="48" r="48" fill="${COLOR}" mask="url(#m)"/></svg>`;
// Glifo de Simple Icons (viewBox 24×24) escalado de forma uniforme y centrado.
const glifo = (icon, lado) => {
  const k = lado / 24, off = (SIZE - lado) / 2;
  return `<path transform="translate(${off} ${off}) scale(${k})" d="${icon.path}" fill="#000"/>`;
};
// Globo de línea (misma familia que los íconos de la app: trazo redondeado sobre una cuadrícula de 24).
const globo = (lado) => {
  const k = lado / 24, off = (SIZE - lado) / 2;
  return `<g transform="translate(${off} ${off}) scale(${k})" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4.2" ry="10"/><path d="M2 12h20M3.6 7h16.8M3.6 17h16.8"/></g>`;
};

const ICONOS = {
  whatsapp: circulo(glifo(siWhatsapp, 54)),
  instagram: circulo(glifo(siInstagram, 50)),
  tiktok: circulo(glifo(siTiktok, 50)),
  web: circulo(globo(56)),
  // El glifo de Facebook ya es un círculo con la "f" calada: se usa completo, sin otra forma alrededor.
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24"><path d="${siFacebook.path}" fill="${COLOR}"/></svg>`
};

for (const [nombre, svg] of Object.entries(ICONOS)) {
  const out = new URL(nombre + ".png", OUT);
  await sharp(Buffer.from(svg), { density: 300 }).resize(SIZE, SIZE).png({ compressionLevel: 9 }).toFile(out.pathname);
  console.log("✓", decodeURIComponent(out.pathname.split("/public/")[1]));
}
