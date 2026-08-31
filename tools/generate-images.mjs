/**
 * Generador de las ilustraciones originales de Hotel Almara.
 *
 * Todas las imágenes del sitio son arte vectorial propio creado por este
 * script: nada de banco de imágenes. Al construirse desde una única paleta,
 * una única dirección de luz (sol bajo, cálido, a la derecha) y un mismo
 * lenguaje gráfico (siluetas planas + degradados suaves + grano), las piezas
 * mantienen coherencia entre sí.
 *
 *   node tools/generate-images.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'assets', 'img');

/* ------------------------------------------------------------------ *
 * Paleta: arena, terracota, blanco roto y azul mediterráneo.
 * ------------------------------------------------------------------ */
const C = {
  hueso: '#FAF5EE',
  arenaClara: '#F1E4D2',
  arena: '#E4D0B4',
  arenaMedia: '#D3B893',
  arenaOscura: '#B9986F',
  terracotaClara: '#E5926B',
  terracota: '#C2694A',
  terracotaOscura: '#94432E',
  azulClaro: '#7FB6CD',
  azul: '#2E6E8E',
  azulProfundo: '#1A4560',
  noche: '#12293A',
  turquesa: '#57ABA6',
  oliva: '#7C8B6A',
  olivaOscura: '#48573D',
  sol: '#FFD79B',
  solNucleo: '#FFF4E2',
  ambar: '#F2A868',
  rosa: '#D98A86',
  tinta: '#2B211C',
  sombra: '#5A463C',
};

/* ------------------------------------------------------------------ *
 * Utilidades numéricas y de trazado
 * ------------------------------------------------------------------ */
const n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** PRNG determinista: el mismo semillero produce siempre el mismo dibujo. */
function azar(semilla) {
  let t = semilla >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom convertido a curvas de Bézier: siluetas orgánicas y suaves. */
function suavizar(pts) {
  if (pts.length < 2) return '';
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n(c1[0])} ${n(c1[1])},${n(c2[0])} ${n(c2[1])},${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/**
 * Perfil ondulado (duna, colina, ola) generado sumando senos.
 * @param {number} ancho  ancho del lienzo
 * @param {number} baseY  altura media del perfil
 * @param {Array<[number,number]>} ondas pares [amplitud, frecuencia]
 */
function cresta(ancho, baseY, ondas, semilla, { hasta = null, muestras = 26 } = {}) {
  const r = azar(semilla);
  const capas = ondas.map(([amp, frec]) => ({ amp, frec, fase: r() * Math.PI * 2 }));
  const pts = [];
  for (let i = 0; i <= muestras; i++) {
    const x = (ancho * i) / muestras;
    let y = baseY;
    for (const c of capas) y += c.amp * Math.sin(c.frec * (x / ancho) * Math.PI * 2 + c.fase);
    pts.push([x, y]);
  }
  let d = suavizar(pts);
  if (hasta !== null) d += `L${n(ancho)} ${n(hasta)}L0 ${n(hasta)}Z`;
  return d;
}

/* ------------------------------------------------------------------ *
 * Definiciones reutilizables (degradados, filtros)
 * ------------------------------------------------------------------ */
const linG = (id, paradas, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${paradas
    .map(([o, col, a = 1]) => `<stop offset="${o}" stop-color="${col}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`)
    .join('')}</linearGradient>`;

const radG = (id, paradas, { cx = 0.5, cy = 0.5, r = 0.5, fx = null, fy = null } = {}) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx !== null ? ` fx="${fx}"` : ''}${
    fy !== null ? ` fy="${fy}"` : ''
  }>${paradas
    .map(([o, col, a = 1]) => `<stop offset="${o}" stop-color="${col}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`)
    .join('')}</radialGradient>`;

/**
 * Grano de película: da textura y calidez, y evita el aspecto "plano digital".
 * El ruido se tiñe de marrón cálido y sólo modula el alfa, así que no lava
 * los colores como haría un gris al 10 %.
 */
const filtroGrano = (id, { frecuencia = 0.9, semilla = 3, fuerza = 0.42 } = {}) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
  `<feTurbulence type="fractalNoise" baseFrequency="${frecuencia}" numOctaves="3" seed="${semilla}" result="ruido"/>` +
  `<feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0.42 0 0 0 0 0.29 0 0 0 0 0.18 0 0 0 ${fuerza} -${n(
    fuerza * 0.42
  )}"/>` +
  `</filter>`;

/** Desenfoque suave para halos y sombras. */
const filtroDesenfoque = (id, desv) => `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${desv}"/></filter>`;

/** Capa de grano + viñeta que cierra todas las escenas. */
function acabado(w, h, { grano = 'grano', vineta = 'vineta', opacidadGrano = 0.5 } = {}) {
  return (
    `<rect width="${w}" height="${h}" filter="url(#${grano})" opacity="${opacidadGrano}"/>` +
    `<rect width="${w}" height="${h}" fill="url(#${vineta})"/>`
  );
}

const defsAcabado = (w, h) =>
  filtroGrano('grano') +
  radG(
    'vineta',
    [
      ['55%', C.tinta, 0],
      ['100%', C.tinta, 0.28],
    ],
    { cx: 0.5, cy: 0.46, r: 0.78 }
  );

/** Envoltorio SVG común a todas las piezas. */
function svg(w, h, defs, cuerpo, { titulo = '' } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"` +
    (titulo ? ` aria-label="${titulo}"` : '') +
    `>` +
    (titulo ? `<title>${titulo}</title>` : '') +
    `<defs>${defs}</defs>` +
    cuerpo +
    `</svg>`
  );
}

function escribir(nombre, contenido) {
  writeFileSync(join(SALIDA, nombre), contenido + '\n', 'utf8');
  const kb = (Buffer.byteLength(contenido) / 1024).toFixed(1);
  console.log(`  ✓ ${nombre.padEnd(28)} ${kb.padStart(6)} KB`);
}

/* ------------------------------------------------------------------ *
 * Elementos de escena reutilizables
 * ------------------------------------------------------------------ */

/** Sol bajo con halo cálido: la fuente de luz de toda la colección. */
function sol(cx, cy, r, { halo = 5.5, id = 'sol' } = {}) {
  return {
    defs:
      radG(
        `${id}Halo`,
        [
          ['0%', C.sol, 0.62],
          ['38%', C.ambar, 0.24],
          ['100%', C.ambar, 0],
        ],
        {}
      ) +
      radG(`${id}Disco`, [
        ['0%', C.solNucleo, 1],
        ['62%', C.sol, 1],
        ['100%', C.ambar, 0.92],
      ]),
    cuerpo:
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * halo)}" fill="url(#${id}Halo)"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id}Disco)"/>`,
  };
}

/** Reflejo del sol sobre el agua: trazos elípticos que se abren al acercarse. */
function reflejoSolar(cx, desdeY, hastaY, anchoMax, semilla, color = C.sol) {
  const r = azar(semilla);
  const alto = hastaY - desdeY;
  let s = '';
  let y = desdeY;
  let i = 0;
  while (y < hastaY) {
    const t = (y - desdeY) / alto;
    const ancho = anchoMax * (0.12 + t * t * 0.95) * (0.55 + r() * 0.6);
    const gruesa = 1.4 + t * 5.5 * (0.6 + r() * 0.8);
    const desvio = (r() - 0.5) * anchoMax * t * 0.5;
    s += `<ellipse cx="${n(cx + desvio)}" cy="${n(y)}" rx="${n(ancho / 2)}" ry="${n(gruesa / 2)}" fill="${color}" opacity="${n(
      0.5 - t * 0.24
    )}"/>`;
    y += 4 + t * 26 + r() * 9;
    i++;
    if (i > 200) break;
  }
  return s;
}

/** Bandas de oleaje sobre el mar. */
function oleaje(w, desdeY, hastaY, semilla, { color = C.hueso, densidad = 26 } = {}) {
  const r = azar(semilla);
  let s = '';
  for (let i = 0; i < densidad; i++) {
    const t = Math.pow(i / densidad, 1.5);
    const y = desdeY + t * (hastaY - desdeY);
    const x = r() * w;
    const largo = w * (0.04 + r() * 0.16) * (0.4 + t);
    const grosor = 1 + t * 4;
    s += `<rect x="${n(x)}" y="${n(y)}" width="${n(largo)}" height="${n(grosor)}" rx="${n(grosor / 2)}" fill="${color}" opacity="${n(
      0.1 + r() * 0.22
    )}"/>`;
  }
  return s;
}

/** Palmera estilizada en silueta. */
function palmera(x, baseY, altura, semilla, { color = C.olivaOscura, hojas = 7, inclina = 0 } = {}) {
  const r = azar(semilla);
  const puntaX = x + inclina * altura;
  const puntaY = baseY - altura;
  const tronco =
    `<path d="M${n(x - altura * 0.028)} ${n(baseY)}` +
    `Q${n(x + inclina * altura * 0.35 - altura * 0.02)} ${n(baseY - altura * 0.55)},${n(puntaX - altura * 0.014)} ${n(puntaY)}` +
    `L${n(puntaX + altura * 0.014)} ${n(puntaY)}` +
    `Q${n(x + inclina * altura * 0.35 + altura * 0.022)} ${n(baseY - altura * 0.55)},${n(x + altura * 0.03)} ${n(baseY)}Z" fill="${color}"/>`;
  let fronda = '';
  for (let i = 0; i < hojas; i++) {
    const a = Math.PI * (0.06 + (0.88 * i) / (hojas - 1)) + (r() - 0.5) * 0.16;
    const largo = altura * (0.42 + r() * 0.22);
    const ex = puntaX - Math.cos(a) * largo;
    const ey = puntaY - Math.sin(a) * largo * 0.72 + largo * 0.34;
    const cx1 = puntaX - Math.cos(a) * largo * 0.5;
    const cy1 = puntaY - Math.sin(a) * largo * 0.78;
    fronda +=
      `<path d="M${n(puntaX)} ${n(puntaY)}Q${n(cx1)} ${n(cy1)},${n(ex)} ${n(ey)}` +
      `Q${n(cx1)} ${n(cy1 - largo * 0.13)},${n(puntaX)} ${n(puntaY)}Z" fill="${color}"/>`;
  }
  return tronco + fronda;
}

/** Mata de barrón / hierba de duna. */
function hierba(x, baseY, altura, semilla, { color = C.olivaOscura, briznas = 9 } = {}) {
  const r = azar(semilla);
  let s = '';
  for (let i = 0; i < briznas; i++) {
    const h = altura * (0.5 + r() * 0.6);
    const curva = (r() - 0.5) * h * 0.85;
    const bx = x + (r() - 0.5) * altura * 0.5;
    s += `<path d="M${n(bx)} ${n(baseY)}Q${n(bx + curva * 0.4)} ${n(baseY - h * 0.6)},${n(bx + curva)} ${n(
      baseY - h
    )}" stroke="${color}" stroke-width="${n(1 + altura * 0.02)}" fill="none" stroke-linecap="round" opacity="${n(0.75 + r() * 0.25)}"/>`;
  }
  return s;
}

/** Bandada lejana: dos trazos por ave, apenas insinuados. */
function aves(pts, escala, color = C.tinta, opacidad = 0.4) {
  return pts
    .map(
      ([x, y, e = 1]) =>
        `<path d="M${n(x - escala * e)} ${n(y)}q${n(escala * e * 0.5)} ${n(-escala * e * 0.55)},${n(escala * e)} 0q${n(
          escala * e * 0.5
        )} ${n(-escala * e * 0.55)},${n(escala * e)} 0" stroke="${color}" stroke-width="${n(
          escala * e * 0.22
        )}" fill="none" stroke-linecap="round" opacity="${opacidad}"/>`
    )
    .join('');
}

