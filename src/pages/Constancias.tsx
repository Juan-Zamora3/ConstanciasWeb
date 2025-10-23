// src/pages/Constancias.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import Button from "../components/ui/Button";

import { db } from "../servicios/firebaseConfig";

// Firestore (solo lo necesario)
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
  getDocs,
} from "firebase/firestore";

import {
  renderCertToPdfBytes,
  bytesToPdfBlob,
  bytesToZipBlob,
  zipMany,
  downloadBlob,
  buildTokenMap,
  u8ToBase64,
  type Layout,
} from "../utils/certificados";

/* =================== Tipos =================== */
type TipoPlantilla = "Coordinador" | "Asesor" | "Integrante" | "Equipo";
type Concurso = { id: string; nombre: string; categoria?: string; lugar?: string };
type Plantilla = {
  id: string;
  nombre: string;
  tipo: TipoPlantilla;
  concursoId: string;
  actualizadoEn: string;
  layout: Layout;
  pdfUrl?: string;
};
type Participante = {
  id: string;
  nombre: string;
  email?: string;
  equipo?: string;
  puesto?: string; // "Líder" | "Integrante" | "Asesor" | "Coordinador" | ...
};

type EstadoCorreo = "en-cola" | "enviado" | "error";
type LogCorreo = {
  id: string;
  timestamp: string;
  destinatario: string;
  email?: string;
  plantillaId: string;
  plantillaNombre: string;
  concursoId: string;
  estado: EstadoCorreo;
  errorMsg?: string;
  payload: {
    destinatario: {
      nombre: string;
      email?: string;
      equipo?: string;
      puesto?: string;
    };
  };
};

/* =================== Helpers =================== */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const sanitize = (s: string) => (s || "").replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
const nombreConcurso = (id: string, lista: Concurso[]) => lista.find((c) => c.id === id)?.nombre ?? "—";

// Base de API: si no hay VITE_API_URL, usa el origen actual (mismo dominio)
const RUNTIME_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const API_BASE = ((import.meta.env.VITE_API_URL as string) || RUNTIME_ORIGIN).replace(/\/+$/, "");
const api = (p: string) => `${API_BASE}${p.startsWith("/") ? "" : "/"}${p}`;

const isValidPerson = (raw?: string) => {
  const s = (raw || "").toString().trim();
  if (!s) return false;
  const bad = /^(?:n\/?a|na|ningun[oa]?|no\s+aplica|noaplica|s\/?d|-|—|\.|ninguno|ninguna)$/i;
  if (bad.test(s)) return false;
  if (!/[a-záéíóúüñ]/i.test(s)) return false;
  return true;
};

const normalizeEmail = (s?: string) => {
  const v = (s || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
};

// Busca el primer email válido en un objeto arbitrario (recursivo)
const deepEmailScan = (obj: any): string => {
  if (!obj || typeof obj !== "object") return "";
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      const ok = normalizeEmail(v);
      if (ok) return ok;
    } else if (v && typeof v === "object") {
      const hit = deepEmailScan(v);
      if (hit) return hit;
    }
  }
  return "";
};

// Toma el primer email válido dentro de un set de claves conocidas
const pickFirstEmail = (obj: any, keys: string[]) => {
  for (const k of keys) {
    const e = normalizeEmail(obj?.[k]);
    if (e) return e;
  }
  return "";
};

// Obtiene email de equipo desde un documento de respuesta (varios posibles nombres)
// Obtiene email de equipo desde un documento de respuesta (robusto y simple)
const getTeamEmailFromResponse = (data: any, preset: any, custom: any): string => {
  const roots = [preset || {}, data || {}, custom || {}];

  // 1) Campos directos en el documento (incluimos contactoEquipo como string)
  for (const obj of roots) {
    const e =
      pickFirstEmail(obj, [
        "contactoEquipo",          // <— AHORA SOPORTADO COMO STRING
        "emailEquipo",
        "correoEquipo",
        "equipoEmail",
        "emailTeam",
        "correo_del_equipo",
      ]);
    if (e) return e;
  }

  // 2) Si contactoEquipo es un objeto { correo|email|mail }
  for (const obj of roots) {
    const ce = obj.contactoEquipo;
    if (ce && typeof ce === "object") {
      const e = pickFirstEmail(ce, ["correo", "email", "mail"]);
      if (e) return e;
    }
  }

  // 3) Último recurso: escaneo profundo dentro de contactoEquipo
  for (const obj of roots) {
    const e = deepEmailScan(obj.contactoEquipo);
    if (e) return e;
  }

  return "";
};


