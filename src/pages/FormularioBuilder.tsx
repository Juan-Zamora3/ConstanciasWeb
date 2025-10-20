// src/pages/FormularioBuilder.tsx
import React, { useEffect, useMemo, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"

// API compat centralizada
// (Asegúrate que el archivo se llama exactamente 'useSurveys.ts')
import { useSurveys, getById } from "../servicios/UseSurveys"

/* ========= Tipos ========= */
type CampoPresetFlags = {
  nombreEquipo?: boolean
  nombreLider?: boolean
  contactoEquipo?: boolean
  categoria?: boolean
}

type TipoPregunta = "texto" | "select" | "radio" | "checkbox"

type Pregunta = {
  id: string // p1, p2, ...
  titulo: string
  tipo: TipoPregunta
  opciones?: string[]
  requerido?: boolean
}

type Apariencia = {
  colorTitulo?: string
  colorTexto?: string
  colorFondo?: string
  overlay?: number
  bgImageUrl?: string
}

type EncuestaDoc = {
  cursoId?: string
  tituloCurso?: string
  descripcionCurso?: string
  camposPreestablecidos?: CampoPresetFlags
  categorias?: string[]
  cantidadParticipantes?: number
  preguntas?: Pregunta[]
  apariencia?: Apariencia
}

/* ========= Helpers ========= */
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const nextId = (list: Pregunta[]) => {
  const nums = list
    .map((q) => Number(String(q.id).replace(/^p/, "")))
    .filter((n) => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `p${max + 1}`
}

/* ====== Estilos (mismos que Concursos) ====== */
const neoSurface = [
  "relative rounded-xl3",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-[0_16px_40px_rgba(2,6,23,0.08),0_2px_4px_rgba(2,6,23,0.05)]",
  "before:content-[''] before:absolute before:inset-0 before:rounded-xl3",
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-10px_26px_rgba(2,6,23,0.06)]",
  "before:pointer-events-none",
].join(" ")

const neoInset = [
  "rounded-xl",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-inner shadow-black/10",
].join(" ")

const pill = [
  "relative",
  "rounded-full",
  "bg-white",
  "border border-white/60",
  "shadow-[0_8px_24px_rgba(2,6,23,0.06)]",
  "before:content-[''] before:absolute before:inset-px before:rounded-full",
  "before:pointer-events-none",
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
].join(" ")

/* ========= Builder ========= */
export default function FormularioBuilder() {
  const { encuestaId } = useParams<{ encuestaId: string }>()
  const navigate = useNavigate()
  const { updateSurvey, updateSurveyTheme, loading } = useSurveys()

  const [initialLoaded, setInitialLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Link público
  const [publicLink, setPublicLink] = useState("")

  // Estado
  const [presets, setPresets] = useState<CampoPresetFlags>({
    nombreEquipo: true,
    nombreLider: true,
    contactoEquipo: true,
    categoria: true,
  })
  const [categorias, setCategorias] = useState<string[]>(["Opción 1"])
  const [nuevoCat, setNuevoCat] = useState("")
  const [cantidadParticipantes, setCantidadParticipantes] = useState<number>(4)

  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [apariencia, setApariencia] = useState<Apariencia>({
    colorTitulo: "#0f172a",
    colorTexto: "#0f172a",
    colorFondo: "#ffffff",
    overlay: 0.35,
    bgImageUrl: "",
  })

  // UI crear pregunta rápida
  const [npTitulo, setNpTitulo] = useState("")
  const [npTipo, setNpTipo] = useState<TipoPregunta>("texto")
  const [npReq, setNpReq] = useState(false)
  const [npOpciones, setNpOpciones] = useState<string[]>([""])

  /* ----- Link por ID ----- */
  useEffect(() => {
    if (!encuestaId) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    setPublicLink(`${origin}/formulario-publico/${encuestaId}`)
  }, [encuestaId])

  const copyLink = async () => {
    if (!publicLink) return
    try {
      await navigator.clipboard.writeText(publicLink)
      alert("Link copiado.")
    } catch {}
  }

  /* ----- Cargar encuesta ----- */
  useEffect(() => {
    const run = async () => {
      try {
        if (!encuestaId) {
          setError("Falta encuestaId en la URL.")
          setInitialLoaded(true)
          return
        }

        const doc = (await getById(encuestaId)) as any
        if (!doc) {
          setError("No se encontró la encuesta.")
          setInitialLoaded(true)
          return
        }

        const data = doc as EncuestaDoc & any

        // leer compat y nuevo indistintamente
        const campos = data.camposPreestablecidos || data.camposPreestablecidos || {}
        const cats: string[] =
          Array.isArray(data.categorias)
            ? data.categorias
            : Array.isArray(data.formularioGrupos?.categorias)
            ? data.formularioGrupos.categorias
            : ["Opción 1"]

        const cant =
          typeof data.cantidadParticipantes === "number"
            ? data.cantidadParticipantes
            : typeof data.formularioGrupos?.cantidadParticipantes === "number"
            ? data.formularioGrupos.cantidadParticipantes
            : 4

        const qs: Pregunta[] = Array.isArray(data.preguntas)
          ? data.preguntas
          : Array.isArray(data.preguntasPersonalizadas)
          ? data.preguntasPersonalizadas.map((x: any) => ({
              id: x.id,
              titulo: x.etiqueta,
              tipo: (x.tipo === "text" ? "texto" : x.tipo) as TipoPregunta,
              opciones: x.opciones || [],
              requerido: !!(x.requerida || x.requerido),
            }))
          : []

        const ap: Apariencia = {
          colorTitulo: data.apariencia?.colorTitulo ?? "#0f172a",
          colorTexto: data.apariencia?.colorTexto ?? "#0f172a",
          colorFondo: data.apariencia?.colorFondo ?? "#ffffff",
          overlay:
            typeof data.apariencia?.overlay === "number"
              ? data.apariencia.overlay
              : 0.35,
          bgImageUrl: data.apariencia?.bgImageUrl ?? data.theme?.backgroundImage ?? "",
        }

        setPresets({
          nombreEquipo: !!campos.nombreEquipo,
          nombreLider: !!campos.nombreLider,
          contactoEquipo: !!campos.contactoEquipo,
          categoria: !!campos.categoria,
        })
        setCategorias(cats.length ? cats : ["Opción 1"])
        setCantidadParticipantes(cant)
        setPreguntas(qs)
        setApariencia(ap)
        setInitialLoaded(true)
      } catch (e) {
        console.error(e)
        setError("No fue posible cargar la configuración.")
        setInitialLoaded(true)
      }
    }
    run()
  }, [encuestaId])

  /* ----- Guardar (usa useSurveys) ----- */
  const guardar = async () => {
    if (!encuestaId) return
    try {
      setSaving(true)

      const cleanPreguntas: Pregunta[] = preguntas.map((p) => ({
        id: p.id,
        titulo: p.titulo.trim(),
        tipo: p.tipo,
        requerido: !!p.requerido,
        ...(p.tipo === "texto"
          ? {}
          : { opciones: (p.opciones || []).map((o) => o.trim()).filter(Boolean) }),
      }))

      // 1) guarda campos principales (y compat se hace dentro de updateSurvey)
      await updateSurvey(encuestaId, {
        camposPreestablecidos: {
          nombreEquipo: !!presets.nombreEquipo,
          nombreLider: !!presets.nombreLider,
          contactoEquipo: !!presets.contactoEquipo,
          categoria: !!presets.categoria,
        },
        categorias: categorias.map((c) => c.trim()).filter(Boolean),
        cantidadParticipantes: clamp(Number(cantidadParticipantes), 1, 15),
        preguntas: cleanPreguntas,
        apariencia: {
          colorTitulo: apariencia.colorTitulo,
          colorTexto: apariencia.colorTexto,
          colorFondo: apariencia.colorFondo,
          overlay: clamp(Number(apariencia.overlay ?? 0.35), 0, 1),
          bgImageUrl: apariencia.bgImageUrl || "",
        },
      })

      // 2) espejo en theme (compat viejo)
      await updateSurveyTheme(
        encuestaId,
        {
          backgroundColor: apariencia.colorFondo,
          titleColor: apariencia.colorTitulo,
          textColor: apariencia.colorTexto,
          overlayOpacity: clamp(Number(apariencia.overlay ?? 0.35), 0, 1),
        },
        {
          bgDataUrl: apariencia.bgImageUrl || undefined,
        }
      )

      // redirige a Concursos
      navigate("/concursos")
    } catch (e) {
      console.error(e)
      alert("No se pudo guardar. Revisa la consola.")
    } finally {
      setSaving(false)
    }
  }

  /* ----- Imagen de fondo (DataURL, compat con useSurveys.updateSurveyTheme) ----- */
  const onBgFile = async (file: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || "")
      setApariencia((a) => ({ ...a, bgImageUrl: dataUrl }))
    }
    reader.readAsDataURL(file)
  }
  const quitarBg = () => {
    setApariencia((a) => ({ ...a, bgImageUrl: "" }))
  }

  /* ----- Categorías ----- */
  const addCat = () => {
    const s = nuevoCat.trim()
    if (!s) return
    if (categorias.includes(s)) return
    setCategorias((prev) => [...prev, s])
    setNuevoCat("")
  }
  const setCat = (i: number, v: string) =>
    setCategorias((prev) => prev.map((c, j) => (j === i ? v : c)))
  const delCat = (i: number) =>
    setCategorias((prev) => prev.filter((_, j) => j !== i))

  /* ----- Preguntas: crear / editar / eliminar ----- */
  const resetNueva = () => {
    setNpTitulo("")
    setNpTipo("texto")
    setNpReq(false)
    setNpOpciones([""])
  }
  const addPregunta = () => {
    const titulo = npTitulo.trim()
    if (!titulo) return
    const id = nextId(preguntas)
    const nueva: Pregunta = {
      id,
      titulo,
      tipo: npTipo,
      requerido: npReq,
      ...(npTipo === "texto"
        ? {}
        : { opciones: npOpciones.map((o) => o.trim()).filter(Boolean) }),
    }
    setPreguntas((prev) => [...prev, nueva])
    resetNueva()
  }

  const setPregunta = (id: string, patch: Partial<Pregunta>) =>
    setPreguntas((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const delPregunta = (id: string) =>
    setPreguntas((prev) => prev.filter((q) => q.id !== id))

  const upPregunta = (id: string) =>
    setPreguntas((prev) => {
      const i = prev.findIndex((q) => q.id === id)
      if (i <= 0) return prev
      const arr = [...prev]
      ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
      return arr
    })

  const downPregunta = (id: string) =>
    setPreguntas((prev) => {
      const i = prev.findIndex((q) => q.id === id)
      if (i < 0 || i >= prev.length - 1) return prev
      const arr = [...prev]
      ;[arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]
      return arr
    })

  const canAddMore = preguntas.length < 10

  /* ----- Vista previa header simple ----- */
  const headerStyle: React.CSSProperties = useMemo(
    () => ({
      backgroundColor: apariencia.colorFondo || "#fff",
      color: apariencia.colorTexto || "#0f172a",
      backgroundImage: apariencia.bgImageUrl
        ? `url(${apariencia.bgImageUrl})`
        : undefined,
      backgroundSize: "cover",
      backgroundPosition: "center",
      position: "relative",
    }),
    [apariencia]
  )

  if (!initialLoaded) {
    return (
      <section className="p-6">
        <Card className={`${neoInset} p-6`}>Cargando constructor…</Card>
      </section>
    )
  }
  if (error) {
    return (
      <section className="p-6">
        <Card className={`${neoInset} p-6 text-rose-600`}>{error}</Card>
      </section>
    )
  }

  return (
    <section className="space-y-5 p-4 md:p-6">
      {/* HERO (estilo Concursos/Constancias) */}
      <div className="rounded-2xl bg-gradient-to-r from-[#143d6e] to-[#143563] text-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Constructor de formulario</h1>
            <p className="text-sm opacity-90">Configura los campos, apariencia y categorías del registro público.</p>
          </div>

          {/* Acciones + Link público */}
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex items-center gap-2 flex-wrap">
              {encuestaId && (
                <Link to={`/formulario-publico/${encuestaId}`} target="_blank" className="order-2 md:order-none">
                  <Button variant="outline" className="rounded-full bg-white/5 hover:bg-white/10 border-white/60 text-white">
                    Ver formulario público
                  </Button>
                </Link>
              )}
              <Button
                className="rounded-full bg-white text-[#0b2b55] hover:bg-white/90"
                onClick={guardar}
                disabled={saving || loading}
              >
                {saving ? "Guardando…" : "Guardar y volver"}
              </Button>
            </div>

            {/* Link público */}
            <div className="flex items-center gap-2 w-full md:w-[520px]">
              <input
                readOnly
                value={publicLink}
                placeholder="El link público aparecerá aquí…"
                className="flex-1 rounded-xl border border-white/40 bg-white/10 text-white/90 px-3 py-2 text-sm placeholder:text-white/60"
              />
              <Button variant="outline" className="rounded-full bg-white/5 hover:bg-white/10 border-white/60 text-white" onClick={copyLink} disabled={!publicLink}>
                Copiar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Apariencia */}
      <Card className={`p-4 space-y-4 border-0 ${neoSurface}`}>
        <h2 className="text-lg font-semibold">Apariencia de la pantalla</h2>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm text-slate-700">Color de fondo</label>
            <input
              type="color"
              value={apariencia.colorFondo || "#ffffff"}
              onChange={(e) =>
                setApariencia((a) => ({ ...a, colorFondo: e.target.value }))
              }
              className="h-10 w-24 rounded-lg border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-700">Imagen de fondo</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onBgFile(e.target.files[0])}
              />
              {apariencia.bgImageUrl && (
                <Button variant="outline" size="sm" onClick={quitarBg} className={`${pill} px-3`}>
                  Quitar
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-700">Color del título</label>
            <input
              type="color"
              value={apariencia.colorTitulo || "#0f172a"}
              onChange={(e) =>
                setApariencia((a) => ({ ...a, colorTitulo: e.target.value }))
              }
              className="h-10 w-24 rounded-lg border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-700">Color del texto</label>
            <input
              type="color"
              value={apariencia.colorTexto || "#0f172a"}
              onChange={(e) =>
                setApariencia((a) => ({ ...a, colorTexto: e.target.value }))
              }
              className="h-10 w-24 rounded-lg border"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm text-slate-700">Opacidad del overlay (0–1)</label>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={apariencia.overlay ?? 0.35}
              onChange={(e) =>
                setApariencia((a) => ({
                  ...a,
                  overlay: clamp(Number(e.target.value), 0, 1),
                }))
              }
              className="w-32 rounded-xl border px-3 py-2"
            />
          </div>
        </div>

        {/* Preview simple */}
        <div className="mt-2 rounded-xl border overflow-hidden">
          <div className="p-6" style={headerStyle}>
            {apariencia.overlay && apariencia.bgImageUrl && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `rgba(0,0,0,${apariencia.overlay})`,
                }}
              />
            )}
            <div className="relative">
              <h3
                className="text-2xl font-extrabold"
                style={{ color: apariencia.colorTitulo || "#0f172a" }}
              >
                Título de ejemplo
              </h3>
              <p>Texto de ejemplo del formulario</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Presets + Categorías */}
      <Card className={`p-4 space-y-4 border-0 ${neoSurface}`}>
        <h2 className="text-lg font-semibold">Configuración base</h2>

        <div className="grid md:grid-cols-2 gap-3">
          <div className={`${neoInset} p-3`}>
            <p className="text-sm font-medium">Campos preestablecidos</p>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!presets.nombreEquipo}
                  onChange={(e) =>
                    setPresets((p) => ({ ...p, nombreEquipo: e.target.checked }))
                  }
                />
                <span>Nombre del Equipo</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!presets.nombreLider}
                  onChange={(e) =>
                    setPresets((p) => ({ ...p, nombreLider: e.target.checked }))
                  }
                />
                <span>Nombre del Líder del Equipo</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!presets.contactoEquipo}
                  onChange={(e) =>
                    setPresets((p) => ({ ...p, contactoEquipo: e.target.checked }))
                  }
                />
                <span>Correo del Equipo</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!presets.categoria}
                  onChange={(e) =>
                    setPresets((p) => ({ ...p, categoria: e.target.checked }))
                  }
                />
                <span>Categoría</span>
              </label>
            </div>
          </div>

          <div className={`${neoInset} p-3`}>
            <p className="text-sm font-medium">Cantidad de participantes</p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCantidadParticipantes((n) => clamp(n - 1, 1, 15))
                }
                className={`${pill} px-3`}
              >
                –
              </Button>
              <input
                type="number"
                className="w-24 rounded-xl border px-3 py-2"
                min={1}
                max={15}
                value={cantidadParticipantes}
                onChange={(e) =>
                  setCantidadParticipantes(clamp(Number(e.target.value), 1, 15))
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCantidadParticipantes((n) => clamp(n + 1, 1, 15))
                }
                className={`${pill} px-3`}
              >
                +
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Se usará en el formulario público.
            </p>
          </div>
        </div>

        <div className={`${neoInset} p-3`}>
          <p className="text-sm font-medium">Categorías del concurso</p>
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            {categorias.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={c}
                  onChange={(e) => setCat(i, e.target.value)}
                  className="flex-1 rounded-xl border px-3 py-2"
                />
                <Button variant="outline" size="sm" onClick={() => delCat(i)} className={`${pill} px-3`}>
                  Eliminar
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input
              value={nuevoCat}
              onChange={(e) => setNuevoCat(e.target.value)}
              placeholder="Nueva categoría"
              className="rounded-xl border px-3 py-2"
            />
            <Button variant="outline" onClick={addCat} className={`${pill} px-3`}>
              + Agregar opción
            </Button>
          </div>
        </div>
      </Card>

      {/* Preguntas personalizadas */}
      <Card className={`p-4 space-y-4 border-0 ${neoSurface}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Preguntas Personalizadas</h2>
          <span className="text-sm text-slate-600">{preguntas.length}/10</span>
        </div>

        {/* Nueva pregunta */}
        <div className={`${neoInset} p-3 grid md:grid-cols-12 gap-2 items-end`}>
          <div className="md:col-span-5">
            <label className="text-xs text-slate-600">
              Título de la pregunta *
            </label>
            <input
              value={npTitulo}
              onChange={(e) => setNpTitulo(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Escribe tu pregunta…"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-slate-600">Tipo</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={npTipo}
              onChange={(e) => {
                const t = e.target.value as TipoPregunta
                setNpTipo(t)
                if (t === "texto") setNpOpciones([""])
              }}
            >
              <option value="texto">Respuesta Abierta</option>
              <option value="select">Lista Desplegable</option>
              <option value="radio">Opción Múltiple (Radio)</option>
              <option value="checkbox">Lista de Verificación (Checkbox)</option>
            </select>
          </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-600">Requerido</label>
              <div className="h-[42px] flex items-center">
                <input
                  type="checkbox"
                  checked={npReq}
                  onChange={(e) => setNpReq(e.target.checked)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <Button onClick={addPregunta} disabled={!canAddMore || !npTitulo.trim()} className={`${pill} px-4`}>
                Agregar
              </Button>
            </div>

          {(npTipo === "select" || npTipo === "radio" || npTipo === "checkbox") && (
            <div className="md:col-span-12">
              <div className="text-xs text-slate-600 mb-1">Opciones</div>
              <div className="grid md:grid-cols-2 gap-2">
                {npOpciones.map((op, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={op}
                      onChange={(e) =>
                        setNpOpciones((prev) =>
                          prev.map((x, j) => (j === i ? e.target.value : x))
                        )
                      }
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder={`Opción ${i + 1}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setNpOpciones((prev) => prev.filter((_, j) => j !== i))
                      }
                      className={`${pill} px-3`}
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNpOpciones((prev) => [...prev, ""])}
                  className={`${pill} px-3`}
                >
                  + Agregar opción
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Listado editable */}
        {preguntas.length === 0 ? (
          <Card className={`${neoInset} p-6 text-sm text-slate-600`}>
            Aún no has agregado preguntas.
          </Card>
        ) : (
          <div className="space-y-3">
            {preguntas.map((q, idx) => (
              <Card key={q.id} className={`p-3 border-0 ${neoSurface}`}>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 text-slate-700 font-semibold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      value={q.titulo}
                      onChange={(e) => setPregunta(q.id, { titulo: e.target.value })}
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={q.tipo}
                        onChange={(e) =>
                          setPregunta(q.id, {
                            tipo: e.target.value as TipoPregunta,
                            opciones:
                              (e.target.value as TipoPregunta) === "texto"
                                ? []
                                : q.opciones || [""],
                          })
                        }
                      >
                        <option value="texto">Respuesta Abierta</option>
                        <option value="select">Lista Desplegable</option>
                        <option value="radio">Opción Múltiple (Radio)</option>
                        <option value="checkbox">Lista de Verificación (Checkbox)</option>
                      </select>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!q.requerido}
                          onChange={(e) =>
                            setPregunta(q.id, { requerido: e.target.checked })
                          }
                        />
                        <span className="text-sm">Requerido</span>
                      </label>

                      <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => upPregunta(q.id)} className={`${pill} px-3`}>
                          ↑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downPregunta(q.id)} className={`${pill} px-3`}>
                          ↓
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => delPregunta(q.id)} className={`${pill} px-3`}>
                          Eliminar
                        </Button>
                      </div>
                    </div>

                    {q.tipo !== "texto" && (
                      <div className={`${neoInset} p-3 space-y-2`}>
                        <div className="text-xs text-slate-600">Opciones</div>
                        <div className="grid md:grid-cols-2 gap-2">
                          {(q.opciones || [""]).map((op, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                className="w-full rounded-xl border px-3 py-2"
                                value={op}
                                onChange={(e) =>
                                  setPregunta(q.id, {
                                    opciones: (q.opciones || []).map((x, j) =>
                                      j === i ? e.target.value : x
                                    ),
                                  })
                                }
                                placeholder={`Opción ${i + 1}`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPregunta(q.id, {
                                    opciones: (q.opciones || []).filter((_, j) => j !== i),
                                  })
                                }
                                className={`${pill} px-3`}
                              >
                                Quitar
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPregunta(q.id, { opciones: [...(q.opciones || []), ""] })
                          }
                          className={`${pill} px-3`}
                        >
                          + Agregar opción
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Footer acciones */}
      <div className="flex items-center justify-between">
        <Link to="/concursos" className="text-sm text-tecnm-azul hover:underline">
          Volver a Concursos
        </Link>
        <div className="flex gap-2">
          {encuestaId && (
            <Link to={`/formulario-publico/${encuestaId}`} target="_blank">
              <Button variant="outline" className={`${pill} px-4`}>
                Ver formulario público
              </Button>
            </Link>
          )}
          <Button onClick={guardar} disabled={saving || loading} className="rounded-full bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 text-white px-5">
            {saving ? "Guardando…" : "Guardar y volver"}
          </Button>
        </div>
      </div>
    </section>
  )
}