/** Cometa de kitesurf: media luna tensada, el perfil real de una kite. */
function cometa(x, y, tam, color, giro = 0) {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${giro})">` +
    `<path d="M${n(-tam)} 0Q0 ${n(-tam * 1.24)},${n(tam)} 0Q0 ${n(-tam * 0.52)},${n(-tam)} 0Z" fill="${color}"/>` +
    `<path d="M${n(-tam * 0.98)} 0Q0 ${n(-tam * 1.2)},${n(tam * 0.98)} 0" stroke="${C.hueso}" stroke-width="${n(
      tam * 0.06
    )}" fill="none" opacity=".5"/>` +
    [-0.5, 0, 0.5]
      .map(
        (t) =>
          `<line x1="${n(t * tam)}" y1="${n(-tam * (0.62 - t * t * 0.42))}" x2="${n(t * tam * 1.02)}" y2="${n(
            -tam * (0.26 - t * t * 0.2)
          )}" stroke="${C.hueso}" stroke-width="${n(tam * 0.05)}" opacity=".35"/>`
      )
      .join('') +
    `</g>`
  );
}

/** Nubes altas del atardecer: bandas alargadas iluminadas por debajo. */
function nubes(w, desdeY, hastaY, semilla, { cantidad = 7, color = C.hueso, opacidad = 0.5 } = {}) {
  const r = azar(semilla);
  let s = '';
  for (let i = 0; i < cantidad; i++) {
    const y = desdeY + ((hastaY - desdeY) * i) / cantidad + (r() - 0.5) * 20;
    const x = w * (r() * 1.1 - 0.05);
    const largo = w * (0.14 + r() * 0.3);
    const alto = largo * (0.045 + r() * 0.045);
    const op = opacidad * (0.35 + r() * 0.65);
    let banda = '';
    const trozos = 3 + Math.floor(r() * 3);
    for (let j = 0; j < trozos; j++) {
      const t = j / (trozos - 1 || 1);
      banda += `<ellipse cx="${n(x + t * largo)}" cy="${n(y + (r() - 0.5) * alto)}" rx="${n(
        largo * (0.16 + r() * 0.2)
      )}" ry="${n(alto * (0.6 + r() * 0.6))}" fill="${color}"/>`;
    }
    s += `<g opacity="${n(op)}">${banda}</g>`;
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Fondo costero compartido
 * Cielo + sol + mar + orilla. Todas las escenas de exterior parten de
 * aquí, y por eso comparten la misma luz de atardecer.
 * ------------------------------------------------------------------ */
function fondoCostero(w, h, opciones = {}) {
  const {
    horizonte = h * 0.52,
    orilla = h * 0.68,
    solX = w * 0.66,
    solY = null,
    solR = w * 0.026,
    semilla = 11,
    id = 'c',
    cielo = [
      ['0%', '#12344B'],
      ['22%', '#2C6382'],
      ['45%', '#6F9DAF'],
      ['63%', '#C89B82'],
      ['79%', '#EFAE79'],
      ['92%', '#FAD9A8'],
      ['100%', '#FDEDCF'],
    ],
    mar = [
      ['0%', '#EFCE9F'],
      ['14%', '#B9B39B'],
      ['38%', '#5B849A'],
      ['100%', '#2B5D76'],
    ],
    arenaP = [
      ['0%', '#D9B78C'],
      ['22%', '#EAD2AE'],
      ['100%', '#D6B892'],
    ],
    conCosta = true,
    conEspuma = true,
    conPlaya = true,
    conNubes = false,
  } = opciones;

  const sy = solY === null ? horizonte - solR * 0.35 : solY;
  const s = sol(solX, sy, solR, { id: `${id}Sol` });

  const defs =
    linG(`${id}Cielo`, cielo) +
    linG(`${id}Mar`, mar) +
    linG(`${id}Arena`, arenaP) +
    s.defs +
    radG(
      `${id}Bruma`,
      [
        ['0%', '#FFE0B0', 0.3],
        ['100%', '#FFE0B0', 0],
      ],
      { cx: solX / w, cy: horizonte / h, r: 0.62 }
    );

  let cuerpo = `<rect width="${w}" height="${n(horizonte)}" fill="url(#${id}Cielo)"/>`;
  if (conNubes) cuerpo += nubes(w, horizonte * 0.18, horizonte * 0.72, semilla + 55, { cantidad: 8, opacidad: 0.34 });
  cuerpo += s.cuerpo;
  if (conNubes) {
    // Un par de bandas por delante del sol: es lo que da profundidad al cielo.
    cuerpo += nubes(w, horizonte * 0.58, horizonte * 0.92, semilla + 61, {
      cantidad: 3,
      color: C.ambar,
      opacidad: 0.42,
    });
  }

  // Costa lejana: al otro lado del Estrecho se ve África desde Tarifa.
  if (conCosta) {
    cuerpo +=
      `<path d="${cresta(w, horizonte - h * 0.028, [[h * 0.012, 1.1], [h * 0.006, 2.7]], semilla + 4, {
        hasta: horizonte,
      })}" fill="${C.azulProfundo}" opacity=".26"/>`;
  }

  cuerpo += `<rect y="${n(horizonte)}" width="${w}" height="${n((conPlaya ? orilla : h) - horizonte)}" fill="url(#${id}Mar)"/>`;
  cuerpo += reflejoSolar(solX, horizonte, conPlaya ? orilla : h, w * 0.2, semilla + 9);
  cuerpo += oleaje(w, horizonte + (conPlaya ? orilla : h - horizonte) * 0.08, conPlaya ? orilla : h, semilla + 17, {
    densidad: 34,
  });

  if (conPlaya) {
    cuerpo += `<rect y="${n(orilla)}" width="${w}" height="${n(h - orilla)}" fill="url(#${id}Arena)"/>`;
    // Arena mojada: devuelve el cielo como un espejo mate.
    cuerpo +=
      `<path d="${cresta(w, orilla + h * 0.055, [[h * 0.016, 0.8], [h * 0.008, 2.2]], semilla + 21, { hasta: orilla })}" fill="${
        C.ambar
      }" opacity=".2"/>`;
    cuerpo += `<ellipse cx="${n(solX)}" cy="${n(orilla + h * 0.02)}" rx="${n(w * 0.11)}" ry="${n(h * 0.05)}" fill="${
      C.sol
    }" opacity=".26"/>`;

    if (conEspuma) {
      cuerpo +=
        `<path d="${cresta(w, orilla, [[h * 0.011, 1.3], [h * 0.005, 3.1]], semilla + 27, { hasta: orilla + h * 0.045 })}" fill="${
          C.hueso
        }" opacity=".62"/>` +
        `<path d="${cresta(w, orilla - h * 0.006, [[h * 0.012, 1.3], [h * 0.006, 3.1]], semilla + 27)}" stroke="${
          C.hueso
        }" stroke-width="${n(h * 0.004)}" fill="none" opacity=".8"/>`;
    }
  }

  cuerpo += `<rect width="${w}" height="${h}" fill="url(#${id}Bruma)"/>`;
  return { defs, cuerpo, horizonte, orilla, solX, solY: sy, solR };
}

/* ------------------------------------------------------------------ *
 * 1. Hero — la playa al atardecer
 * ------------------------------------------------------------------ */
function heroAtardecer() {
  const w = 2000;
  const h = 1125;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.5,
    orilla: h * 0.665,
    solX: w * 0.655,
    solR: 62,
    semilla: 31,
    conNubes: true,
    // El cielo se mantiene ámbar junto al horizonte para que el disco solar
    // recorte con fuerza en lugar de diluirse en blanco.
    cielo: [
      ['0%', '#0F3149'],
      ['20%', '#2A5F80'],
      ['42%', '#6C93A8'],
      ['60%', '#C08D75'],
      ['76%', '#E79C63'],
      ['90%', '#F4B871'],
      ['100%', '#F8CE92'],
    ],
    mar: [
      ['0%', '#E9B87F'],
      ['12%', '#A99C8E'],
      ['36%', '#4E7A93'],
      ['100%', '#264F6B'],
    ],
  });

  let g = f.cuerpo;

  // Cometas de kitesurf sobre el Estrecho.
  g += cometa(w * 0.17, h * 0.19, 92, C.terracota, -16);
  g += cometa(w * 0.29, h * 0.3, 58, C.rosa, 10);
  g += cometa(w * 0.42, h * 0.14, 44, C.ambar, -6);
  g += aves(
    [
      [w * 0.79, h * 0.15, 1],
      [w * 0.84, h * 0.19, 0.75],
      [w * 0.88, h * 0.135, 0.6],
    ],
    18
  );

  // Duna a contraluz: dos capas para separar el primer término del fondo.
  g +=
    `<path d="${cresta(w, h * 0.86, [[h * 0.055, 0.55], [h * 0.024, 1.6]], 77, { hasta: h })}" fill="${C.sombra}" opacity=".82"/>` +
    `<path d="${cresta(w, h * 0.955, [[h * 0.035, 0.85], [h * 0.014, 2.1]], 91, { hasta: h })}" fill="#33251D"/>`;

  // Barrón sobre la cresta de la duna, recortado contra la luz.
  // El barrón se concentra en los bordes: el centro queda limpio para el
  // titular y el botón de reserva que se superponen al hero.
  const rh = azar(73);
  for (let i = 0; i < 9; i++) {
    const lado = i % 2 === 0 ? rh() * 0.2 : 0.8 + rh() * 0.2;
    g += hierba(w * lado, h * (0.92 + rh() * 0.06), 80 + rh() * 90, 5 + i * 7, { color: '#241A15', briznas: 7 });
  }
  g += palmera(w * 0.955, h * 0.9, 460, 61, { color: '#241A15', inclina: -0.07, hojas: 8 });
  g += palmera(w * 0.04, h * 0.98, 300, 67, { color: '#241A15', inclina: 0.09, hojas: 7 });

  return svg(w, h, f.defs + defsAcabado(w, h), g + acabado(w, h), {
    titulo: 'Puesta de sol sobre la playa de Tarifa vista desde Hotel Almara',
  });
}

/* ------------------------------------------------------------------ *
 * Vocabulario de interiores
 * ------------------------------------------------------------------ */

/** Trazado de arco de medio punto: el gesto arquitectónico de toda la casa. */
function arco(x, y, w, h) {
  const r = w / 2;
  return `M${n(x)} ${n(y + h)}L${n(x)} ${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}L${n(x + w)} ${n(y + h)}Z`;
}

/** Vano abierto al mar, con su propio cielo de atardecer. */
function vanoMar(x, y, w, h, id, semilla = 5, { conBarco = true } = {}) {
  const hor = y + h * 0.56;
  const defs =
    `<clipPath id="${id}Clip"><path d="${arco(x, y, w, h)}"/></clipPath>` +
    linG(`${id}Cielo`, [
      ['0%', '#5E96AE'],
      ['42%', '#A9B9B4'],
      ['74%', '#EEB182'],
      ['100%', '#FBDFB4'],
    ]) +
    linG(`${id}Mar`, [
      ['0%', '#D9BE99'],
      ['26%', '#6E90A0'],
      ['100%', '#33637C'],
    ]);
  let cuerpo = `<g clip-path="url(#${id}Clip)">`;
  cuerpo += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hor - y)}" fill="url(#${id}Cielo)"/>`;
  cuerpo += nubes(w, y + h * 0.1, y + h * 0.44, semilla + 40, { cantidad: 3, opacidad: 0.4 });
  cuerpo += `<circle cx="${n(x + w * 0.68)}" cy="${n(hor - h * 0.07)}" r="${n(w * 0.075)}" fill="${C.solNucleo}" opacity=".95"/>`;
  cuerpo += `<rect x="${n(x)}" y="${n(hor)}" width="${n(w)}" height="${n(y + h - hor)}" fill="url(#${id}Mar)"/>`;
  cuerpo += reflejoSolar(x + w * 0.68, hor, y + h, w * 0.3, semilla, C.solNucleo);
  cuerpo += oleaje(w, hor + h * 0.06, y + h, semilla + 3, { densidad: 14 });
  if (conBarco) {
    const bx = x + w * 0.26;
    const by = hor + h * 0.06;
    cuerpo +=
      `<path d="M${n(bx - w * 0.045)} ${n(by)}h${n(w * 0.09)}l${n(-w * 0.016)} ${n(h * 0.022)}h${n(-w * 0.058)}Z" fill="${C.tinta}" opacity=".62"/>` +
      `<path d="M${n(bx)} ${n(by)}v${n(-h * 0.085)}l${n(w * 0.04)} ${n(h * 0.085)}Z" fill="${C.tinta}" opacity=".55"/>`;
  }
  cuerpo += `</g>`;
  return { defs, cuerpo };
}

