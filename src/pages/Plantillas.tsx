'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "../components/ui/Card";
import Button from "../components/ui/Button";
import { PDFDocument } from "pdf-lib"; // para tamaño/rotación

// RND robusto (CJS/ESM)
import * as ReactRnd from "react-rnd";
const Rnd: any = (ReactRnd as any).Rnd || (ReactRnd as any).default || (ReactRnd as any);

// Firebase
import { db, storage } from "../servicios/firebaseConfig";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc as fsDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ======================= PDF.js por CDN ======================= */
declare global { interface Window { pdfjsLib?: any; } }
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174";

// 🔒 DPR fijo para consistencia visual (independiente del zoom del navegador)
const DPR_LOCK = 2; // si quieres mayor nitidez, sube a 3 (costo: más CPU)

const ensurePdfJs = async (): Promise<any> => {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  await new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = `${PDFJS_CDN}/build/pdf.min.js`;
    s.onload = () => res();
    s.onerror = () => rej(new Error("No se pudo cargar pdf.min.js"));
    document.head.appendChild(s);
  });
  const pdfjsLib = (window as any).pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.js`;
  return pdfjsLib;
};

/* ======================= Canvas PDF (rotación y resolución constantes) ======================= */
function PDFCanvas({
  bytes,
  displayWidth,
  rotationOverride = 0,
  dpr = DPR_LOCK,
  onRendered,
}: {
  bytes: Uint8Array;
  displayWidth: number;
  rotationOverride?: number; // 🔒 siempre la misma rotación
  dpr?: number;              // 🔒 DPR fijo
  onRendered?: (displayHeight: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastJob = useRef<number>(0);

  useEffect(() => {
    if (!bytes || bytes.byteLength === 0 || !displayWidth) return;

    let cancelled = false;
    const jobId = Date.now();
    lastJob.current = jobId;

    let destroyTask: (() => void) | undefined;

    (async () => {
      const pdfjsLib = await ensurePdfJs();
      const dataForWorker = bytes.slice();

      const loadingTask = pdfjsLib.getDocument({
        data: dataForWorker,
        cMapUrl: `${PDFJS_CDN}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
      });

      const pdf = await loadingTask.promise;
      if (cancelled || lastJob.current !== jobId) return;

      const page = await pdf.getPage(1);

      // 🔒 rotación controlada (no depende del PDF viewer ni del DPR)
      const rotation = ((rotationOverride || 0) % 360 + 360) % 360;

      // Viewport base (sin escala), con la rotación bloqueada
      const v0 = page.getViewport({ scale: 1, rotation });
      const scale = displayWidth / v0.width;

      // Usamos DPR fijo para la nitidez interna del canvas
      const viewport = page.getViewport({
        scale: scale * (dpr ?? DPR_LOCK),
        rotation,
      });

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      const w = Math.round(viewport.width);
      const h = Math.round(viewport.height);

      canvas.width = w;
      canvas.height = h;
      // El tamaño CSS solo depende del displayWidth calculado por el editor
      canvas.style.width = `${Math.round(w / (dpr ?? DPR_LOCK))}px`;
      canvas.style.height = `${Math.round(h / (dpr ?? DPR_LOCK))}px`;
      // Evita blur por escalados raros de GPU en ciertos navegadores
      (canvas.style as any).imageRendering = "auto";

      // Fondo blanco para impresoras
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      const renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;

      if (!cancelled && lastJob.current === jobId) {
        onRendered?.(Math.round(h / (dpr ?? DPR_LOCK)));
      }

      destroyTask = () => {
        try { loadingTask.destroy?.(); } catch {}
        try { pdf.cleanup?.(); } catch {}
      };
    })().catch((e) => console.error("PDF render error:", e));

    return () => {
      cancelled = true;
      try { destroyTask?.(); } catch {}
    };
  }, [bytes, displayWidth, rotationOverride, dpr, onRendered]);

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}

/* ============================= Tipos y helpers ============================= */
type TipoPlantilla = "Coordinador" | "Asesor" | "Integrante" | "Equipo";
type Align = "left" | "center" | "right";

