// src/utils/certificados.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

/* ===== Tipos compartidos (coinciden con tu diseñador) ===== */
export type Align = "left" | "center" | "right";

export type BoxCfg = {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  align: Align;
  bold: boolean;
  color: string;   // "#rrggbb"
  font?: string;   // no incrustamos TTF; mapeamos a fuentes estándar
};

export type Layout = {
  width: number;
  height: number;
  boxes: Record<string, BoxCfg>;
  mensajeBase: string;
};

type TipoPlantilla = "Coordinador" | "Asesor" | "Integrante" | "Equipo";

type Plantilla = {
  id: string;
  nombre: string;
  tipo: TipoPlantilla;
  concursoId: string;
  actualizadoEn: string;
  layout: Layout;
  pdfUrl?: string;
};

type Concurso = { id: string; nombre: string; categoria?: string; lugar?: string };
type Destinatario = { id: string; nombre: string; equipo?: string; puesto?: string; lugar?: string; email?: string };

/* ===== Helpers de descarga/Blob (compatibles con SSR / sin tipos DOM) ===== */
const getBlobCtor = (): any => {
  const anyGlobal = globalThis as any;
  const BlobCtor = anyGlobal?.Blob;
  if (!BlobCtor) throw new Error("Blob no está disponible en este entorno.");
  return BlobCtor;
};

const getURL = (): any => {
  const anyGlobal = globalThis as any;
  const URLImpl = anyGlobal?.URL || anyGlobal?.webkitURL;
  if (!URLImpl) throw new Error("URL no está disponible en este entorno.");
  return URLImpl;
};

export const bytesToPdfBlob = (bytes: Uint8Array): any => {
  const BlobCtor = getBlobCtor();
  return new BlobCtor([bytes], { type: "application/pdf" });
};

export const bytesToZipBlob = (bytes: Uint8Array): any => {
  const BlobCtor = getBlobCtor();
  return new BlobCtor([bytes], { type: "application/zip" });
};

export const downloadBlob = (blob: any, filename: string) => {
  const URL_ = getURL();
  const a = document.createElement("a");
  const url = URL_.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL_.revokeObjectURL(url), 0);
};

export const zipMany = async (files: { filename: string; bytes: Uint8Array }[]) => {
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.bytes);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
};

export const u8ToBase64 = (u8: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};

/* ===== Colores y wrapping ===== */
const hexToRgb01 = (hex: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#000000");
  const r = m ? parseInt(m[1], 16) / 255 : 0;
  const g = m ? parseInt(m[2], 16) / 255 : 0;
  const b = m ? parseInt(m[3], 16) / 255 : 0;
  return rgb(r, g, b);
};

const wrapText = (
  text: string,
  maxWidth: number,
  font: any,
  size: number
) => {
  const words = (text || "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? line + " " + w : w;
    const width = font.widthOfTextAtSize(trial, size);
    if (width <= maxWidth || !line) {
      line = trial;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/* === Mapeo correcto a fuentes estándar de pdf-lib === */
const pickStdFont = (name?: string, bold?: boolean) => {
  const n = (name || "").toLowerCase();
  if (n.includes("times") || n.includes("serif")) {
    return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  }
  if (n.includes("courier") || n.includes("mono")) {
    return bold ? StandardFonts.CourierBold : StandardFonts.Courier;
  }
  // default helvetica/sans
  return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
};

/* ===== Tokens ===== */
export const buildTokenMap = ({
  plantilla,
  concurso,
  destinatario,
}: {
  plantilla: Plantilla;
  concurso?: Concurso;
  destinatario: Omit<Destinatario, "id">;
}) => {
  const FECHA = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const base: Record<string, string> = {
    "{{NOMBRE}}": destinatario.nombre || "",
    "{{NOMBRE_EQUIPO}}": destinatario.equipo || "",
    "{{EQUIPO}}": destinatario.equipo || "",
    "{{CONCURSO}}": concurso?.nombre || "",
    "{{CATEGORIA}}": concurso?.categoria || "",
    "{{LUGAR}}": destinatario.lugar || concurso?.lugar || "",
    "{{CARGO}}": destinatario.puesto || "",
    "{{PUESTO}}": destinatario.puesto || "",
    "{{FECHA}}": FECHA,
  };

  const MENSAJE = Object.entries(base).reduce(
    (acc, [k, v]) => acc.replaceAll(k, v ?? ""),
    plantilla.layout.mensajeBase || ""
  );
  base["{{MENSAJE}}"] = MENSAJE;

  return base;
};

/* ===== PDF Render ===== */
export const renderCertToPdfBytes = async ({
  plantilla,
  concurso,
  destinatario,
  apiBase,
}: {
  plantilla: Plantilla;
  concurso?: Concurso;
  destinatario: Omit<Destinatario, "id">;
  apiBase?: string;
}) => {
  const doc = await PDFDocument.create();
  let page: any;
  let pageWidth = Math.max(1, plantilla.layout?.width || 520);
  let pageHeight = Math.max(1, plantilla.layout?.height || 360);

  if (plantilla.pdfUrl) {
    const url = apiBase
      ? `${apiBase}/proxy-pdf?url=${encodeURIComponent(plantilla.pdfUrl)}`
      : plantilla.pdfUrl;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("No se pudo leer el PDF base");
    const bgBytes = new Uint8Array(await resp.arrayBuffer());
    const bgDoc = await PDFDocument.load(bgBytes);

    // Copiamos la página base al documento final y dibujamos encima
    const [copied] = await doc.copyPages(bgDoc, [0]);
    page = doc.addPage(copied);
    pageWidth = page.getWidth();
    pageHeight = page.getHeight();
  } else {
    page = doc.addPage([pageWidth, pageHeight]);
  }

  const tokens = buildTokenMap({ plantilla, concurso, destinatario });

  // Fuentes (cache)
  const fontCache = new Map<string, any>();
  const getFont = async (name?: string, bold?: boolean) => {
    const key = (name || "") + (bold ? "-b" : "-r");
    if (fontCache.has(key)) return fontCache.get(key);
    const std = pickStdFont(name, bold);
    const f = await doc.embedFont(std);
    fontCache.set(key, f);
    return f;
  };

  // Dibujar tokens
  for (const [tok, cfg] of Object.entries(plantilla.layout.boxes || {})) {
    const text = tok === "{{MENSAJE}}" ? tokens["{{MENSAJE}}"] : (tokens[tok] ?? "");
    if (!text) continue;

    const font = await getFont(cfg.font, cfg.bold);
    const color = hexToRgb01(cfg.color || "#0f172a");
    const size = Math.max(8, cfg.size || 12);
    const lineH = size * 1.15;

    const leftX = cfg.x;
    const topY = cfg.y;

    const lines = wrapText(text, cfg.w, font, size);
    let usedHeight = 0;

    for (const line of lines) {
      const yTop = topY + usedHeight;
      const yPdf = pageHeight - (yTop + size); // transformar a origen inferior
      if (yPdf < pageHeight - (topY + cfg.h)) break; // fuera del alto

      const width = font.widthOfTextAtSize(line, size);
      let x = leftX;
      if (cfg.align === "center") x = leftX + (cfg.w - width) / 2;
      if (cfg.align === "right") x = leftX + (cfg.w - width);

      page.drawText(line, { x, y: yPdf, size, font, color });
      usedHeight += lineH;
    }
  }

  return await doc.save();
};