/** Vano abierto al jardín mediterráneo. */
function vanoJardin(x, y, w, h, id, semilla = 8) {
  const r = azar(semilla);
  const defs =
    `<clipPath id="${id}Clip"><path d="${arco(x, y, w, h)}"/></clipPath>` +
    linG(`${id}Cielo`, [
      ['0%', '#8FB9C6'],
      ['58%', '#D9CFB4'],
      ['100%', '#F3DFBC'],
    ]);
  let cuerpo = `<g clip-path="url(#${id}Clip)">`;
  cuerpo += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${id}Cielo)"/>`;
  // Muro encalado del patio y vegetación por capas.
  cuerpo += `<rect x="${n(x)}" y="${n(y + h * 0.6)}" width="${n(w)}" height="${n(h * 0.4)}" fill="${C.arenaClara}"/>`;
  cuerpo += `<rect x="${n(x)}" y="${n(y + h * 0.6)}" width="${n(w)}" height="${n(h * 0.02)}" fill="${C.arenaMedia}" opacity=".6"/>`;
  cuerpo += palmera(x + w * 0.24, y + h * 0.62, h * 0.42, semilla + 1, { color: C.olivaOscura, inclina: 0.04 });
  cuerpo += palmera(x + w * 0.8, y + h * 0.66, h * 0.3, semilla + 2, { color: C.oliva, inclina: -0.06, hojas: 6 });
  for (let i = 0; i < 5; i++) {
    cuerpo += `<circle cx="${n(x + w * (0.42 + r() * 0.34))}" cy="${n(y + h * (0.4 + r() * 0.2))}" r="${n(
      w * (0.05 + r() * 0.06)
    )}" fill="${C.olivaOscura}" opacity="${n(0.5 + r() * 0.3)}"/>`;
  }
  // Buganvilla: la nota rosa terracota del patio.
  for (let i = 0; i < 26; i++) {
    cuerpo += `<circle cx="${n(x + w * (0.05 + r() * 0.34))}" cy="${n(y + h * (0.12 + r() * 0.42))}" r="${n(
      w * (0.012 + r() * 0.022)
    )}" fill="${i % 3 === 0 ? C.terracotaClara : C.rosa}" opacity="${n(0.6 + r() * 0.35)}"/>`;
  }
  cuerpo += hierba(x + w * 0.6, y + h * 0.63, h * 0.16, semilla + 5, { color: C.olivaOscura });
  cuerpo += `</g>`;
  return { defs, cuerpo };
}

/** Cama vestida en lino, con cabecero de ratán o tapizado. */
function cama(x, sueloY, ancho, id, { cabecero = 'ratan', cojines = [C.terracota, C.arena], alto = 1 } = {}) {
  const hCab = ancho * 0.62 * alto;
  const yCab = sueloY - ancho * 0.34 - hCab;
  const yColchon = sueloY - ancho * 0.3;
  let s = '';

  // Cabecero
  if (cabecero === 'ratan') {
    const interior = arco(x + ancho * 0.09, yCab + ancho * 0.03, ancho * 0.82, hCab - ancho * 0.03);
    s += `<clipPath id="${id}Cab"><path d="${interior}"/></clipPath>`;
    s += `<path d="${arco(x + ancho * 0.06, yCab, ancho * 0.88, hCab)}" fill="${C.arenaMedia}"/>`;
    s += `<path d="${interior}" fill="${C.arena}"/>`;
    const cols = 16;
    s += `<g clip-path="url(#${id}Cab)">`;
    for (let i = 1; i < cols; i++) {
      const cx = x + ancho * 0.09 + (ancho * 0.82 * i) / cols;
      s += `<line x1="${n(cx)}" y1="${n(yCab)}" x2="${n(cx)}" y2="${n(yCab + hCab)}" stroke="${
        C.arenaOscura
      }" stroke-width="2" opacity=".5"/>`;
    }
    s += `</g>`;
  } else {
    s += `<rect x="${n(x + ancho * 0.06)}" y="${n(yCab + hCab * 0.25)}" width="${n(ancho * 0.88)}" height="${n(
      hCab * 0.75
    )}" rx="${n(ancho * 0.05)}" fill="${C.arenaMedia}"/>`;
    for (let i = 1; i < 4; i++) {
      const cx = x + ancho * 0.06 + (ancho * 0.88 * i) / 4;
      s += `<line x1="${n(cx)}" y1="${n(yCab + hCab * 0.3)}" x2="${n(cx)}" y2="${n(yCab + hCab)}" stroke="${
        C.arenaOscura
      }" stroke-width="3" opacity=".45"/>`;
    }
  }

  // Base, colchón y ropa de cama
  s += `<rect x="${n(x)}" y="${n(yColchon)}" width="${n(ancho)}" height="${n(ancho * 0.16)}" rx="${n(ancho * 0.02)}" fill="${
    C.hueso
  }"/>`;
  s += `<rect x="${n(x + ancho * 0.03)}" y="${n(yColchon + ancho * 0.15)}" width="${n(ancho * 0.94)}" height="${n(
    sueloY - yColchon - ancho * 0.15
  )}" fill="${C.arenaClara}"/>`;
  s += `<rect x="${n(x + ancho * 0.03)}" y="${n(sueloY - ancho * 0.04)}" width="${n(ancho * 0.94)}" height="${n(
    ancho * 0.04
  )}" fill="${C.arenaMedia}" opacity=".7"/>`;
  // Manta doblada a los pies, con su pliegue.
  s += `<rect x="${n(x + ancho * 0.02)}" y="${n(yColchon + ancho * 0.1)}" width="${n(ancho * 0.96)}" height="${n(
    ancho * 0.055
  )}" rx="${n(ancho * 0.008)}" fill="${cojines[0]}" opacity=".92"/>`;
  s += `<rect x="${n(x + ancho * 0.02)}" y="${n(yColchon + ancho * 0.1)}" width="${n(ancho * 0.96)}" height="${n(
    ancho * 0.016
  )}" fill="${C.hueso}" opacity=".28"/>`;

  // Almohadas y cojines
  const yAlm = yColchon - ancho * 0.055;
  s += `<rect x="${n(x + ancho * 0.08)}" y="${n(yAlm)}" width="${n(ancho * 0.36)}" height="${n(ancho * 0.11)}" rx="${n(
    ancho * 0.04
  )}" fill="${C.hueso}"/>`;
  s += `<rect x="${n(x + ancho * 0.5)}" y="${n(yAlm)}" width="${n(ancho * 0.36)}" height="${n(ancho * 0.11)}" rx="${n(
    ancho * 0.04
  )}" fill="${C.hueso}"/>`;
  s += `<rect x="${n(x + ancho * 0.28)}" y="${n(yAlm + ancho * 0.035)}" width="${n(ancho * 0.19)}" height="${n(
    ancho * 0.09
  )}" rx="${n(ancho * 0.025)}" fill="${cojines[0]}"/>`;
  s += `<rect x="${n(x + ancho * 0.5)}" y="${n(yAlm + ancho * 0.04)}" width="${n(ancho * 0.17)}" height="${n(
    ancho * 0.085
  )}" rx="${n(ancho * 0.025)}" fill="${cojines[1]}"/>`;
  return s;
}

/** Planta de interior: pampa boho, olivo en cerámica o palma pequeña. */
function planta(x, sueloY, tam, semilla, { tipo = 'pampa' } = {}) {
  const r = azar(semilla);
  const hMaceta = tam * 0.34;
  let s =
    `<path d="M${n(x - tam * 0.19)} ${n(sueloY - hMaceta)}h${n(tam * 0.38)}l${n(-tam * 0.05)} ${n(hMaceta)}h${n(
      -tam * 0.28
    )}Z" fill="${C.terracota}"/>` +
    `<rect x="${n(x - tam * 0.21)}" y="${n(sueloY - hMaceta - tam * 0.04)}" width="${n(tam * 0.42)}" height="${n(
      tam * 0.05
    )}" rx="${n(tam * 0.012)}" fill="${C.terracotaOscura}"/>`;

  const base = sueloY - hMaceta;
  if (tipo === 'pampa') {
    for (let i = 0; i < 7; i++) {
      const h = tam * (0.6 + r() * 0.55);
      const dx = (r() - 0.5) * tam * 0.75;
      s += `<path d="M${n(x)} ${n(base)}Q${n(x + dx * 0.4)} ${n(base - h * 0.6)},${n(x + dx)} ${n(
        base - h
      )}" stroke="${C.arenaOscura}" stroke-width="${n(tam * 0.014)}" fill="none" stroke-linecap="round"/>`;
      s += `<ellipse cx="${n(x + dx)}" cy="${n(base - h - tam * 0.05)}" rx="${n(tam * 0.055)}" ry="${n(
        tam * 0.12
      )}" transform="rotate(${n(dx * 0.06)} ${n(x + dx)} ${n(base - h - tam * 0.05)})" fill="${C.arenaClara}" opacity=".92"/>`;
    }
  } else if (tipo === 'olivo') {
    for (let i = 0; i < 5; i++) {
      const h = tam * (0.5 + r() * 0.4);
      const dx = (r() - 0.5) * tam * 0.8;
      s += `<path d="M${n(x)} ${n(base)}Q${n(x + dx * 0.3)} ${n(base - h * 0.6)},${n(x + dx)} ${n(base - h)}" stroke="${
        C.olivaOscura
      }" stroke-width="${n(tam * 0.012)}" fill="none" stroke-linecap="round"/>`;
      for (let j = 1; j <= 5; j++) {
        const t = j / 5.5;
        const lx = x + dx * t * t;
        const ly = base - h * t;
        s += `<ellipse cx="${n(lx + (j % 2 ? 1 : -1) * tam * 0.035)}" cy="${n(ly)}" rx="${n(tam * 0.045)}" ry="${n(
          tam * 0.018
        )}" transform="rotate(${n((j % 2 ? 28 : -28) + dx * 0.1)} ${n(lx)} ${n(ly)})" fill="${C.oliva}"/>`;
      }
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / 5);
      const largo = tam * (0.55 + r() * 0.25);
      const ex = x - Math.cos(a) * largo;
      const ey = base - Math.sin(a) * largo;
      s += `<path d="M${n(x)} ${n(base)}Q${n((x + ex) / 2 + tam * 0.06)} ${n((base + ey) / 2 - tam * 0.12)},${n(ex)} ${n(
        ey
      )}Q${n((x + ex) / 2 - tam * 0.02)} ${n((base + ey) / 2 - tam * 0.02)},${n(x)} ${n(base)}Z" fill="${
        i % 2 ? C.oliva : C.olivaOscura
      }"/>`;
    }
  }
  return s;
}

/** Lámpara colgante de fibra natural. */
function lampara(x, techoY, largoCable, tam, semilla = 2) {
  const y = techoY + largoCable;
  let s = `<line x1="${n(x)}" y1="${n(techoY)}" x2="${n(x)}" y2="${n(y)}" stroke="${C.sombra}" stroke-width="3" opacity=".7"/>`;
  s += `<path d="M${n(x - tam * 0.62)} ${n(y + tam * 0.72)}Q${n(x)} ${n(y - tam * 0.28)},${n(x + tam * 0.62)} ${n(
    y + tam * 0.72
  )}Z" fill="${C.arenaMedia}"/>`;
  for (let i = 1; i < 5; i++) {
    const yy = y + (tam * 0.72 * i) / 5;
    const ancho = tam * 0.62 * (i / 5) * 1.05;
    s += `<line x1="${n(x - ancho)}" y1="${n(yy)}" x2="${n(x + ancho)}" y2="${n(yy)}" stroke="${C.arenaOscura}" stroke-width="2" opacity=".55"/>`;
  }
  s += `<ellipse cx="${n(x)}" cy="${n(y + tam * 0.72)}" rx="${n(tam * 0.62)}" ry="${n(tam * 0.1)}" fill="${C.sol}" opacity=".85"/>`;
  return s;
}