/* =================== Página =================== */
export default function Constancias() {
  const [search] = useSearchParams();

  /* ----- Estado principal ----- */
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [concursoId, setConcursoId] = useState<string>(""); // vacío = ninguno
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [plantillaId, setPlantillaId] = useState<string>("");

  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  // map "nombreEquipo" -> "correoEquipo"
  const [teamEmailByName, setTeamEmailByName] = useState<Record<string, string>>({});

  // Filtros secundarios
  const [busq, setBusq] = useState("");
  const [fEquipo, setFEquipo] = useState<string>("Todos");
  const [fRol, setFRol] = useState<"Todos" | "Líder" | "Integrante" | "Asesor" | "Coordinador">("Todos");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const [correoLogs, setCorreoLogs] = useState<LogCorreo[]>([]);

  const [emailCfg, setEmailCfg] = useState(() => ({
    fromName: localStorage.getItem("mail.fromName") ?? "Constancias ISC-ITSPP",
    fromEmail: localStorage.getItem("mail.fromEmail") ?? "",
    subjectTpl: localStorage.getItem("mail.subjectTpl") ?? "Constancia - {{CONCURSO}} - {{NOMBRE}}",
    bodyTpl:
      localStorage.getItem("mail.bodyTpl") ??
      "Hola {{NOMBRE}},\n\nAdjuntamos tu constancia del {{CONCURSO}}.\n\n¡Gracias por tu participación!",
  }));

  // refs para insertar tokens en caret
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /* ----- Arranque: leer ?concursoId= si viene ----- */
  useEffect(() => {
    const cid = (search.get("concursoId") || "").trim();
    if (cid) setConcursoId(cid);
  }, [search]);

  /* ----- Concursos (siempre) ----- */
  useEffect(() => {
    const qCursos = query(collection(db, "Cursos"));
    const unsub = onSnapshot(qCursos, (snap) => {
      const rows: Concurso[] = snap.docs.map((d) => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          nombre: (data.nombre || data.titulo || d.id) as string,
          categoria: data.categoria || data.categoría || undefined,
          lugar: data.lugar || undefined,
        };
      });
      setConcursos(rows);
    });
    return () => unsub();
  }, []);

  /* ----- Plantillas: sólo cuando hay concurso seleccionado ----- */
  useEffect(() => {
    setPlantillas([]);
    setPlantillaId("");
    if (!concursoId) return;

    const qPlant = query(collection(db, "Plantillas"), where("concursoId", "==", concursoId));
    const unsub = onSnapshot(qPlant, (snap) => {
      const rows: Plantilla[] = snap.docs
        .map((d) => {
          const data: any = d.data() || {};
          const ts =
            data.actualizadoEn?.toDate
              ? (data.actualizadoEn as Timestamp).toDate().toISOString()
              : (data.actualizadoEn ?? new Date().toISOString());
          return {
            id: d.id,
            nombre: data.nombre ?? d.id,
            tipo: data.tipo as TipoPlantilla,
            concursoId: data.concursoId as string,
            actualizadoEn: ts,
            layout: data.layout as Layout,
            pdfUrl: data.pdfUrl ?? undefined,
          };
        })
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
      setPlantillas(rows);
      setPlantillaId(rows[0]?.id ?? "");
    });

    return () => unsub();
  }, [concursoId]);

  const plantilla = plantillas.find((p) => p.id === plantillaId);
  const concursoSel = concursos.find((c) => c.id === concursoId);

  /* ----- Participantes + correos de equipo del concurso seleccionado ----- */
  useEffect(() => {
    setParticipantes([]);
    setSel({});
    setTeamEmailByName({});
    setFEquipo("Todos");
    setFRol("Todos");
    setBusq("");
    if (!concursoId) return;

    (async () => {
      try {
        const todos: Participante[] = [];
        const teamMap: Record<string, string> = {};

        // 1) Participantes desde encuestas
        const encuestasRef = collection(db, "encuestas");
        const qEnc = query(encuestasRef, where("cursoId", "==", concursoId));
        const encuestasSnap = await getDocs(qEnc);

        for (const enc of encuestasSnap.docs) {
          const rRef = collection(enc.ref, "respuestas");
          const rSnap = await getDocs(rRef);

          rSnap.forEach((doc) => {
            const data: any = doc.data() || {};
            const preset = (data.preset || {}) as any;
            const custom = (data.custom || {}) as any;

            const equipo = (preset.nombreEquipo || data.nombreEquipo || "").toString().trim();
            const lider = (preset.nombreLider || data.nombreLider || "").toString().trim();
            const integrantesArr: string[] = Array.isArray(preset.integrantes)
              ? preset.integrantes
              : Array.isArray(data.integrantes)
              ? data.integrantes
              : [];

            // --- NUEVO: obtener correo de equipo robusto ---
            const teamEmail = getTeamEmailFromResponse(data, preset, custom);
            if (equipo && teamEmail && !teamMap[equipo]) teamMap[equipo] = teamEmail;

            const asesor =
              data.maestroAsesor ||
              preset.maestroAsesor ||
              custom.maestroAsesor ||
              custom.asesor ||
              (typeof custom.p1 === "string" && /asesor/i.test(custom.p1) ? custom.p1 : "");

            if (isValidPerson(lider)) {
              todos.push({
                id: `${doc.id}-lider`,
                nombre: lider,
                email: normalizeEmail(data.emailLider || data.correo) || "",
                equipo,
                puesto: "Líder",
              });
            }

            for (const raw of integrantesArr) {
              const n = String(raw || "").trim();
              if (!isValidPerson(n)) continue;
              todos.push({
                id: `${doc.id}-int-${n}-${uid()}`,
                nombre: n,
                email: "", // usualmente no se captura email individual
                equipo,
                puesto: "Integrante",
              });
            }

            if (isValidPerson(asesor)) {
              todos.push({
                id: `${doc.id}-asesor`,
                nombre: asesor,
                email: normalizeEmail(data.emailAsesor) || "",
                equipo,
                puesto: "Asesor",
              });
            }
          });
        }

        // 2) Coordinadores desde colección "coordinadores" (por cursoId)
        const coordRef = collection(db, "coordinadores");
        const qCoord = query(coordRef, where("cursoId", "==", concursoId));
        const coordSnap = await getDocs(qCoord);
        coordSnap.forEach((doc) => {
          const data: any = doc.data() || {};
          const nombre = data.nombre || data.Nombres || "";
          if (!isValidPerson(nombre)) return;
          todos.push({
            id: `coord-${doc.id}`,
            nombre,
            email: normalizeEmail(data.email || data.correo) || "",
            equipo: "", // no aplica
            puesto: "Coordinador",
          });
        });

        // normalizar y ordenar
        const unique = new Map<string, Participante>();
        for (const p of todos) {
          const key = `${(p.nombre || "").trim().toLowerCase()}|${(p.equipo || "").trim().toLowerCase()}|${p.puesto}`;
          if (!unique.has(key)) unique.set(key, p);
        }

        setParticipantes(
          Array.from(unique.values()).sort((a, b) => {
            const ae = a.equipo || "";
            const be = b.equipo || "";
            return (
              ae.localeCompare(be) ||
              (a.puesto || "").localeCompare(b.puesto || "") ||
              a.nombre.localeCompare(b.nombre)
            );
          })
        );
        setTeamEmailByName(teamMap);
      } catch (e) {
        console.error("Error leyendo participantes:", e);
        setParticipantes([]);
        setTeamEmailByName({});
      }
    })();
  }, [concursoId]);

  /* ----- Derivados UI ----- */
  const equiposDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const p of participantes) if (p.equipo && p.equipo.trim()) set.add(p.equipo.trim());
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [participantes]);

  const pickTeamEmailFor = (p: Participante) => {
    const key = (p.equipo || "").trim();
    return key ? normalizeEmail(teamEmailByName[key]) : "";
  };

  const emailDestinoParaMostrar = (p: Participante) => {
    const preferTeam = p.puesto === "Integrante" || p.puesto === "Líder";
    const te = pickTeamEmailFor(p);
    if (preferTeam && te) return `${te} (equipo)`;
    return p.email || te || "—";
  };

  const participantesFiltrados = useMemo(() => {
    let arr = participantes;

    if (fEquipo !== "Todos") arr = arr.filter((p) => (p.equipo || "") === fEquipo);
    if (fRol !== "Todos") arr = arr.filter((p) => (p.puesto || "") === fRol);

    const term = busq.trim().toLowerCase();
    if (term) {
      arr = arr.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(term) ||
          (p.equipo || "").toLowerCase().includes(term) ||
          (p.puesto || "").toLowerCase().includes(term) ||
          emailDestinoParaMostrar(p).toLowerCase().includes(term)
      );
    }
    return arr;
  }, [participantes, fEquipo, fRol, busq, teamEmailByName]);

  const seleccionados = participantesFiltrados.filter((p) => sel[p.id]);
  const tieneAlgoSeleccionado = seleccionados.length > 0;

  const varsPorTipo: Record<TipoPlantilla, string[]> = {
    Coordinador: ["{{NOMBRE}}", "{{CARGO}}", "{{CONCURSO}}", "{{FECHA}}", "{{MENSAJE}}"],
    Asesor: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{FECHA}}", "{{MENSAJE}}"],
    Integrante: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{FECHA}}", "{{MENSAJE}}"],
    Equipo: ["{{NOMBRE_EQUIPO}}", "{{CONCURSO}}", "{{CATEGORIA}}", "{{LUGAR}}", "{{FECHA}}", "{{MENSAJE}}"],
  };

  const tokensDisponibles = useMemo<string[]>(() => {
    if (!plantilla) return ["{{NOMBRE}}", "{{CONCURSO}}", "{{FECHA}}"];
    return varsPorTipo[plantilla.tipo];
  }, [plantilla]);

  const persistEmailCfg = () => {
    localStorage.setItem("mail.fromName", emailCfg.fromName);
    localStorage.setItem("mail.fromEmail", emailCfg.fromEmail);
    localStorage.setItem("mail.subjectTpl", emailCfg.subjectTpl);
    localStorage.setItem("mail.bodyTpl", emailCfg.bodyTpl);
  };

  /* ======= Drag & Drop de tokens ======= */
  const tokenDragStart = (t: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", t);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.dropEffect = "copy";
  };

  const dropInto =
    (field: "subjectTpl" | "bodyTpl") =>
    (e: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.preventDefault();
      const token = e.dataTransfer.getData("text/plain");
      if (!token) return;

      const target = e.currentTarget;
      const start = (target as any).selectionStart ?? 0;
      const end = (target as any).selectionEnd ?? start;

      setEmailCfg((prev) => {
        const curr = prev[field] as string;
        const next = curr.slice(0, start) + token + curr.slice(end);
        return { ...prev, [field]: next };
      });

      // restaurar caret después de actualizar estado
      requestAnimationFrame(() => {
        const pos = start + token.length;
        target.focus();
        try {
          (target as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(pos, pos);
        } catch {}
      });
    };

  /* =================== Acciones =================== */
  const preview = async () => {
    if (!plantilla || !concursoSel) return alert("Selecciona concurso y plantilla.");
    const base = seleccionados[0] || participantesFiltrados[0] || participantes[0];
    if (!base) return alert("No hay integrantes para previsualizar.");

    try {
      const destinatario =
        plantilla.tipo === "Equipo"
          ? { nombre: base.equipo || "", equipo: base.equipo || "" }
          : { nombre: base.nombre, equipo: base.equipo, puesto: base.puesto, email: base.email };

      const bytes = await renderCertToPdfBytes({
        plantilla,
        concurso: concursoSel,
        destinatario,
      });
      const url = URL.createObjectURL(bytesToPdfBlob(bytes));
      setPreviewUrl(url);
    } catch (e: any) {
      console.error(e);
      alert("Error generando previsualización: " + e.message);
    }
  };

  const descargarSeleccionados = async () => {
    if (!plantilla || !concursoSel) return alert("Selecciona concurso y plantilla.");
    if (!tieneAlgoSeleccionado) return alert("Selecciona al menos un integrante.");

    try {
      const files: { filename: string; bytes: Uint8Array }[] = [];

      if (plantilla.tipo === "Equipo") {
        const equipos = Array.from(new Set(seleccionados.map((p) => p.equipo || "").filter(Boolean)));
        if (equipos.length === 0) return alert("No se detectaron equipos en la selección.");
        for (const eq of equipos) {
          // eslint-disable-next-line no-await-in-loop
          const bytes = await renderCertToPdfBytes({
            plantilla,
            concurso: concursoSel,
            destinatario: { nombre: eq, equipo: eq },
          });
          files.push({ filename: `${sanitize(plantilla.nombre)}_${sanitize(eq)}.pdf`, bytes });
        }
      } else {
        for (const p of seleccionados) {
          // eslint-disable-next-line no-await-in-loop
          const bytes = await renderCertToPdfBytes({
            plantilla,
            concurso: concursoSel,
            destinatario: { nombre: p.nombre, email: p.email, equipo: p.equipo, puesto: p.puesto },
          });
          files.push({ filename: `${sanitize(plantilla.nombre)}_${sanitize(p.nombre)}.pdf`, bytes });
        }
      }

      if (files.length === 1) {
        downloadBlob(bytesToPdfBlob(files[0].bytes), files[0].filename);
      } else {
        const zipBytes = await zipMany(files);
        downloadBlob(bytesToZipBlob(zipBytes), `${sanitize(plantilla.nombre)}.zip`);
      }
    } catch (e: any) {
      console.error(e);
      alert("Error al descargar: " + e.message);
    }
  };

  const enviarSeleccionados = async () => {
    if (!plantilla || !concursoSel) return alert("Selecciona concurso y plantilla.");
    if (!tieneAlgoSeleccionado) return alert("Selecciona al menos un integrante.");

    setConfirmSendOpen(false);
    for (const p of seleccionados) {
      // eslint-disable-next-line no-await-in-loop
      await enviarUno(p);
    }
  };

  const enviarUno = async (p: Participante) => {
    try {
      if (!plantilla) throw new Error("Plantilla no disponible");

      // Preferencias de email:
      // - Integrante/Líder → email de equipo si existe; si no, personal.
      // - Otros roles → personal; si no, email de equipo.
      const preferTeam = p.puesto === "Integrante" || p.puesto === "Líder";
      const teamEmail = pickTeamEmailFor(p);
      const toEmail = preferTeam ? (teamEmail || p.email || "") : (p.email || teamEmail || "");

      if (!toEmail) throw new Error("No hay email del equipo ni personal para el destinatario");

      const dest = { nombre: p.nombre, email: toEmail, equipo: p.equipo, puesto: p.puesto };
      const tokens = buildTokenMap({ plantilla, concurso: concursoSel, destinatario: dest });
      const subject = Object.entries(tokens).reduce((acc, [k, v]) => acc.replaceAll(k, v ?? ""), emailCfg.subjectTpl ?? "");
      const body = Object.entries(tokens).reduce((acc, [k, v]) => acc.replaceAll(k, v ?? ""), emailCfg.bodyTpl ?? "");

      const bytes = await renderCertToPdfBytes({ plantilla, concurso: concursoSel, destinatario: dest });
      const b64 = u8ToBase64(bytes);

      const r = await fetch(api("/EnviarCorreo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Correo: toEmail,
          Nombres: p.nombre,
          Puesto: p.puesto || "",
          pdf: b64,
          mensajeCorreo: body,
          Asunto: subject,
          FromEmail: emailCfg.fromEmail || undefined,
          FromName: emailCfg.fromName || undefined,
        }),
      });
      const data = await r.json();
      const ok = r.ok;

      setCorreoLogs((prev) => [
        {
          id: uid(),
          timestamp: new Date().toISOString(),
          destinatario: p.nombre,
          email: toEmail,
          plantillaId: plantilla.id,
          plantillaNombre: plantilla.nombre,
          concursoId: concursoSel?.id || "",
          estado: ok ? "enviado" : "error",
          errorMsg: ok ? undefined : data?.detail || data?.error || "Error al enviar correo",
          payload: { destinatario: dest },
        },
        ...prev,
      ]);

      if (!ok) throw new Error(data?.detail || data?.error || "Error al enviar correo");
    } catch (e: any) {
      setCorreoLogs((prev) => [
        {
          id: uid(),
          timestamp: new Date().toISOString(),
          destinatario: p.nombre,
          email: p.email,
          plantillaId: plantilla?.id || "",
          plantillaNombre: plantilla?.nombre || "",
          concursoId: concursoSel?.id || "",
          estado: "error",
          errorMsg: e.message,
          payload: { destinatario: { nombre: p.nombre, email: p.email, equipo: p.equipo, puesto: p.puesto } },
        },
        ...prev,
      ]);
    }
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) return setSel({});
    const map: Record<string, boolean> = {};
    for (const p of participantesFiltrados) map[p.id] = true;
    setSel(map);
  };

  /* =================== UI =================== */
  return (
    <section className="space-y-5">
      {/* HERO */}
      <div className="rounded-2xl bg-gradient-to-r from-[#143d6e] to-[#143563] text-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Constancias</h1>
            <p className="text-sm opacity-90">
              Selecciona una plantilla, elige integrantes del concurso y genera/manda constancias.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full bg-white/5 hover:bg-white/10 border-white/60 text-white"
              onClick={() => setHistOpen(true)}
            >
              Historial de correos
            </Button>
            <Button
              variant="outline"
              className="rounded-full bg-white/5 hover:bg-white/10 border-white/60 text-white"
              onClick={preview}
              disabled={!concursoId || !plantillaId || participantes.length === 0}
            >
              Previsualizar
            </Button>
            <Button
              variant="outline"
              className="rounded-full bg-white/5 hover:bg-white/10 border-white/60 text-white"
              onClick={descargarSeleccionados}
              disabled={!concursoId || !plantillaId || !tieneAlgoSeleccionado}
            >
              Descargar
            </Button>
            <Button
              className="rounded-full bg-white text-[#0b2b55] hover:bg-white/90"
              onClick={() => setConfirmSendOpen(true)}
              disabled={!concursoId || !plantillaId || !tieneAlgoSeleccionado}
            >
              Enviar
            </Button>
          </div>
        </div>
      </div>

      {/* FILTROS PRINCIPALES */}
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-gray-600">Concurso</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={concursoId}
              onChange={(e) => setConcursoId(e.target.value)}
            >
              <option value="">Selecciona…</option>
              {concursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Plantilla</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
              disabled={!concursoId || plantillas.length === 0}
            >
              {(!concursoId || plantillas.length === 0) && (
                <option value="">Selecciona un concurso primero…</option>
              )}
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {nombreConcurso(p.concursoId, concursos)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* FILTROS SECUNDARIOS + LISTA */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4 md:items-end">
          <div>
            <label className="text-xs text-gray-600">Equipo</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={fEquipo}
              onChange={(e) => setFEquipo(e.target.value)}
              disabled={!concursoId}
            >
              {equiposDisponibles.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Rol</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={fRol}
              onChange={(e) => setFRol(e.target.value as any)}
              disabled={!concursoId}
            >
              {["Todos", "Líder", "Integrante", "Asesor", "Coordinador"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Buscar</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nombre, equipo, rol o correo…"
              value={busq}
              onChange={(e) => setBusq(e.target.value)}
              disabled={!concursoId}
            />
          </div>
        </div>

        {!concursoId ? (
          <div className="p-6 text-sm text-gray-600">Selecciona un concurso para ver sus integrantes.</div>
        ) : participantesFiltrados.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">No hay integrantes que coincidan con los filtros.</div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-gray-600">
                Mostrando <strong>{participantesFiltrados.length}</strong>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700 inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={(e) => toggleAll(e.target.checked)}
                    checked={participantesFiltrados.every((p) => sel[p.id]) && participantesFiltrados.length > 0}
                  />
                  Seleccionar todo (según filtros)
                </label>
                <Button variant="outline" onClick={() => setSel({})}>
                  Limpiar
                </Button>
              </div>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3 w-10"></th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Equipo</th>
                    <th className="py-2 pr-3">Rol</th>
                    <th className="py-2 pr-3">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {participantesFiltrados.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!sel[p.id]}
                          onChange={(e) => setSel((s) => ({ ...s, [p.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="py-2 pr-3">{p.nombre}</td>
                      <td className="py-2 pr-3">{p.equipo || "—"}</td>
                      <td className="py-2 pr-3">{p.puesto || "—"}</td>
                      <td className="py-2 pr-3">{emailDestinoParaMostrar(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* CONFIG EMAIL (compacta) */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Configuración de correo</h3>
          <Button variant="outline" onClick={persistEmailCfg}>
            Guardar
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Puedes usar tokens (p. ej. <code>{"{{NOMBRE}}"}</code>, <code>{"{{CONCURSO}}"}</code>, <code>{"{{FECHA}}"}</code>).
          {" "}Arrástralos a los campos de Asunto o Mensaje.
        </p>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-gray-600">Remitente (Nombre)</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={emailCfg.fromName}
              onChange={(e) => setEmailCfg((v) => ({ ...v, fromName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Remitente (Correo)</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={emailCfg.fromEmail}
              onChange={(e) => setEmailCfg((v) => ({ ...v, fromEmail: e.target.value }))}
              placeholder="remitente@tu-dominio.com"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Asunto</label>
            <input
              ref={subjectRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropInto("subjectTpl")}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={emailCfg.subjectTpl}
              onChange={(e) => setEmailCfg((v) => ({ ...v, subjectTpl: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Mensaje</label>
            <textarea
              ref={bodyRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropInto("bodyTpl")}
              rows={4}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={emailCfg.bodyTpl}
              onChange={(e) => setEmailCfg((v) => ({ ...v, bodyTpl: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      {/* Modal preview */}
      <AnimatePresence>
        {previewUrl && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                URL.revokeObjectURL(previewUrl!);
                setPreviewUrl(null);
              }}
            />
            <motion.div
              className="fixed inset-0 z-[71] grid place-items-center p-4"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
            >
              <Card className="w-full max-w-5xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">Previsualización</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      URL.revokeObjectURL(previewUrl!);
                      setPreviewUrl(null);
                    }}
                  >
                    Cerrar
                  </Button>
                </div>
                <div className="aspect-[1.414/1] w-full">
                  <embed
                    src={`${previewUrl}#page=1&view=fit&toolbar=1`}
                    type="application/pdf"
                    className="w-full h-[75vh] rounded-xl"
                  />
                </div>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal confirmar envío */}
      <AnimatePresence>
        {confirmSendOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmSendOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-[71] grid place-items-center p-4"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
            >
              <Card className="w-full max-w-md p-4">
                <h3 className="text-base font-semibold">Enviar correos</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Se enviarán {seleccionados.length} correos a los seleccionados con la configuración actual.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirmSendOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={enviarSeleccionados}>Enviar ahora</Button>
                </div>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal historial de correos */}
      <AnimatePresence>
        {histOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-[71] grid place-items-center p-4"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
            >
              <Card className="w-full max-w-3xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Historial de correos</h3>
                  <Button variant="outline" size="sm" onClick={() => setHistOpen(false)}>
                    Cerrar
                  </Button>
                </div>
                {correoLogs.length === 0 ? (
                  <div className="p-6 text-sm text-gray-600">Aún no hay registros de envío.</div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {correoLogs.map((log) => (
                      <Card key={log.id} className="p-3 border border-gray-100">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{log.destinatario}</p>
                            <p className="text-sm text-gray-600 truncate">
                              {log.plantillaNombre} · {nombreConcurso(log.concursoId, concursos)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(log.timestamp).toLocaleString("es-MX")}
                            </p>
                            {log.estado === "error" && (
                              <p className="text-xs text-red-600 mt-1">
                                Error: {log.errorMsg ?? "desconocido"}
                              </p>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              log.estado === "enviado"
                                ? "bg-green-100 text-green-700"
                                : log.estado === "en-cola"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {log.estado === "enviado" ? "Enviado" : log.estado === "en-cola" ? "En cola" : "Error"}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pie */}
      <div className="flex justify-end">
        <Link to="/concursos" className="text-sm text-tecnm-azul hover:underline">
          Ir a Concursos
        </Link>
      </div>
    </section>
  );
}