type BoxCfg = {
  x: number; y: number; w: number; h: number;
  size: number; align: Align; bold: boolean; color: string; font: string;
};
type Layout = { width: number; height: number; boxes: Record<string, BoxCfg>; mensajeBase: string; };
type Plantilla = { id: string; nombre: string; tipo: TipoPlantilla; concursoId: string; actualizadoEn: string; layout: Layout; pdfUrl?: string; };
type Concurso = { id: string; nombre: string };

/* ============================= UI helpers ============================= */
const neoSurface = [
  "relative rounded-xl3",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-[0_16px_40px_rgba(2,6,23,0.08),0_2px_4px_rgba(2,6,23,0.05)]",
  "before:content-[''] before:absolute before:inset-0 before:rounded-xl3",
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-10px_26px_rgba(2,6,23,0.06)]",
  "before:pointer-events-none",
].join(" ");

const neoInset = [
  "rounded-xl",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-inner shadow-black/10",
].join(" ");

const pill = [
  "relative rounded-full bg-white",
  "border border-white/60",
  "shadow-[0_8px_24px_rgba(2,6,23,0.06)]",
  "before:content-[''] before:absolute before:inset-px before:rounded-full before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
].join(" ");

const modalSurface = `${neoSurface} border-gray-200 ring-1 ring-gray-200 bg-white`;
const modalInset = `${neoInset} border-gray-200 ring-1 ring-gray-200`;

const varsPorTipo: Record<TipoPlantilla, string[]> = {
  Coordinador: ["{{NOMBRE}}","{{CARGO}}","{{CONCURSO}}","{{FECHA}}","{{MENSAJE}}"],
  Asesor: ["{{NOMBRE}}","{{CONCURSO}}","{{EQUIPO}}","{{FECHA}}","{{MENSAJE}}"],
  Integrante: ["{{NOMBRE}}","{{CONCURSO}}","{{EQUIPO}}","{{FECHA}}","{{MENSAJE}}"],
  Equipo: ["{{NOMBRE_EQUIPO}}","{{CONCURSO}}","{{CATEGORIA}}","{{LUGAR}}","{{FECHA}}","{{MENSAJE}}"],
};

const mensajeDefault: Record<TipoPlantilla, string> = {
  Coordinador: "Se otorga a {{NOMBRE}} por su destacada participación como {{CARGO}} en el {{CONCURSO}}.",
  Asesor: "Se otorga a {{NOMBRE}} por su acompañamiento en el {{CONCURSO}} con el equipo {{EQUIPO}}.",
  Integrante: "Se otorga a {{NOMBRE}} por su participación en el {{CONCURSO}} con el equipo {{EQUIPO}}.",
  Equipo: "Se reconoce al equipo {{NOMBRE_EQUIPO}} por su participación en el {{CONCURSO}}.",
};

const FUENTES = [
  "Inter","Arial","Helvetica","Times New Roman","Georgia","Garamond","Trebuchet MS","Verdana","Tahoma","Courier New",
  "Roboto","Noto Sans","Montserrat","Poppins","Lato","Open Sans","Work Sans","Nunito","Merriweather","Playfair Display",
  "Rubik","Fira Sans","Karla","Mulish","Barlow","Manrope","Hind","Asap","Cabin","Muli","Source Sans Pro","Quicksand",
  "PT Sans","IBM Plex Sans","Exo 2","Raleway","DM Sans","Catamaran","Abril Fatface","Bitter","Zilla Slab","Crimson Pro",
  "Spectral","Josefin Sans","Cairo","Kumbh Sans","Plus Jakarta Sans","Space Grotesk","Inter Tight","Urbanist","Public Sans","Jost",
];

type FormState = { id?: string; nombre: string; tipo: TipoPlantilla | ""; concursoId: string; layout: Layout; pdfUrl?: string; };

const mkBox = (x:number,y:number,w:number,h:number,size=16,align:Align="center",bold=false):BoxCfg =>
  ({ x,y,w,h,size,align,bold,color:"#0f172a",font:"Inter" });