/** Alfombra bereber de lana teñida, con sus flecos. */
function alfombra(x, y, w, h, semilla = 4, { color = C.terracota } = {}) {
  const r = azar(semilla);
  let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.04)}" fill="${C.arenaMedia}"/>`;
  s += `<rect x="${n(x + w * 0.02)}" y="${n(y + h * 0.07)}" width="${n(w * 0.96)}" height="${n(h * 0.86)}" rx="${n(
    h * 0.03
  )}" fill="${color}" opacity=".82"/>`;
  s += `<rect x="${n(x + w * 0.05)}" y="${n(y + h * 0.2)}" width="${n(w * 0.9)}" height="${n(h * 0.6)}" fill="${
    C.arenaClara
  }" opacity=".55"/>`;
  for (let i = 0; i < 9; i++) {
    const cx = x + w * (0.09 + (0.82 * i) / 8);
    s += `<path d="M${n(cx)} ${n(y + h * 0.3)}l${n(w * 0.026)} ${n(h * 0.2)}l${n(-w * 0.026)} ${n(h * 0.2)}l${n(
      -w * 0.026
    )} ${n(-h * 0.2)}Z" fill="${i % 2 ? C.sombra : color}" opacity="${n(0.45 + r() * 0.3)}"/>`;
  }
  // Flecos en los dos extremos.
  for (let i = 0; i < 26; i++) {
    const fx = x + (w * i) / 25;
    s += `<line x1="${n(fx)}" y1="${n(y)}" x2="${n(fx)}" y2="${n(y - h * 0.06)}" stroke="${C.arenaClara}" stroke-width="2" opacity=".7"/>`;
    s += `<line x1="${n(fx)}" y1="${n(y + h)}" x2="${n(fx)}" y2="${n(y + h * 1.06)}" stroke="${C.arenaClara}" stroke-width="2" opacity=".7"/>`;
  }
  return s;
}

/** Luz del atardecer entrando por el vano y derramándose en el suelo. */
function haz(xVano, anchoVano, sueloY, alcance, id) {
  return {
    defs: linG(
      id,
      [
        ['0%', C.sol, 0.5],
        ['100%', C.sol, 0],
      ],
      { x1: 0, y1: 0, x2: 0, y2: 1 }
    ),
    cuerpo: `<path d="M${n(xVano)} ${n(sueloY)}L${n(xVano + anchoVano)} ${n(sueloY)}L${n(
      xVano + anchoVano * 0.4
    )} ${n(sueloY + alcance)}L${n(xVano - anchoVano * 0.75)} ${n(sueloY + alcance)}Z" fill="url(#${id})"/>`,
  };
}

/** Pared, suelo y rodapié comunes a las tres habitaciones. */
function estancia(w, h, sueloY, id, { pared = C.arenaClara, suelo = C.arena } = {}) {
  const defs =
    linG(`${id}Pared`, [
      ['0%', '#FDF7EE'],
      ['62%', pared],
      ['100%', '#E3CFB2'],
    ]) +
    linG(`${id}Suelo`, [
      ['0%', suelo],
      ['100%', '#C4A47C'],
    ]);
  const cuerpo =
    `<rect width="${w}" height="${n(sueloY)}" fill="url(#${id}Pared)"/>` +
    `<rect y="${n(sueloY)}" width="${w}" height="${n(h - sueloY)}" fill="url(#${id}Suelo)"/>` +
    `<rect y="${n(sueloY - h * 0.012)}" width="${w}" height="${n(h * 0.012)}" fill="${C.hueso}" opacity=".8"/>`;
  return { defs, cuerpo };
}

/* ------------------------------------------------------------------ *
 * 2. Habitación Vista Mar
 * ------------------------------------------------------------------ */
function habitacionVistaMar() {
  const w = 1600;
  const h = 1200;
  const sueloY = 800;
  const est = estancia(w, h, sueloY, 'vm');
  const van = vanoMar(860, 150, 580, 610, 'vmVano', 13);
  const hz = haz(860, 580, 760, 430, 'vmHaz');

  let g = est.cuerpo;
  g += van.cuerpo;
  // Marco y alféizar del vano
  g +=
    `<path d="${arco(860, 150, 580, 610)}" fill="none" stroke="${C.hueso}" stroke-width="26"/>` +
    `<path d="${arco(838, 128, 624, 654)}" fill="none" stroke="${C.arenaMedia}" stroke-width="6" opacity=".55"/>` +
    `<rect x="822" y="754" width="656" height="26" rx="10" fill="${C.hueso}"/>`;
  g += hz.cuerpo;

  // Cortina de lino recogida a un lado
  g +=
    `<path d="M1452 130Q1500 460,1462 782L1560 782Q1520 450,1546 130Z" fill="${C.hueso}" opacity=".92"/>` +
    `<path d="M1470 200Q1498 460,1478 720" stroke="${C.arenaMedia}" stroke-width="4" fill="none" opacity=".5"/>`;

  g += alfombra(60, 946, 900, 200, 4);
  g += cama(110, 1000, 620, 'vmCama', { cojines: [C.terracota, C.arena] });

  // Mesita con cerámica local
  g +=
    `<rect x="772" y="880" width="150" height="18" rx="6" fill="${C.arenaMedia}"/>` +
    `<rect x="784" y="898" width="14" height="106" fill="${C.arenaOscura}"/>` +
    `<rect x="896" y="898" width="14" height="106" fill="${C.arenaOscura}"/>` +
    `<path d="M826 880q-26-16-26-40t26-30q26 6 26 30t-26 40Z" fill="${C.terracota}"/>` +
    `<rect x="820" y="792" width="12" height="26" fill="${C.olivaOscura}"/>`;

  g += lampara(700, 0, 180, 150, 3);
  g += planta(1500, 1030, 300, 21, { tipo: 'pampa' });

  return svg(
    w,
    h,
    est.defs + van.defs + hz.defs + defsAcabado(w, h),
    g + acabado(w, h, { opacidadGrano: 0.36 }),
    { titulo: 'Habitación Vista Mar con gran ventanal arqueado sobre el Atlántico' }
  );
}

/* ------------------------------------------------------------------ *
 * 3. Suite Almara
 * ------------------------------------------------------------------ */
function suiteAlmara() {
  const w = 1600;
  const h = 1200;
  const sueloY = 780;
  const est = estancia(w, h, sueloY, 'sa', { pared: '#F0E1CB' });
  const van = vanoMar(700, 120, 760, 640, 'saVano', 29, { conBarco: true });
  const hz = haz(700, 760, 760, 420, 'saHaz');

  let g = est.cuerpo;
  g += van.cuerpo;
  g +=
    `<path d="${arco(700, 120, 760, 640)}" fill="none" stroke="${C.hueso}" stroke-width="30"/>` +
    `<path d="${arco(676, 96, 808, 688)}" fill="none" stroke="${C.arenaMedia}" stroke-width="7" opacity=".5"/>`;
  g += hz.cuerpo;

  // Cortinas de lino que el levante mueve hacia dentro.
  g +=
    `<path d="M700 110Q640 420,712 760L610 760Q596 420,626 110Z" fill="${C.hueso}" opacity=".95"/>` +
    `<path d="M1460 110Q1536 400,1470 760L1568 760Q1580 400,1552 110Z" fill="${C.hueso}" opacity=".95"/>` +
    `<path d="M660 200Q636 440,668 700" stroke="${C.arenaMedia}" stroke-width="4" fill="none" opacity=".45"/>` +
    `<path d="M1516 200Q1540 440,1508 700" stroke="${C.arenaMedia}" stroke-width="4" fill="none" opacity=".45"/>`;

  g += alfombra(40, 936, 800, 210, 9, { color: C.terracotaOscura });
  g += cama(90, 990, 560, 'saCama', { cabecero: 'tapizado', cojines: [C.terracotaOscura, C.rosa] });

  // Butaca de mimbre y mesa baja: el rincón de lectura de la suite.
  g +=
    `<path d="M1120 1040q-16-190 96-190t96 190Z" fill="${C.arenaMedia}"/>` +
    `<path d="M1148 1030q-12-150 68-150t68 150Z" fill="${C.arena}"/>` +
    `<rect x="1172" y="960" width="88" height="52" rx="18" fill="${C.terracota}"/>` +
    `<rect x="1140" y="1040" width="16" height="60" fill="${C.arenaOscura}"/>` +
    `<rect x="1276" y="1040" width="16" height="60" fill="${C.arenaOscura}"/>`;
  g +=
    `<ellipse cx="1000" cy="1046" rx="104" ry="26" fill="${C.arenaOscura}"/>` +
    `<ellipse cx="1000" cy="1036" rx="104" ry="26" fill="${C.arenaMedia}"/>` +
    `<rect x="992" y="1058" width="16" height="72" fill="${C.sombra}" opacity=".8"/>` +
    `<path d="M978 1036q-20-14-20-32t20-24q20 6 20 24t-20 32Z" fill="${C.terracotaOscura}"/>`;

  g += lampara(430, 0, 150, 190, 7);
  g += planta(1520, 1080, 340, 33, { tipo: 'palma' });

  return svg(
    w,
    h,
    est.defs + van.defs + hz.defs + defsAcabado(w, h),
    g + acabado(w, h, { opacidadGrano: 0.36 }),
    { titulo: 'Suite Almara con salida a la terraza y vistas al Estrecho' }
  );
}

/* ------------------------------------------------------------------ *
 * 4. Habitación Jardín
 * ------------------------------------------------------------------ */
function habitacionJardin() {
  const w = 1600;
  const h = 1200;
  const sueloY = 810;
  const est = estancia(w, h, sueloY, 'hj', { pared: '#F6EEE1', suelo: '#D9C3A2' });
  const van = vanoJardin(900, 190, 520, 570, 'hjVano', 41);
  const hz = haz(900, 520, 760, 380, 'hjHaz');

  let g = est.cuerpo;
  g += van.cuerpo;
  g +=
    `<path d="${arco(900, 190, 520, 570)}" fill="none" stroke="${C.hueso}" stroke-width="24"/>` +
    `<rect x="866" y="754" width="588" height="24" rx="10" fill="${C.hueso}"/>`;
  g += hz.cuerpo;

  // Hornacina encalada con cerámica de la zona.
  g +=
    `<path d="${arco(300, 250, 240, 330)}" fill="${C.arenaMedia}" opacity=".5"/>` +
    `<path d="${arco(314, 264, 212, 302)}" fill="${C.arena}" opacity=".55"/>` +
    `<path d="M370 566q-24-18-24-44t24-28q24 4 24 28t-24 44Z" fill="${C.terracota}"/>` +
    `<path d="M452 566q-18-14-18-34t18-22q18 4 18 22t-18 34Z" fill="${C.azul}" opacity=".8"/>`;

  g += alfombra(330, 960, 740, 200, 14, { color: C.oliva });
  g += cama(400, 1010, 500, 'hjCama', { cabecero: 'ratan', cojines: [C.oliva, C.arenaClara], alto: 0.86 });

  g += planta(1500, 1040, 290, 55, { tipo: 'olivo' });
  g += planta(210, 1010, 200, 63, { tipo: 'olivo' });
  g += lampara(660, 0, 200, 130, 11);

  return svg(
    w,
    h,
    est.defs + van.defs + hz.defs + defsAcabado(w, h),
    g + acabado(w, h, { opacidadGrano: 0.36 }),
    { titulo: 'Habitación Jardín abierta al patio de buganvillas' }
  );
}

/* ------------------------------------------------------------------ *
 * 5. Piscina infinita
 * ------------------------------------------------------------------ */
function piscinaInfinita() {
  const w = 1600;
  const h = 1000;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.34,
    solX: w * 0.72,
    solR: 40,
    semilla: 47,
    conPlaya: false,
    conNubes: true,
    id: 'pi',
  });

  let g = f.cuerpo;
  // El mar sólo se ve hasta el borde infinito de la lámina de agua.
  const bordeY = h * 0.5;
  g += `<rect y="${n(bordeY)}" width="${w}" height="${n(h - bordeY)}" fill="${C.arenaClara}"/>`;

  // Palmeras y tumbonas al fondo, antes de la piscina.
  g += palmera(w * 0.07, bordeY + 8, 330, 51, { color: C.olivaOscura, inclina: 0.05 });
  g += palmera(w * 0.95, bordeY + 8, 270, 57, { color: C.olivaOscura, inclina: -0.05 });

  // Lámina de agua
  const defsAgua =
    linG('piAgua', [
      ['0%', '#8FD3CC'],
      ['26%', '#4FA9AE'],
      ['72%', '#2E7E95'],
      ['100%', '#1F5F79'],
    ]) +
    linG('piBorde', [
      ['0%', C.solNucleo, 0.95],
      ['100%', C.sol, 0.1],
    ]);
  const altoAgua = h * 0.26;
  g += `<rect x="${n(w * 0.1)}" y="${n(bordeY)}" width="${n(w * 0.8)}" height="${n(altoAgua)}" rx="${n(h * 0.014)}" fill="url(#piAgua)"/>`;
  g += `<rect x="${n(w * 0.1)}" y="${n(bordeY)}" width="${n(w * 0.8)}" height="${n(h * 0.016)}" fill="url(#piBorde)"/>`;
  // Coronación de piedra caliza que rodea el vaso.
  g += `<rect x="${n(w * 0.07)}" y="${n(bordeY + altoAgua)}" width="${n(w * 0.86)}" height="${n(h * 0.03)}" rx="6" fill="${
    C.arenaClara
  }"/>`;
  g += `<rect x="${n(w * 0.07)}" y="${n(bordeY + altoAgua)}" width="${n(w * 0.86)}" height="${n(h * 0.008)}" fill="${
    C.hueso
  }"/>`;
  // Escalera de acceso, apenas insinuada bajo el agua.
  for (let i = 0; i < 3; i++) {
    g += `<rect x="${n(w * 0.45)}" y="${n(bordeY + altoAgua - h * (0.028 + i * 0.022))}" width="${n(w * 0.1)}" height="${n(
      h * 0.01
    )}" rx="4" fill="${C.hueso}" opacity="${n(0.18 - i * 0.045)}"/>`;
  }

  // Reflejo del sol y ondas sobre el agua.
  g += reflejoSolar(w * 0.72, bordeY + h * 0.02, bordeY + altoAgua, w * 0.15, 63, C.solNucleo);
  const ro = azar(71);
  for (let i = 0; i < 30; i++) {
    const y = bordeY + h * (0.03 + ro() * 0.21);
    const x = w * (0.12 + ro() * 0.74);
    const largo = w * (0.03 + ro() * 0.1);
    g += `<path d="M${n(x)} ${n(y)}q${n(largo * 0.25)} ${n(-4)},${n(largo * 0.5)} 0t${n(largo * 0.5)} 0" stroke="${
      C.hueso
    }" stroke-width="${n(2 + ro() * 3)}" fill="none" opacity="${n(0.12 + ro() * 0.24)}" stroke-linecap="round"/>`;
  }
  // Reflejos verticales de las palmeras en el agua.
  g += `<rect x="${n(w * 0.12)}" y="${n(bordeY + h * 0.02)}" width="12" height="${n(h * 0.14)}" fill="${
    C.olivaOscura
  }" opacity=".16"/>`;

  // Solárium de terracota y tumbonas.
  g += `<rect y="${n(h * 0.79)}" width="${w}" height="${n(h * 0.21)}" fill="${C.arenaMedia}"/>`;
  for (let i = 1; i < 5; i++) {
    const y = h * 0.79 + ((h - h * 0.79) * i) / 5;
    g += `<line x1="0" y1="${n(y)}" x2="${w}" y2="${n(y)}" stroke="${C.arenaOscura}" stroke-width="2" opacity=".35"/>`;
  }
  const tumbona = (x, y, esc, col) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc})">` +
    `<path d="M0 0h190l-16 34H16Z" fill="${C.hueso}"/>` +
    `<path d="M150 0l58-56 26 16-52 40Z" fill="${C.hueso}"/>` +
    `<rect x="20" y="34" width="12" height="30" fill="${C.arenaOscura}"/>` +
    `<rect x="150" y="34" width="12" height="30" fill="${C.arenaOscura}"/>` +
    `<rect x="60" y="-14" width="70" height="16" rx="8" fill="${col}"/>` +
    `</g>`;
  const parasol = (x, y, esc) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc})">` +
    `<rect x="-4" y="-150" width="8" height="150" fill="${C.arenaOscura}"/>` +
    `<path d="M-120-150q120-96 240 0Z" fill="${C.terracota}"/>` +
    `<path d="M-120-150q120-96 240 0" stroke="${C.terracotaOscura}" stroke-width="6" fill="none"/>` +
    `<path d="M-60-172q60 24 120 0" stroke="${C.hueso}" stroke-width="7" fill="none" opacity=".55"/>` +
    `</g>`;
  g += parasol(w * 0.2, h * 0.965, 0.74);
  g += tumbona(w * 0.02, h * 0.955, 0.76, C.terracota);
  g += tumbona(w * 0.24, h * 0.965, 0.76, C.arena);
  g += parasol(w * 0.79, h * 0.965, 0.7);
  g += tumbona(w * 0.58, h * 0.955, 0.76, C.terracotaClara);
  g += tumbona(w * 0.81, h * 0.965, 0.76, C.arena);
  g += planta(w * 0.97, h * 0.99, 200, 83, { tipo: 'pampa' });

  return svg(w, h, f.defs + defsAgua + defsAcabado(w, h), g + acabado(w, h, { opacidadGrano: 0.4 }), {
    titulo: 'Piscina infinita de Hotel Almara sobre el mar al atardecer',
  });
}

/* ------------------------------------------------------------------ *
 * 6. Restaurante — terraza a la hora azul
 * ------------------------------------------------------------------ */
function restaurante() {
  const w = 1600;
  const h = 1000;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.42,
    solX: w * 0.3,
    solR: 30,
    semilla: 89,
    conPlaya: false,
    conNubes: true,
    id: 're',
    cielo: [
      ['0%', '#173A55'],
      ['30%', '#3D6E86'],
      ['58%', '#8E8C93'],
      ['80%', '#D99A70'],
      ['100%', '#F3C489'],
    ],
    mar: [
      ['0%', '#C79A79'],
      ['22%', '#6C7C8A'],
      ['100%', '#22485E'],
    ],
  });

  let g = f.cuerpo;

  // Suelo de la terraza en barro cocido.
  const sueloY = h * 0.68;
  g += `<rect y="${n(sueloY)}" width="${w}" height="${n(h - sueloY)}" fill="url(#reSuelo)"/>`;
  for (let i = 1; i < 7; i++) {
    const y = sueloY + ((h - sueloY) * i) / 7;
    g += `<line x1="0" y1="${n(y)}" x2="${w}" y2="${n(y)}" stroke="${C.terracotaOscura}" stroke-width="2" opacity=".2"/>`;
  }

  // Barandilla de obra: separa la terraza del mar y asienta la escena.
  g += `<rect y="${n(sueloY - h * 0.055)}" width="${w}" height="${n(h * 0.055)}" fill="${C.arenaClara}"/>`;
  g += `<rect y="${n(sueloY - h * 0.055)}" width="${w}" height="${n(h * 0.012)}" fill="${C.hueso}"/>`;

  // Muros y arcos encalados que enmarcan la terraza.
  const muro = 190;
  for (const x0 of [0, w - muro]) {
    const ax = x0 + 34;
    g += `<rect x="${n(x0)}" y="0" width="${muro}" height="${n(sueloY)}" fill="${C.hueso}"/>`;
    g += `<rect x="${n(x0)}" y="0" width="${muro}" height="${n(sueloY)}" fill="${C.ambar}" opacity=".14"/>`;
    g += `<path d="${arco(ax, 150, muro - 68, 520)}" fill="url(#reArco)"/>`;
    g += `<path d="${arco(ax, 150, muro - 68, 520)}" fill="none" stroke="${C.arenaMedia}" stroke-width="6" opacity=".7"/>`;
    // Farol encendido dentro de cada arco: insinúa el comedor interior.
    g += `<circle cx="${n(ax + (muro - 68) / 2)}" cy="330" r="40" fill="${C.sol}" opacity=".35"/>`;
    g += `<circle cx="${n(ax + (muro - 68) / 2)}" cy="330" r="13" fill="${C.solNucleo}" opacity=".95"/>`;
  }

  // Guirnalda de bombillas: el detalle que da la hora del día.
  const cuerda = cresta(w, 130, [[46, 1.6]], 97);
  g += `<path d="${cuerda}" stroke="${C.sombra}" stroke-width="3" fill="none" opacity=".65"/>`;
  const rb = azar(101);
  for (let i = 0; i <= 26; i++) {
    const x = (w * i) / 26;
    const y = 130 + 46 * Math.sin(1.6 * (x / w) * Math.PI * 2 + 3.1) + 16;
    g += `<circle cx="${n(x)}" cy="${n(y)}" r="18" fill="${C.sol}" opacity=".22"/>`;
    g += `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${C.solNucleo}" opacity="${n(0.85 + rb() * 0.15)}"/>`;
  }

  // Mesas vestidas de lino con su vela.
  const mesa = (x, y, esc) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc})">` +
    `<ellipse cx="0" cy="86" rx="132" ry="20" fill="${C.terracotaOscura}" opacity=".3"/>` +
    `<path d="M-130 0h260l-30 86h-200Z" fill="${C.hueso}"/>` +
    `<ellipse cx="0" cy="0" rx="130" ry="26" fill="${C.arenaClara}"/>` +
    `<ellipse cx="-46" cy="2" rx="34" ry="9" fill="${C.hueso}"/>` +
    `<ellipse cx="44" cy="6" rx="30" ry="8" fill="${C.hueso}"/>` +
    `<rect x="-8" y="-34" width="16" height="34" rx="4" fill="${C.arenaMedia}"/>` +
    `<circle cx="0" cy="-42" r="16" fill="${C.sol}" opacity=".45"/>` +
    `<circle cx="0" cy="-42" r="7" fill="${C.solNucleo}"/>` +
    `<path d="M92-16q-14-10-14-24t14-16q14 4 14 16t-14 24Z" fill="${C.terracota}"/>` +
    `</g>`;
  const silla = (x, y, esc, mirando = 1) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc * mirando} ${esc})">` +
    `<path d="M-44-96q44-26 88 0l-8 96h-72Z" fill="${C.arenaMedia}"/>` +
    `<path d="M-36-84q36-18 72 0l-6 78h-60Z" fill="${C.arena}"/>` +
    `<rect x="-38" y="0" width="10" height="40" fill="${C.arenaOscura}"/>` +
    `<rect x="28" y="0" width="10" height="40" fill="${C.arenaOscura}"/>` +
    `</g>`;

  g += silla(w * 0.245, h * 0.82, 0.7, -1);
  g += mesa(w * 0.33, h * 0.78, 0.72);
  g += silla(w * 0.415, h * 0.82, 0.7);
  g += silla(w * 0.615, h * 0.97, 1, -1);
  g += mesa(w * 0.73, h * 0.92, 1);
  g += silla(w * 0.845, h * 0.98, 1);
  g += planta(w * 0.07, h * 0.98, 260, 107, { tipo: 'olivo' });
  g += planta(w * 0.93, h * 0.8, 170, 109, { tipo: 'olivo' });

  return svg(
    w,
    h,
    f.defs +
      linG('reArco', [
        ['0%', '#6B3A28'],
        ['55%', '#9C5636'],
        ['100%', '#D8905A'],
      ]) +
      linG('reSuelo', [
        ['0%', '#C4744F'],
        ['55%', '#A85735'],
        ['100%', '#7E3B26'],
      ]) +
      defsAcabado(w, h),
    g + acabado(w, h, { opacidadGrano: 0.44 }),
    { titulo: 'Terraza del restaurante de Hotel Almara a la hora azul' }
  );
}