function ChipTipo({ tipo }: { tipo: TipoPlantilla }) {
  const map: Record<TipoPlantilla, string> = {
    Coordinador: "bg-white text-tecnm-azul",
    Asesor: "bg-white text-gray-700",
    Integrante: "bg-white text-tecnm-gris10",
    Equipo: "bg-white text-indigo-700",
  };
  return <span className={`${pill} px-2.5 py-0.5 text-xs ${map[tipo]}`}>{tipo}</span>;
}

function NombreConcursoInline({ id, concursos }: { id: string; concursos: Concurso[] }) {
  const c = concursos.find((x) => x.id === id);
  return <>{c ? c.nombre : "—"}</>;
}

const sanitizeBoxes = (boxes: Record<string, BoxCfg>) => {
  const seen = new Set<string>();
  const entries = Object.entries(boxes).filter(([k]) => k && !seen.has(k) && seen.add(k));
  return Object.fromEntries(entries);
};

/* ============================== Modal + editor ============================== */
function ModalPlantilla({
  open, onClose, onSave, initial, concursos,
}: {
  open: boolean;
  initial?: FormState;
  onClose: () => void;
  onSave: (p: FormState & { _pdfFile?: File | null }) => void;
  concursos: Concurso[];
}) {
  const [form, setForm] = useState<FormState>(() => ({
    ...(initial ?? { nombre: "", tipo: "", concursoId: "", layout: { width: 520, height: 360, boxes: {}, mensajeBase: "" }, pdfUrl: undefined }),
  }));

  const [active, setActive] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | undefined>(undefined);

  // 🔒 metadatos bloqueados del PDF
  const [pdfRotation, setPdfRotation] = useState<number>(0);

  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(initial ? Object.keys(initial.layout.boxes).filter(Boolean) : [])
  );

  // Auto scale
  const centerRef = useRef<HTMLDivElement | null>(null);
  const [displayScale, setDisplayScale] = useState(1);

  useEffect(() => {
    const el = centerRef.current;
    if (!el || !form.layout.width || !form.layout.height) return;
    const recalc = () => {
      const aw = el.clientWidth - 16;
      const ah = el.clientHeight - 16;
      const s = Math.min(1, aw / form.layout.width, ah / form.layout.height);
      setDisplayScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    const ro = new ResizeObserver(recalc);
    ro.observe(el); recalc();
    return () => ro.disconnect();
  }, [form.layout.width, form.layout.height, pdfBytes]); // incluye pdfBytes para estabilidad

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({ ...initial, layout: { ...initial.layout, boxes: sanitizeBoxes(initial.layout.boxes || {}) } });
      setEnabled(new Set(Object.keys(initial.layout.boxes || {}).filter(Boolean)));
      setPdfFile(null); setPdfBytes(undefined);
      setPdfRotation(0);
    } else {
      setForm({ nombre: "", tipo: "", concursoId: "", layout: { width: 520, height: 360, boxes: {}, mensajeBase: "" } });
      setEnabled(new Set()); setPdfFile(null); setPdfBytes(undefined);
      setPdfRotation(0);
    }
    setActive(null);
  }, [open, initial]);

  // Cargar pdfUrl existente a bytes (respeta rotación y w/h)
  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!open) return;
      if (!form.pdfUrl || pdfBytes) return;
      try {
        const res = await fetch(form.pdfUrl);
        const ab = await res.arrayBuffer();
        if (canceled || !ab || ab.byteLength === 0) return;

        const safe = new Uint8Array(ab);
        setPdfBytes(safe);

        try {
          const doc = await PDFDocument.load(safe);
          const page = doc.getPages()[0];

          const rot = ((page.getRotation?.().angle ?? 0) % 360 + 360) % 360;
          setPdfRotation(rot); // 🔒 guardamos rotación

          const rawW = Math.round(page.getWidth());
          const rawH = Math.round(page.getHeight());
          const w = rot === 90 || rot === 270 ? rawH : rawW;
          const h = rot === 90 || rot === 270 ? rawW : rawH;

          setForm((f) => ({
            ...f,
            layout: { ...f.layout, width: w, height: h },
          }));
        } catch {}
      } catch (e) {
        console.warn("No se pudo descargar el PDF existente:", e);
      }
    })();
    return () => { canceled = true; };
  }, [open, form.pdfUrl, pdfBytes]);

  // Mensaje por tipo (solo nuevo)
  useEffect(() => {
    if (form.id) return;
    setForm((f) => ({ ...f, layout: { ...f.layout, mensajeBase: f.tipo ? mensajeDefault[f.tipo] : "" } }));
  }, [form.tipo]);

  // Drag tokens → textarea
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const onDragStartChip = (e: React.DragEvent, token: string) => { e.dataTransfer.setData("text/plain", token); };
  const onDropTextarea = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const token = e.dataTransfer.getData("text/plain");
    if (!token) return;
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const v = el.value.slice(0, start) + token + el.value.slice(end);
    setForm((f) => ({ ...f, layout: { ...f.layout, mensajeBase: v } }));
  };

  const vars = form.tipo ? varsPorTipo[form.tipo] : [];
  const box = (tok: string) => form.layout.boxes[tok];
  const patchBox = (tok: string, patch: Partial<BoxCfg>) =>
    setForm((f) => ({ ...f, layout: { ...f.layout, boxes: { ...f.layout.boxes, [tok]: { ...f.layout.boxes[tok], ...patch } } } }));

  const toggleToken = (tok: string) => {
    setEnabled((prev) => {
      const n = new Set(prev);
      if (n.has(tok)) {
        n.delete(tok);
        setForm((f) => { const copy = { ...f.layout.boxes }; delete copy[tok]; return { ...f, layout: { ...f.layout, boxes: copy } }; });
        if (active === tok) setActive(null);
      } else {
        n.add(tok);
        setForm((f) => {
          const exists = f.layout.boxes[tok];
          const W = Math.max(200, f.layout.width - 80);
          const pos = exists ?? mkBox(40, 60, W, 32, 16, "center", tok.includes("NOMBRE"));
          return { ...f, layout: { ...f.layout, boxes: { ...f.layout.boxes, [tok]: pos } } };
        });
      }
      return n;
    });
  };

  // Subir PDF → bytes + tamaño + rotación
  const handlePdf = async (file: File | null) => {
    if (!file) return;
    if (file.size === 0) { alert("El PDF está vacío."); return; }
    try {
      const ab = await file.arrayBuffer();
      if (!ab || ab.byteLength === 0) { alert("El PDF está vacío."); return; }
      const safe = new Uint8Array(ab.slice(0));
      const doc = await PDFDocument.load(safe);
      const page = doc.getPages()[0];

      const rot = ((page.getRotation?.().angle ?? 0) % 360 + 360) % 360;
      setPdfRotation(rot); // 🔒 guardamos rotación

      const rawW = Math.round(page.getWidth());
      const rawH = Math.round(page.getHeight());
      const w = rot === 90 || rot === 270 ? rawH : rawW;
      const h = rot === 90 || rot === 270 ? rawW : rawH;

      setForm((f) => ({ ...f, layout: { ...f.layout, width: w, height: h } }));
      setPdfFile(file); setPdfBytes(safe);
    } catch (e) {
      console.error(e); alert("No se pudo leer el PDF. Verifica el archivo.");
    }
  };

  if (!open) return null;

  const displayW = Math.max(1, Math.round(form.layout.width * displayScale));
  const displayH = Math.max(1, Math.round(form.layout.height * displayScale));
  const activeBox = active ? form.layout.boxes[active] : undefined;
  const tokenKeys = [...new Set(Object.keys(form.layout.boxes).filter(Boolean))];

  return (
    <AnimatePresence>
      <motion.div key="overlay" className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div key="dialog" className="fixed inset-0 z-50 grid place-items-center p-4"
        initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
        <div className={`${modalSurface} w-[96vw] h-[92vh] max-w-none overflow-hidden`} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">{form.id ? "Editar plantilla" : "Nueva plantilla"}</h3>
            <button className={`${pill} h-9 px-3 text-sm`} onClick={onClose} aria-label="Cerrar">✕</button>
          </div>

          <div className="grid grid-cols-[360px_1fr_340px] gap-6 h-[calc(92vh-64px)] p-4 overflow-hidden">
            {/* Izquierda */}
            <div className="pr-1 overflow-auto">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-600">Nombre</label>
                  <input
                    className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20 text-sm`}
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej. Constancia de Integrante"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">Tipo de plantilla</label>
                    <select
                      className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20 text-sm`}
                      value={form.tipo}
                      onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPlantilla | "" })}
                    >
                      <option value="" disabled>Selecciona un tipo…</option>
                      {(["Coordinador","Asesor","Integrante","Equipo"] as TipoPlantilla[]).map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600">Concurso</label>
                    <select
                      className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20 text-sm`}
                      value={form.concursoId}
                      onChange={(e) => setForm({ ...form, concursoId: e.target.value })}
                    >
                      <option value="" disabled>Selecciona un concurso…</option>
                      {concursos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600">Archivo PDF de la plantilla</label>
                  <div className="mt-1">
                    <label className="text-tecnm-azul cursor-pointer underline">
                      {pdfFile || form.pdfUrl ? "Cambiar PDF" : "Seleccionar PDF"}
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handlePdf(e.target.files?.[0] ?? null)} />
                    </label>
                    <span className="ml-2 text-xs text-slate-500">Se usará como fondo del certificado y para generar constancias.</span>
                  </div>
                </div>

                {/* Chips */}
                <div>
                  <p className="text-xs text-slate-600">Variables disponibles</p>
                  <div className="mt-2 flex flex-wrap gap-2 select-none">
                    {(form.tipo ? varsPorTipo[form.tipo] : []).map((tok) => {
                      const on = enabled.has(tok);
                      return (
                        <button
                          key={tok}
                          draggable
                          onDragStart={(e) => onDragStartChip(e, tok)}
                          onClick={() => toggleToken(tok)}
                          className={`${pill} px-3 py-1.5 text-sm border transition
                                      ${on ? "bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 text-white border-tecnm-azul"
                                           : "bg-white text-slate-700 border-slate-300 hover:brightness-[1.02]"}`}
                          title="Clic para mostrar/ocultar en el lienzo. Arrastra al mensaje para insertar el token."
                        >
                          {tok}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600">Mensaje base (usa los tokens)</label>
                  <textarea
                    ref={textareaRef}
                    onDrop={onDropTextarea}
                    onDragOver={(e) => e.preventDefault()}
                    rows={4}
                    className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20 text-sm`}
                    value={form.layout.mensajeBase}
                    onChange={(e) => setForm((f) => ({ ...f, layout: { ...f.layout, mensajeBase: e.target.value } }))}
                    placeholder={form.tipo ? mensajeDefault[form.tipo] : "Escribe el mensaje o elige un tipo…"}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Se renderiza en el token <code className="px-1 bg-slate-100 rounded">{`{{MENSAJE}}`}</code>.</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    className="rounded-full px-5 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
                    onClick={() => {
                      if (!form.nombre.trim()) return alert("Escribe un nombre para la plantilla.");
                      if (!form.tipo) return alert("Selecciona un tipo de plantilla.");
                      if (!form.concursoId) return alert("Selecciona un concurso antes de guardar.");
                      onSave({ ...form, _pdfFile: pdfFile }); onClose();
                    }}
                  >
                    Guardar
                  </Button>
                  <Button variant="outline" className={`${pill} px-4 py-2`} onClick={onClose}>Cancelar</Button>
                </div>
              </div>
            </div>

            {/* Centro: visor */}
            <div ref={centerRef} className="relative overflow-auto bg-slate-50/40 rounded-xl">
              <div className="relative mx-auto my-2" style={{ width: displayW, height: displayH }} onClick={() => setActive(null)}>
                {pdfBytes && pdfBytes.byteLength > 0 ? (
                  <PDFCanvas
                    bytes={pdfBytes}
                    displayWidth={displayW}
                    rotationOverride={pdfRotation} // 🔒 usar siempre la misma rotación
                    dpr={DPR_LOCK}                // 🔒 resolución constante
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
                    <div>{form.pdfUrl ? "Cargando vista previa del PDF…" : "Selecciona un PDF para previsualizarlo aquí."}</div>
                  </div>
                )}

                {([...Object.keys(form.layout.boxes)]).map((tok) => {
                  const b = form.layout.boxes[tok]; if (!b) return null;
                  const x = Math.round(b.x * displayScale);
                  const y = Math.round(b.y * displayScale);
                  const w = Math.round(b.w * displayScale);
                  const h = Math.round(b.h * displayScale);

                  return (
                    <Rnd
                      key={tok}
                      bounds="parent"
                      position={{ x, y }}
                      size={{ width: w, height: h }}
                      onDragStop={(_e:any, d:{x:number;y:number}) => patchBox(tok, { x: Math.round(d.x / displayScale), y: Math.round(d.y / displayScale) })}
                      onResizeStop={(_e:any,_dir:any,refEl:HTMLElement,_delta:any,pos:{x:number;y:number}) => patchBox(tok, {
                        w: Math.round(refEl.offsetWidth / displayScale),
                        h: Math.round(refEl.offsetHeight / displayScale),
                        x: Math.round(pos.x / displayScale),
                        y: Math.round(pos.y / displayScale),
                      })}
                      dragGrid={[1,1]} resizeGrid={[1,1]}
                      onClick={(e:React.MouseEvent) => { e.stopPropagation(); setActive(tok); }}
                      style={{
                        border: active === tok ? "2px dashed #2563eb" : "1px dashed rgba(2,6,23,.25)",
                        background: "rgba(2,6,23,.02)", cursor: "move", zIndex: 2, userSelect: "none",
                      }}
                    >
                      <div
                        className="w-full h-full overflow-hidden flex items-center justify-center px-1"
                        style={{
                          color: b.color, fontWeight: b.bold ? 700 : 500, fontSize: b.size * displayScale,
                          textAlign: b.align as any, fontFamily: b.font, lineHeight: 1.15, wordBreak: "break-word", whiteSpace: "pre-wrap",
                        }}
                      >
                        {tok === "{{MENSAJE}}" ? form.layout.mensajeBase : tok}
                      </div>
                    </Rnd>
                  );
                })}
              </div>
            </div>

            {/* Derecha: propiedades */}
            <div className="pl-1 overflow-auto">
              {!active || !form.layout.boxes[active] ? (
                <div className={`${modalInset} p-4 text-sm text-slate-600`}>Selecciona un token para editar su tamaño, alineado, color y tipografía.</div>
              ) : (
                <div className={`${modalInset} p-4 text-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">Propiedades de {active}</p>
                    <button className="text-xs text-slate-500 underline" onClick={() => setActive(null)}>cerrar</button>
                  </div>
                  {(() => {
                    const activeBox = form.layout.boxes[active]!;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-600">Tamaño</label>
                          <input
                            type="number" min={8} max={96}
                            className={`${modalInset} mt-1 w-full px-2 py-1`}
                            value={activeBox.size}
                            onChange={(e) => patchBox(active, { size: +e.target.value || 16 })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Alineado</label>
                          <select
                            className={`${modalInset} mt-1 w-full px-2 py-1`}
                            value={activeBox.align}
                            onChange={(e) => patchBox(active, { align: e.target.value as Align })}
                          >
                            <option value="left">left</option>
                            <option value="center">center</option>
                            <option value="right">right</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Color</label>
                          <input
                            type="color"
                            className="mt-1 w-full h-9 rounded"
                            value={activeBox.color}
                            onChange={(e) => patchBox(active, { color: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Tipografía</label>
                          <select
                            className={`${modalInset} mt-1 w-full px-2 py-1`}
                            value={activeBox.font}
                            onChange={(e) => patchBox(active, { font: e.target.value })}
                          >
                            {FUENTES.map((f) => (<option key={f} value={f}>{f}</option>))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 text-sm mt-1">
                            <input
                              type="checkbox"
                              checked={activeBox.bold}
                              onChange={(e) => patchBox(active, { bold: e.target.checked })}
                            />
                            <span>Negritas</span>
                          </label>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* =============================== Tarjeta =============================== */
function TarjetaPlantilla({
  p, onEdit, onDuplicate, onDelete, concursos,
}: {
  p: Plantilla;
  onEdit: (p: Plantilla) => void;
  onDuplicate: (p: Plantilla) => void;
  onDelete: (p: Plantilla) => void;
  concursos: Concurso[];
}) {
  const fecha = new Date(p.actualizadoEn).toLocaleString("es-MX", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`p-4 border-0 ${neoSurface} transition`}>
        <div className="flex gap-3">
          <div className="h-12 w-12 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
            {p.tipo.substring(0, 2).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold truncate">{p.nombre}</h3>
              <ChipTipo tipo={p.tipo} />
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-gray-600 truncate">
                <NombreConcursoInline id={p.concursoId} concursos={concursos} />
              </p>
              <p className="text-xs text-gray-500 whitespace-nowrap">Actualizado el {fecha}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className={`${pill} px-3 py-1.5`} onClick={() => onEdit(p)}>Editar</Button>
              <Button size="sm" variant="outline" className={`${pill} px-3 py-1.5`} onClick={() => onDuplicate(p)}>Duplicar</Button>
              <Button size="sm" variant="outline" className={`${pill} px-3 py-1.5`} onClick={() => alert("Descargar (pendiente)")}>Descargar</Button>
              <Button size="sm" variant="outline" className={`${pill} px-3 py-1.5 text-rose-600`} onClick={() => onDelete(p)}>Eliminar</Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* ================================ Página ================================ */
export default function Plantillas() {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<TipoPlantilla | "Todas">("Todas");
  const [concurso, setConcurso] = useState<string>("Todos");

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Plantilla | undefined>(undefined);

  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchParams] = useSearchParams();
  useEffect(() => { const cid = searchParams.get("concursoId"); if (cid) setConcurso(cid); }, [searchParams]);

  // Concursos
  useEffect(() => {
    const qy = query(collection(db, "Cursos"), orderBy("fechaInicio", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows: Concurso[] = snap.docs.map((d) => ({ id: d.id, nombre: (d.data().nombre || d.data().titulo || d.id) as string }));
      setConcursos(rows);
    });
    return () => unsub();
  }, []);

  // Plantillas
  useEffect(() => {
    setLoading(true);
    const col = collection(db, "Plantillas");
    const qy =
      concurso !== "Todos"
        ? query(col, where("concursoId", "==", concurso), orderBy("actualizadoEn", "desc"))
        : query(col, orderBy("actualizadoEn", "desc"));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: Plantilla[] = snap.docs.map((d) => {
          const data: any = d.data() || {};
          const ts = data.actualizadoEn instanceof Timestamp ? data.actualizadoEn.toDate().toISOString() : data.actualizadoEn || new Date().toISOString();
          return {
            id: d.id, nombre: data.nombre ?? d.id, tipo: data.tipo as TipoPlantilla,
            concursoId: data.concursoId as string, actualizadoEn: ts, layout: data.layout as Layout, pdfUrl: data.pdfUrl as string | undefined,
          };
        });
        setPlantillas(rows); setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [concurso]);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return plantillas.filter((p) => {
      const coincideTexto =
        !q || p.nombre.toLowerCase().includes(q) ||
        (concursos.find((c) => c.id === p.concursoId)?.nombre.toLowerCase().includes(q) ?? false);
      const coincideTab = tab === "Todas" ? true : p.tipo === tab;
      const coincideConcurso = concurso === "Todos" ? true : p.concursoId === concurso;
      return coincideTexto && coincideTab && coincideConcurso;
    });
  }, [busqueda, tab, concurso, plantillas, concursos]);

  const abrirNuevo = () => { setEditando(undefined); setModalOpen(true); };
  const abrirEditar = (p: Plantilla) => { setEditando(p); setModalOpen(true); };

  // Subida PDF
  const uploadPdfIfNeeded = async (pdfFile: File | null | undefined, concursoId: string) => {
    if (!pdfFile) return undefined;
    const path = `plantillas/${concursoId}/${Date.now()}-${pdfFile.name}`;
    const r = ref(storage, path);
    await uploadBytes(r, pdfFile);
    return await getDownloadURL(r);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plantillas</h1>
          <p className="text-sm text-gray-600">Diseña y administra plantillas de constancias por concurso y tipo.</p>
        </div>
        <Button
          className="rounded-full px-4 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
          onClick={abrirNuevo}
        >
          Nueva plantilla
        </Button>
      </div>

      {/* Barra de acciones */}
      <Card className={`p-4 border-0 ${neoSurface} overflow-visible`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible py-1 -mx-1 px-1">
            {(["Todas","Coordinador","Asesor","Integrante","Equipo"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`${pill} px-4 py-1.5 text-sm transition`}
                style={tab === t ? { background: "linear-gradient(90deg, var(--tw-gradient-from), var(--tw-gradient-to))" } : {}}
              >
                <span className={tab === t ? "text-white" : "text-gray-700"}>
                  <span className={tab === t ? "bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 bg-clip-text text-transparent" : ""}>
                    {t}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className={`${pill} flex items-center gap-2 bg-white px-3 py-2 shadow-inner ring-1 ring-gray-200`}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="opacity-70">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" />
              </svg>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar plantilla o concurso…"
                className="w-56 md:w-72 outline-none text-sm bg-transparent"
              />
            </div>

            <select
              value={concurso}
              onChange={(e) => setConcurso(e.target.value)}
              className={`${pill} bg-white px-3 py-2 text-sm`}
            >
              <option value="Todos">Todos los concursos</option>
              {concursos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </select>

            <Button variant="outline" className={`${pill} px-4 py-2`} onClick={() => { setBusqueda(""); setConcurso("Todos"); setTab("Todas"); }}>
              Restablecer filtros
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className={`${neoInset} p-8 text-center text-sm text-gray-600`}>Cargando plantillas…</Card>
      ) : resultados.length === 0 ? (
        <Card className={`${neoInset} p-8 text-center text-sm text-gray-600`}>No hay plantillas con esos filtros.</Card>
      ) : (
        <>
          <div className="text-sm text-gray-600">Resultados: <strong>{resultados.length}</strong></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resultados.map((p) => (
              <TarjetaPlantilla
                key={p.id}
                p={p}
                concursos={concursos}
                onEdit={abrirEditar}
                onDuplicate={async (pl) => {
                  const payload = {
                    nombre: `${pl.nombre} (copia)`,
                    tipo: pl.tipo,
                    concursoId: pl.concursoId,
                    actualizadoEn: serverTimestamp(),
                    layout: pl.layout,
                    pdfUrl: pl.pdfUrl ?? null,
                  };
                  const refDoc = await addDoc(collection(db, "Plantillas"), payload as any);
                  await updateDoc(fsDoc(db, "Cursos", pl.concursoId), { plantillas: arrayUnion(refDoc.id) }).catch(() => {});
                }}
                onDelete={async (pl) => {
                  if (!confirm(`¿Eliminar la plantilla "${pl.nombre}"?`)) return;
                  await deleteDoc(fsDoc(db, "Plantillas", pl.id));
                }}
              />
            ))}
          </div>
        </>
      )}

      <ModalPlantilla
        open={modalOpen}
        concursos={concursos}
        initial={
          editando
            ? { id: editando.id, nombre: editando.nombre, tipo: editando.tipo, concursoId: editando.concursoId, layout: editando.layout, pdfUrl: editando.pdfUrl }
            : undefined
        }
        onClose={() => setModalOpen(false)}
        onSave={async (f) => {
          const newPdfUrl = await uploadPdfIfNeeded(f._pdfFile, f.concursoId);
          const base: any = {
            nombre: f.nombre, tipo: f.tipo, concursoId: f.concursoId, layout: f.layout,
            pdfUrl: newPdfUrl ?? f.pdfUrl ?? null, actualizadoEn: serverTimestamp(),
          };
          if (f.id) {
            await updateDoc(fsDoc(db, "Plantillas", f.id), base);
          } else {
            const docRef = await addDoc(collection(db, "Plantillas"), base);
            await updateDoc(fsDoc(db, "Cursos", f.concursoId), { plantillas: arrayUnion(docRef.id) }).catch(() => {});
          }
        }}
      />
    </section>
  );
}