/* ------------------------------------------------------------------ *
 * 7. Guía — Las 5 mejores playas
 * ------------------------------------------------------------------ */
function guiaPlayas() {
  const w = 1200;
  const h = 800;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.3,
    orilla: h * 0.62,
    solX: w * 0.24,
    solR: 26,
    semilla: 113,
    id: 'gp',
    mar: [
      ['0%', '#D9C39C'],
      ['16%', '#79C0BD'],
      ['52%', '#3E9AA6'],
      ['100%', '#2A7189'],
    ],
  });

  let g = f.cuerpo;

  // Cala: el brazo rocoso que abraza la ensenada.
  g +=
    `<path d="M0 ${n(h * 0.3)}q${n(w * 0.16)} ${n(-h * 0.06)},${n(w * 0.26)} ${n(h * 0.08)}q${n(w * 0.1)} ${n(
      h * 0.1
    )},${n(w * 0.04)} ${n(h * 0.24)}L0 ${n(h * 0.66)}Z" fill="${C.olivaOscura}" opacity=".9"/>` +
    `<path d="M0 ${n(h * 0.34)}q${n(w * 0.12)} ${n(-h * 0.02)},${n(w * 0.2)} ${n(h * 0.1)}q${n(w * 0.06)} ${n(
      h * 0.1
    )},${n(w * 0.02)} ${n(h * 0.18)}L0 ${n(h * 0.62)}Z" fill="${C.oliva}" opacity=".55"/>`;
  g += palmera(w * 0.08, h * 0.34, 130, 121, { color: C.olivaOscura, inclina: 0.08, hojas: 6 });

  // Rocas sueltas dentro del agua.
  for (const [x, y, r] of [
    [w * 0.34, h * 0.44, 26],
    [w * 0.4, h * 0.47, 16],
    [w * 0.88, h * 0.4, 20],
  ]) {
    g += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * 0.62)}" fill="${C.sombra}" opacity=".7"/>`;
    g += `<ellipse cx="${n(x)}" cy="${n(y + r * 0.4)}" rx="${n(r * 1.5)}" ry="${n(r * 0.3)}" fill="${C.hueso}" opacity=".35"/>`;
  }

  // Sombrillas de rayas sobre la arena.
  const sombrilla = (x, y, esc, col) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc})">` +
    `<rect x="-3" y="-88" width="6" height="88" fill="${C.arenaOscura}"/>` +
    `<path d="M-70-88q70-56 140 0Z" fill="${col}"/>` +
    `<path d="M-34-104q34 14 68 0l-34 16Z" fill="${C.hueso}" opacity=".5"/>` +
    `<ellipse cx="0" cy="4" rx="72" ry="9" fill="${C.arenaOscura}" opacity=".35"/>` +
    `</g>`;
  g += sombrilla(w * 0.72, h * 0.78, 0.62, C.terracota);
  g += sombrilla(w * 0.86, h * 0.88, 0.78, C.rosa);
  g += `<ellipse cx="${n(w * 0.6)}" cy="${n(h * 0.85)}" rx="46" ry="13" fill="${C.hueso}" opacity=".75"/>`;
  g += hierba(w * 0.06, h * 0.96, 90, 127, { color: C.olivaOscura });
  g += hierba(w * 0.14, h * 0.99, 70, 131, { color: C.olivaOscura });
  g += aves([[w * 0.66, h * 0.14, 1], [w * 0.72, h * 0.17, 0.7]], 11);

  return svg(w, h, f.defs + defsAcabado(w, h), g + acabado(w, h, { opacidadGrano: 0.42 }), {
    titulo: 'Cala de aguas turquesa cerca de Tarifa',
  });
}

/* ------------------------------------------------------------------ *
 * 8. Guía — Gastronomía (mesa vista desde arriba)
 * ------------------------------------------------------------------ */
function guiaGastronomia() {
  const w = 1200;
  const h = 800;
  const r = azar(137);

  const defs =
    linG('ggMesa', [
      ['0%', '#C97B57'],
      ['100%', '#8F4630'],
    ]) +
    radG(
      'ggLuz',
      [
        ['0%', C.sol, 0.5],
        ['100%', C.sol, 0],
      ],
      { cx: 0.36, cy: 0.28, r: 0.62 }
    ) +
    defsAcabado(w, h);

  let g = `<rect width="${w}" height="${h}" fill="url(#ggMesa)"/>`;
  // Vetas de la madera de la mesa.
  for (let i = 0; i < 16; i++) {
    const y = (h * i) / 16 + r() * 20;
    g += `<path d="M0 ${n(y)}q${n(w * 0.3)} ${n((r() - 0.5) * 14)},${n(w * 0.6)} 0t${n(w * 0.6)} 0" stroke="${
      C.terracotaOscura
    }" stroke-width="${n(1 + r() * 2)}" fill="none" opacity=".18"/>`;
  }
  g += `<rect width="${w}" height="${h}" fill="url(#ggLuz)"/>`;

  // Mantel de lino en diagonal.
  g += `<path d="M${n(w * 0.52)} 0L${w} 0L${w} ${h}L${n(w * 0.2)} ${h}Z" fill="${C.hueso}" opacity=".92"/>`;
  g += `<path d="M${n(w * 0.52)} 0L${n(w * 0.2)} ${h}" stroke="${C.arenaMedia}" stroke-width="4" opacity=".5"/>`;

  const plato = (x, y, rad, relleno) =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${C.sombra}" opacity=".18"/>` +
    `<circle cx="${n(x)}" cy="${n(y - rad * 0.04)}" r="${n(rad)}" fill="${C.hueso}"/>` +
    `<circle cx="${n(x)}" cy="${n(y - rad * 0.04)}" r="${n(rad * 0.78)}" fill="${C.arenaClara}"/>` +
    relleno;

  // Plato grande: atún rojo de almadraba con verduras.
  let relleno = '';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    relleno += `<ellipse cx="${n(w * 0.36 + Math.cos(a) * 62)}" cy="${n(h * 0.44 + Math.sin(a) * 46)}" rx="34" ry="22" transform="rotate(${n(
      (a * 180) / Math.PI
    )} ${n(w * 0.36 + Math.cos(a) * 62)} ${n(h * 0.44 + Math.sin(a) * 46)})" fill="${C.terracota}"/>`;
  }
  relleno += `<circle cx="${n(w * 0.36)}" cy="${n(h * 0.44)}" r="42" fill="${C.oliva}"/>`;
  relleno += `<circle cx="${n(w * 0.36)}" cy="${n(h * 0.44)}" r="22" fill="${C.olivaOscura}"/>`;
  g += plato(w * 0.36, h * 0.46, 150, relleno);

  // Platitos de tapas.
  let tapa1 = '';
  for (let i = 0; i < 9; i++)
    tapa1 += `<circle cx="${n(w * 0.68 + (r() - 0.5) * 76)}" cy="${n(h * 0.24 + (r() - 0.5) * 60)}" r="${n(
      10 + r() * 8
    )}" fill="${i % 2 ? C.olivaOscura : C.oliva}"/>`;
  g += plato(w * 0.68, h * 0.24, 78, tapa1);

  let tapa2 = '';
  for (let i = 0; i < 6; i++)
    tapa2 += `<ellipse cx="${n(w * 0.83 + (r() - 0.5) * 60)}" cy="${n(h * 0.56 + (r() - 0.5) * 50)}" rx="${n(
      16 + r() * 8
    )}" ry="${n(9 + r() * 5)}" fill="${C.ambar}"/>`;
  g += plato(w * 0.83, h * 0.56, 82, tapa2);

  // Pan, aceite y copa de vino.
  g +=
    `<ellipse cx="${n(w * 0.56)}" cy="${n(h * 0.8)}" rx="86" ry="54" fill="${C.arenaMedia}"/>` +
    `<ellipse cx="${n(w * 0.56)}" cy="${n(h * 0.78)}" rx="80" ry="50" fill="${C.arena}"/>` +
    `<path d="M${n(w * 0.51)} ${n(h * 0.74)}q${n(w * 0.05)} ${n(-h * 0.03)},${n(w * 0.09)} 0" stroke="${
      C.arenaOscura
    }" stroke-width="5" fill="none"/>`;
  g +=
    `<path d="M${n(w * 0.14)} ${n(h * 0.74)}h72l-10 96h-52Z" fill="${C.oliva}" opacity=".9"/>` +
    `<rect x="${n(w * 0.155)}" y="${n(h * 0.68)}" width="26" height="42" rx="6" fill="${C.olivaOscura}"/>` +
    `<rect x="${n(w * 0.152)}" y="${n(h * 0.79)}" width="46" height="34" rx="4" fill="${C.arenaClara}" opacity=".85"/>`;
  g +=
    `<ellipse cx="${n(w * 0.9)}" cy="${n(h * 0.87)}" rx="46" ry="12" fill="${C.sombra}" opacity=".2"/>` +
    `<path d="M${n(w * 0.9 - 40)} ${n(h * 0.62)}h80q0 66-32 78v40h32v10h-80v-10h32v-40q-32-12-32-78Z" fill="${
      C.hueso
    }" opacity=".8"/>` +
    `<path d="M${n(w * 0.9 - 34)} ${n(h * 0.68)}h68q-4 40-34 46t-34-46Z" fill="${C.terracotaOscura}" opacity=".85"/>`;

  // Ramita de olivo como remate.
  g += `<g transform="translate(${n(w * 0.2)} ${n(h * 0.2)}) rotate(-18)">`;
  g += `<path d="M0 0q120-30 240-8" stroke="${C.olivaOscura}" stroke-width="5" fill="none"/>`;
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    g += `<ellipse cx="${n(t * 240)}" cy="${n(-t * 8 + (i % 2 ? -14 : 14))}" rx="22" ry="9" transform="rotate(${
      i % 2 ? -24 : 24
    } ${n(t * 240)} ${n(-t * 8 + (i % 2 ? -14 : 14))})" fill="${C.oliva}"/>`;
  }
  g += `</g>`;

  return svg(w, h, defs, g + acabado(w, h, { opacidadGrano: 0.5 }), {
    titulo: 'Mesa de tapas gaditanas vista desde arriba',
  });
}

/* ------------------------------------------------------------------ *
 * 9. Guía — Actividades (kitesurf en Los Lances)
 * ------------------------------------------------------------------ */
function guiaActividades() {
  const w = 1200;
  const h = 800;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.46,
    orilla: h * 0.72,
    solX: w * 0.82,
    solR: 30,
    semilla: 149,
    id: 'ga',
  });

  let g = f.cuerpo;

  // Cometas: el cielo de Tarifa cuando entra el levante.
  g += cometa(w * 0.15, h * 0.17, 88, C.terracota, -18);
  g += cometa(w * 0.37, h * 0.1, 62, C.turquesa, 12);
  g += cometa(w * 0.57, h * 0.21, 52, C.rosa, -8);
  g += cometa(w * 0.76, h * 0.12, 40, C.ambar, 16);

  // Riders y sus estelas.
  const rider = (x, y, esc, colCometa, cx, cy) =>
    `<line x1="${n(x - 10 * esc)}" y1="${n(y - 40 * esc)}" x2="${n(cx - 26)}" y2="${n(cy + 10)}" stroke="${
      C.tinta
    }" stroke-width="2.4" opacity=".5"/>` +
    `<line x1="${n(x + 10 * esc)}" y1="${n(y - 40 * esc)}" x2="${n(cx + 26)}" y2="${n(cy + 10)}" stroke="${
      C.tinta
    }" stroke-width="2.4" opacity=".5"/>` +
    `<g transform="translate(${n(x)} ${n(y)}) scale(${esc})">` +
    `<circle cx="0" cy="-52" r="11" fill="${C.tinta}"/>` +
    `<path d="M-8-42h16l6 30h-28Z" fill="${C.tinta}"/>` +
    `<path d="M-10-12l-14 14 6 6 20-14Z" fill="${C.tinta}"/>` +
    `<path d="M10-12l16 12-6 8-22-12Z" fill="${C.tinta}"/>` +
    `<path d="M-30 2h60l-6 8h-48Z" fill="${colCometa}"/>` +
    `<ellipse cx="0" cy="14" rx="42" ry="7" fill="${C.hueso}" opacity=".6"/>` +
    `</g>`;
  g += rider(w * 0.19, h * 0.58, 1.05, C.terracota, w * 0.15, h * 0.17);
  g += rider(w * 0.57, h * 0.62, 0.82, C.rosa, w * 0.57, h * 0.21);

  // Duna y barrón en primer término.
  g += `<path d="${cresta(w, h * 0.9, [[h * 0.045, 0.7], [h * 0.02, 1.9]], 151, { hasta: h })}" fill="${C.arenaMedia}"/>`;
  g += `<path d="${cresta(w, h * 0.955, [[h * 0.03, 1.1], [h * 0.012, 2.6]], 157, { hasta: h })}" fill="${C.arenaOscura}" opacity=".85"/>`;
  for (const [x, alt, sem] of [
    [w * 0.05, 90, 161],
    [w * 0.12, 66, 163],
    [w * 0.88, 78, 167],
    [w * 0.95, 100, 173],
  ]) {
    g += hierba(x, h * 0.97, alt, sem, { color: C.olivaOscura });
  }

  return svg(w, h, f.defs + defsAcabado(w, h), g + acabado(w, h, { opacidadGrano: 0.42 }), {
    titulo: 'Kitesurfistas en la playa de Los Lances con viento de levante',
  });
}

/* ------------------------------------------------------------------ *
 * 10. Guía — Cómo llegar (carretera de la costa y ferry a Tánger)
 * ------------------------------------------------------------------ */
function guiaComoLlegar() {
  const w = 1200;
  const h = 800;
  const f = fondoCostero(w, h, {
    horizonte: h * 0.38,
    solX: w * 0.78,
    solR: 28,
    semilla: 179,
    conPlaya: false,
    id: 'gc',
  });

  let g = f.cuerpo;

  // Colinas escalonadas que bajan hasta el mar.
  g += `<path d="${cresta(w, h * 0.42, [[h * 0.03, 0.9], [h * 0.014, 2.4]], 181, { hasta: h })}" fill="${C.oliva}" opacity=".55"/>`;
  g += `<path d="${cresta(w, h * 0.54, [[h * 0.04, 0.7], [h * 0.018, 1.8]], 191, { hasta: h })}" fill="${C.olivaOscura}" opacity=".72"/>`;
  g += `<path d="${cresta(w, h * 0.72, [[h * 0.05, 0.6], [h * 0.02, 1.5]], 193, { hasta: h })}" fill="${C.sombra}" opacity=".85"/>`;

  // Ferry cruzando el Estrecho.
  const fx = w * 0.24;
  const fy = h * 0.34;
  g +=
    `<path d="M${n(fx - 46)} ${n(fy)}h92l-14 20h-64Z" fill="${C.hueso}" opacity=".95"/>` +
    `<rect x="${n(fx - 30)}" y="${n(fy - 20)}" width="60" height="20" fill="${C.hueso}" opacity=".95"/>` +
    `<rect x="${n(fx - 8)}" y="${n(fy - 34)}" width="12" height="16" fill="${C.terracota}"/>` +
    `<ellipse cx="${n(fx)}" cy="${n(fy + 24)}" rx="58" ry="6" fill="${C.hueso}" opacity=".45"/>`;

  // Carretera serpenteante hacia el hotel.
  g +=
    `<path d="M${n(w * 0.46)} ${n(h * 0.5)}C${n(w * 0.3)} ${n(h * 0.64)},${n(w * 0.78)} ${n(h * 0.72)},${n(w * 0.5)} ${n(
      h * 0.86
    )}C${n(w * 0.36)} ${n(h * 0.93)},${n(w * 0.42)} ${n(h * 0.97)},${n(w * 0.38)} ${h}" stroke="${
      C.sombra
    }" stroke-width="62" fill="none" stroke-linecap="round" opacity=".9"/>` +
    `<path d="M${n(w * 0.46)} ${n(h * 0.5)}C${n(w * 0.3)} ${n(h * 0.64)},${n(w * 0.78)} ${n(h * 0.72)},${n(w * 0.5)} ${n(
      h * 0.86
    )}C${n(w * 0.36)} ${n(h * 0.93)},${n(w * 0.42)} ${n(h * 0.97)},${n(w * 0.38)} ${h}" stroke="${
      C.arenaClara
    }" stroke-width="5" stroke-dasharray="22 26" fill="none" opacity=".8"/>`;

  // Coche visto desde atrás, subiendo la cuesta.
  g +=
    `<g transform="translate(${n(w * 0.47)} ${n(h * 0.88)})">` +
    `<rect x="-52" y="-34" width="104" height="46" rx="14" fill="${C.hueso}"/>` +
    `<path d="M-38-34q38-30 76 0Z" fill="${C.azul}" opacity=".5"/>` +
    `<circle cx="-32" cy="14" r="13" fill="${C.tinta}"/>` +
    `<circle cx="32" cy="14" r="13" fill="${C.tinta}"/>` +
    `<rect x="-46" y="-12" width="16" height="10" rx="4" fill="${C.terracota}"/>` +
    `<rect x="30" y="-12" width="16" height="10" rx="4" fill="${C.terracota}"/>` +
    `</g>`;

  // Poste indicador de madera.
  g +=
    `<rect x="${n(w * 0.79)}" y="${n(h * 0.6)}" width="12" height="${n(h * 0.4)}" fill="${C.sombra}"/>` +
    `<path d="M${n(w * 0.66)} ${n(h * 0.62)}h${n(w * 0.15)}v34h${n(-w * 0.15)}l-18-17Z" fill="${C.arenaMedia}"/>` +
    `<path d="M${n(w * 0.68)} ${n(h * 0.7)}h${n(w * 0.13)}v30h${n(-w * 0.13)}l-16-15Z" fill="${C.arena}"/>` +
    `<rect x="${n(w * 0.69)}" y="${n(h * 0.645)}" width="${n(w * 0.1)}" height="7" rx="3" fill="${C.terracotaOscura}" opacity=".6"/>` +
    `<rect x="${n(w * 0.705)}" y="${n(h * 0.722)}" width="${n(w * 0.08)}" height="6" rx="3" fill="${C.terracotaOscura}" opacity=".5"/>`;

  g += palmera(w * 0.9, h * 0.98, 250, 197, { color: C.tinta, inclina: -0.05 });

  return svg(w, h, f.defs + defsAcabado(w, h), g + acabado(w, h, { opacidadGrano: 0.42 }), {
    titulo: 'Carretera de la costa hacia Tarifa con el ferry a Tánger al fondo',
  });
}

/* ------------------------------------------------------------------ *
 * 11. Avatar del agente virtual (burbuja de WhatsApp)
 * ------------------------------------------------------------------ */
function agenteAvatar() {
  const s = 256;
  const defs =
    linG('avFondo', [
      ['0%', '#F6DFC0'],
      ['58%', '#E9BC93'],
      ['100%', '#D9895F'],
    ]) +
    linG('avPelo', [
      ['0%', '#4A3128'],
      ['100%', '#2B1C16'],
    ]) +
    `<clipPath id="avClip"><circle cx="128" cy="128" r="128"/></clipPath>`;

  let g = `<g clip-path="url(#avClip)">`;
  g += `<rect width="${s}" height="${s}" fill="url(#avFondo)"/>`;
  // Sol y horizonte detrás del retrato: la misma luz que el resto del sitio.
  g += `<circle cx="188" cy="76" r="46" fill="${C.solNucleo}" opacity=".5"/>`;
  g += `<path d="M0 176q64-20 128 0t128 0v80H0Z" fill="${C.terracota}" opacity=".28"/>`;

  // Hombros y camisa de lino.
  g += `<path d="M40 256q6-72 88-84h16q82 12 88 84Z" fill="${C.hueso}"/>`;
  g += `<path d="M112 172h32l14 30-30 26-30-26Z" fill="${C.arenaClara}"/>`;
  // Cuello y rostro.
  g += `<path d="M112 148h32v34l-16 12-16-12Z" fill="#D89C74"/>`;
  g += `<ellipse cx="128" cy="116" rx="46" ry="52" fill="#E9B489"/>`;
  // Melena recogida.
  g += `<path d="M128 52c34 0 50 24 50 56 0 10-2 18-4 24-4-30-18-42-46-42s-42 12-46 42c-2-6-4-14-4-24 0-32 16-56 50-56Z" fill="url(#avPelo)"/>`;
  g += `<path d="M78 108q-14 22-6 46 14-12 12-34Z" fill="url(#avPelo)"/>`;
  g += `<path d="M178 108q14 22 6 46-14-12-12-34Z" fill="url(#avPelo)"/>`;
  // Gesto amable: ojos entornados y sonrisa.
  g += `<path d="M104 116q10-9 20 0" stroke="${C.tinta}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M132 116q10-9 20 0" stroke="${C.tinta}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M114 140q14 12 28 0" stroke="${C.tinta}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  g += `<circle cx="98" cy="132" r="7" fill="${C.rosa}" opacity=".45"/>`;
  g += `<circle cx="158" cy="132" r="7" fill="${C.rosa}" opacity=".45"/>`;
  // Auricular: se lee de inmediato como "atención al huésped".
  g += `<path d="M80 118a48 44 0 0 1 96 0" stroke="${C.tinta}" stroke-width="7" fill="none" opacity=".85"/>`;
  g += `<rect x="70" y="112" width="16" height="26" rx="8" fill="${C.tinta}"/>`;
  g += `<rect x="170" y="112" width="16" height="26" rx="8" fill="${C.tinta}"/>`;
  g += `<path d="M78 138q-6 26 22 30" stroke="${C.tinta}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  g += `<circle cx="102" cy="169" r="6" fill="${C.tinta}"/>`;
  g += `</g>`;

  return svg(s, s, defs, g, { titulo: 'Asistente virtual de Hotel Almara' });
}

/* ------------------------------------------------------------------ *
 * 12. Marca: monograma sol + olas
 * ------------------------------------------------------------------ */
function marca({ tam = 96, fondo = null, color = C.hueso } = {}) {
  const c = tam / 2;
  let g = '';
  if (fondo) g += `<circle cx="${c}" cy="${c}" r="${c}" fill="${fondo}"/>`;
  const e = tam / 96;
  g += `<circle cx="${c}" cy="${n(c - 8 * e)}" r="${n(17 * e)}" fill="none" stroke="${color}" stroke-width="${n(5 * e)}"/>`;
  g += `<path d="M${n(c - 34 * e)} ${n(c + 16 * e)}q${n(11 * e)} ${n(-9 * e)},${n(22 * e)} 0t${n(22 * e)} 0t${n(
    22 * e
  )} 0" stroke="${color}" stroke-width="${n(5 * e)}" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${n(c - 26 * e)} ${n(c + 30 * e)}q${n(9 * e)} ${n(-8 * e)},${n(18 * e)} 0t${n(18 * e)} 0" stroke="${color}" stroke-width="${n(
    4 * e
  )}" fill="none" stroke-linecap="round" opacity=".75"/>`;
  return svg(tam, tam, '', g, { titulo: 'Hotel Almara' });
}

/* ------------------------------------------------------------------ *
 * 13. Mapa ilustrado del Estrecho (base para el mapa interactivo)
 * ------------------------------------------------------------------ */
function mapaTarifa() {
  const w = 1200;
  const h = 760;
  const defs =
    linG('mpMar', [
      ['0%', '#7FC6C2'],
      ['40%', '#3E93A8'],
      ['100%', '#215C79'],
    ]) +
    linG('mpTierra', [
      ['0%', '#F2E3CB'],
      ['100%', '#DFC7A2'],
    ]) +
    filtroGrano('mpGrano', { frecuencia: 1.1, fuerza: 0.3 });

  const fuente = `font-family="Georgia,'Times New Roman',serif"`;
  let g = `<rect width="${w}" height="${h}" fill="url(#mpMar)"/>`;

  // Península: la costa baja en diagonal hasta la punta de Tarifa.
  const costa =
    `M0 0H${w}V${n(h * 0.12)}` +
    `C${n(w * 0.86)} ${n(h * 0.2)},${n(w * 0.78)} ${n(h * 0.26)},${n(w * 0.7)} ${n(h * 0.34)}` +
    `C${n(w * 0.62)} ${n(h * 0.42)},${n(w * 0.56)} ${n(h * 0.48)},${n(w * 0.47)} ${n(h * 0.5)}` +
    `C${n(w * 0.36)} ${n(h * 0.53)},${n(w * 0.24)} ${n(h * 0.46)},${n(w * 0.14)} ${n(h * 0.36)}` +
    `C${n(w * 0.08)} ${n(h * 0.3)},${n(w * 0.04)} ${n(h * 0.22)},0 ${n(h * 0.2)}Z`;
  g += `<path d="${costa}" fill="url(#mpTierra)"/>`;
  g += `<path d="${costa}" fill="none" stroke="${C.hueso}" stroke-width="7" opacity=".85"/>`;

  // Relieve interior y masas de vegetación.
  const rm = azar(211);
  for (let i = 0; i < 22; i++) {
    const x = w * (0.05 + rm() * 0.9);
    const y = h * (0.04 + rm() * 0.2);
    g += `<path d="M${n(x - 26)} ${n(y + 14)}q${26} ${-30},${52} 0Z" fill="${C.oliva}" opacity="${n(0.25 + rm() * 0.3)}"/>`;
  }
  for (let i = 0; i < 26; i++) {
    const x = w * (0.06 + rm() * 0.86);
    const y = h * (0.16 + rm() * 0.2);
    g += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(5 + rm() * 9)}" fill="${C.olivaOscura}" opacity="${n(0.18 + rm() * 0.22)}"/>`;
  }

  // N-340: la carretera que llega desde Cádiz y Jerez.
  g += `<path d="M${n(w * 0.02)} ${n(h * 0.05)}C${n(w * 0.25)} ${n(h * 0.14)},${n(w * 0.3)} ${n(h * 0.2)},${n(
    w * 0.44
  )} ${n(h * 0.28)}C${n(w * 0.56)} ${n(h * 0.35)},${n(w * 0.6)} ${n(h * 0.38)},${n(w * 0.66)} ${n(h * 0.4)}" stroke="${
    C.hueso
  }" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${n(w * 0.02)} ${n(h * 0.05)}C${n(w * 0.25)} ${n(h * 0.14)},${n(w * 0.3)} ${n(h * 0.2)},${n(
    w * 0.44
  )} ${n(h * 0.28)}C${n(w * 0.56)} ${n(h * 0.35)},${n(w * 0.6)} ${n(h * 0.38)},${n(w * 0.66)} ${n(h * 0.4)}" stroke="${
    C.terracota
  }" stroke-width="4" stroke-dasharray="16 14" fill="none" opacity=".75"/>`;

  // Casco urbano de Tarifa.
  for (let i = 0; i < 34; i++) {
    const x = w * (0.34 + rm() * 0.14);
    const y = h * (0.3 + rm() * 0.14);
    g += `<rect x="${n(x)}" y="${n(y)}" width="${n(9 + rm() * 12)}" height="${n(8 + rm() * 10)}" rx="2" fill="${
      C.hueso
    }" opacity="${n(0.6 + rm() * 0.4)}"/>`;
  }

  // Isla de las Palomas y su istmo: el punto más al sur de Europa.
  g +=
    `<path d="M${n(w * 0.42)} ${n(h * 0.5)}l${n(w * 0.012)} ${n(h * 0.09)}h${n(-w * 0.02)}Z" fill="${C.arenaMedia}"/>` +
    `<ellipse cx="${n(w * 0.425)}" cy="${n(h * 0.62)}" rx="${n(w * 0.045)}" ry="${n(h * 0.035)}" fill="url(#mpTierra)"/>` +
    `<ellipse cx="${n(w * 0.425)}" cy="${n(h * 0.62)}" rx="${n(w * 0.045)}" ry="${n(h * 0.035)}" fill="none" stroke="${
      C.hueso
    }" stroke-width="5" opacity=".85"/>`;

  // Costa africana al sur del Estrecho.
  const africa = `M0 ${h}V${n(h * 0.9)}C${n(w * 0.2)} ${n(h * 0.86)},${n(w * 0.42)} ${n(h * 0.92)},${n(w * 0.62)} ${n(
    h * 0.88
  )}C${n(w * 0.8)} ${n(h * 0.85)},${n(w * 0.9)} ${n(h * 0.9)},${w} ${n(h * 0.87)}V${h}Z`;
  g += `<path d="${africa}" fill="${C.arenaMedia}" opacity=".9"/>`;
  g += `<path d="${africa}" fill="none" stroke="${C.hueso}" stroke-width="6" opacity=".6"/>`;

  // Corrientes del Estrecho, insinuadas.
  for (let i = 0; i < 7; i++) {
    const y = h * (0.66 + i * 0.026);
    g += `<path d="M${n(w * (0.08 + rm() * 0.1))} ${n(y)}q${n(w * 0.08)} ${-10},${n(w * 0.16)} 0t${n(w * 0.16)} 0" stroke="${
      C.hueso
    }" stroke-width="3" fill="none" opacity=".22"/>`;
  }

  // Rótulos geográficos.
  const etiqueta = (x, y, txt, { tam = 26, col = C.tinta, op = 0.75, esp = 2, it = false } = {}) =>
    `<text x="${n(x)}" y="${n(y)}" ${fuente} font-size="${tam}" fill="${col}" opacity="${op}" letter-spacing="${esp}"${
      it ? ' font-style="italic"' : ''
    }>${txt}</text>`;
  g += etiqueta(w * 0.33, h * 0.27, 'TARIFA', { tam: 30, esp: 5 });
  g += etiqueta(w * 0.07, h * 0.3, 'Playa de Los Lances', { tam: 20, op: 0.6, it: true });
  g += etiqueta(w * 0.72, h * 0.28, 'Bolonia', { tam: 20, op: 0.6, it: true });
  g += etiqueta(w * 0.46, h * 0.68, 'ESTRECHO DE GIBRALTAR', { tam: 24, col: C.hueso, op: 0.8, esp: 4 });
  g += etiqueta(w * 0.06, h * 0.96, 'MARRUECOS', { tam: 24, col: C.sombra, op: 0.7, esp: 4 });
  g += etiqueta(w * 0.02, h * 0.1, 'N-340  ·  Cádiz / Jerez', { tam: 19, op: 0.55 });

  // Rosa de los vientos y escala.
  const cx = w * 0.93;
  const cy = h * 0.62;
  g +=
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="42" fill="${C.hueso}" opacity=".8"/>` +
    `<path d="M${n(cx)} ${n(cy - 34)}l10 30-10 8-10-8Z" fill="${C.terracota}"/>` +
    `<path d="M${n(cx)} ${n(cy + 34)}l10-30-10-8-10 8Z" fill="${C.sombra}" opacity=".6"/>` +
    `<text x="${n(cx)}" y="${n(cy - 46)}" ${fuente} font-size="20" fill="${C.tinta}" text-anchor="middle">N</text>`;
  g +=
    `<rect x="${n(w * 0.05)}" y="${n(h * 0.72)}" width="120" height="7" fill="${C.hueso}" opacity=".85"/>` +
    `<rect x="${n(w * 0.05)}" y="${n(h * 0.72)}" width="60" height="7" fill="${C.tinta}" opacity=".55"/>` +
    `<text x="${n(w * 0.05)}" y="${n(h * 0.755)}" ${fuente} font-size="18" fill="${C.hueso}">5 km</text>`;

  g += `<rect width="${w}" height="${h}" filter="url(#mpGrano)" opacity=".35"/>`;
  return svg(w, h, defs, g, { titulo: 'Mapa ilustrado de Tarifa y el Estrecho de Gibraltar' });
}

/* ------------------------------------------------------------------ *
 * 14. Imagen para compartir en redes y mensajería
 * ------------------------------------------------------------------ */
function portadaSocial() {
  const w = 1200;
  const h = 630;
  const f = fondoCostero(w, h, { horizonte: h * 0.54, orilla: h * 0.74, solX: w * 0.68, solR: 34, semilla: 223 });
  let g = f.cuerpo;
  g += `<path d="${cresta(w, h * 0.92, [[h * 0.04, 0.7], [h * 0.018, 1.9]], 227, { hasta: h })}" fill="${C.tinta}" opacity=".9"/>`;
  g += palmera(w * 0.93, h * 0.9, 260, 229, { color: C.tinta, inclina: -0.06 });
  g += `<rect width="${w}" height="${h}" fill="${C.tinta}" opacity=".2"/>`;
  const serif = `font-family="Georgia,'Times New Roman',serif"`;
  g +=
    `<text x="${n(w / 2)}" y="${n(h * 0.47)}" ${serif} font-size="76" fill="${C.hueso}" text-anchor="middle" letter-spacing="4">Hotel Almara</text>` +
    `<text x="${n(w / 2)}" y="${n(h * 0.58)}" font-family="Helvetica,Arial,sans-serif" font-size="26" fill="${
      C.arenaClara
    }" text-anchor="middle" letter-spacing="8">DONDE EL MAR TE ESPERA</text>` +
    `<line x1="${n(w * 0.42)}" y1="${n(h * 0.63)}" x2="${n(w * 0.58)}" y2="${n(h * 0.63)}" stroke="${C.ambar}" stroke-width="2"/>` +
    `<text x="${n(w / 2)}" y="${n(h * 0.7)}" font-family="Helvetica,Arial,sans-serif" font-size="22" fill="${
      C.arenaClara
    }" text-anchor="middle" letter-spacing="3">TARIFA · CÁDIZ</text>`;
  return svg(w, h, f.defs + defsAcabado(w, h), g + acabado(w, h, { opacidadGrano: 0.4 }), {
    titulo: 'Hotel Almara — Tarifa, Cádiz',
  });
}

/* ------------------------------------------------------------------ *
 * Generación
 * ------------------------------------------------------------------ */
mkdirSync(SALIDA, { recursive: true });
console.log('\nIlustraciones originales de Hotel Almara\n');

const piezas = [
  ['hero-atardecer.svg', heroAtardecer],
  ['habitacion-vista-mar.svg', habitacionVistaMar],
  ['suite-almara.svg', suiteAlmara],
  ['habitacion-jardin.svg', habitacionJardin],
  ['piscina-infinita.svg', piscinaInfinita],
  ['restaurante.svg', restaurante],
  ['guia-playas.svg', guiaPlayas],
  ['guia-gastronomia.svg', guiaGastronomia],
  ['guia-actividades.svg', guiaActividades],
  ['guia-como-llegar.svg', guiaComoLlegar],
  ['agente-avatar.svg', agenteAvatar],
  ['mapa-tarifa.svg', mapaTarifa],
  ['portada-social.svg', portadaSocial],
  ['marca.svg', () => marca({ tam: 96, color: C.hueso })],
  ['favicon.svg', () => marca({ tam: 64, fondo: C.terracota, color: C.hueso })],
];

for (const [nombre, fn] of piezas) escribir(nombre, fn());
console.log(`\n${piezas.length} piezas generadas en assets/img\n`);
