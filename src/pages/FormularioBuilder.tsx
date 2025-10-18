import React, { useEffect, useMemo, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { db } from "../servicios/firebaseConfig"
import {
  doc as fsDoc, getDoc, updateDoc, onSnapshot
} from "firebase/firestore"
import Button from "../components/ui/Button"
import { Card } from "../components/ui/Card"

type Question = {
  id: string
  title: string
  type: "open" | "select" | "radio" | "checkbox"
  options?: string[]
  required?: boolean
}

export default function FormularioBuilder() {
  const { encuestaId } = useParams()
  const [data, setData] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!encuestaId) return
    const ref = fsDoc(db, "encuestas", encuestaId)
    const unsub = onSnapshot(ref, (d) => setData(d.data()))
    return () => unsub()
  }, [encuestaId])

  const addQuestion = (type: Question["type"]) => {
    const q: Question = { id: crypto.randomUUID(), title: "", type, options: type==="open"?[]:["Opción 1"], required:false }
    setData((prev:any) => ({...prev, customQuestions: [...(prev.customQuestions||[]), q]}))
  }

  const guardar = async () => {
    if (!encuestaId || !data) return
    setSaving(true)
    await updateDoc(fsDoc(db, "encuestas", encuestaId), data)
    setSaving(false)
  }

  if (!data) return <Card className="p-6">Cargando…</Card>

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Constructor de Formulario</h1>
        <div className="flex gap-2">
          <Link to={`/r/${encuestaId}`} target="_blank">
            <Button variant="outline">Abrir formulario público</Button>
          </Link>
          <Button variant="solid" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {/* Tipo de curso por grupos: categorías y #participantes */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Configuración del formulario de grupos</h2>

        {/* Campos preestablecidos */}
        <div>
          <p className="font-medium mb-2">Campos Preestablecidos</p>
          {["nombreEquipo","nombreLider","contactoEquipo","categoria"].map(k => (
            <label key={k} className="flex items-center gap-2 mb-1">
              <input
                type="checkbox"
                checked={!!data?.camposPreestablecidos?.[k]}
                onChange={e => setData((p:any)=>({
                  ...p, camposPreestablecidos: {...p.camposPreestablecidos, [k]: e.target.checked}
                }))}
              />
              <span className="capitalize">{k.replace(/([A-Z])/g," $1")}</span>
            </label>
          ))}
          <div className="mt-2">
            <label className="text-sm text-gray-600">Cantidad de Participantes</label>
            <input
              type="number" min={1}
              value={data?.camposPreestablecidos?.cantidadParticipantes || 4}
              onChange={(e)=>setData((p:any)=>({
                ...p, camposPreestablecidos: {...p.camposPreestablecidos, cantidadParticipantes: Number(e.target.value)}
              }))}
              className="ml-2 w-24 rounded-xl border px-3 py-1"
            />
          </div>
        </div>

        {/* Categorías */}
        <div className="pt-3">
          <p className="font-medium mb-1">Agregar categorías</p>
          {(data.categorias || []).map((cat:string, i:number) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={cat}
                onChange={e=>{
                  const arr=[...(data.categorias||[])]; arr[i]=e.target.value
                  setData((p:any)=>({...p, categorias: arr}))
                }}
                className="flex-1 rounded-xl border px-3 py-2"
              />
              <Button variant="outline" onClick={()=>{
                const arr=[...(data.categorias||[])]; arr.splice(i,1)
                setData((p:any)=>({...p, categorias: arr}))
              }}>Quitar</Button>
            </div>
          ))}
          <Button variant="outline" onClick={()=>{
            setData((p:any)=>({...p, categorias: [...(p.categorias||[]), ""]}))
          }}>+ Agregar opción</Button>
        </div>

        {/* Plantillas por categoría (solo nombre/ID – tú lo conectas a tus plantillas) */}
        <div className="pt-3">
          <p className="font-medium mb-1">Plantillas de constancia</p>
          {(data.categorias || []).map((cat:string) => (
            <div key={cat} className="flex items-center gap-3 mb-2">
              <div className="w-40 text-sm">{cat || "(sin nombre)"}</div>
              <input
                placeholder="Nombre/ID de plantilla…"
                value={data.plantillasPorCategoria?.[cat] || ""}
                onChange={e=>{
                  setData((p:any)=>({...p, plantillasPorCategoria: {...(p.plantillasPorCategoria||{}), [cat]: e.target.value}}))
                }}
                className="flex-1 rounded-xl border px-3 py-2"
              />
            </div>
          ))}
        </div>

        {/* Apariencia */}
        <div className="pt-3">
          <p className="font-medium mb-1">Apariencia del formulario</p>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-sm text-gray-600">Color de fondo
              <input type="color" className="block w-full h-10 rounded" value={data.apariencia?.bgColor || "#ffffff"}
                onChange={e=>setData((p:any)=>({...p, apariencia:{...p.apariencia, bgColor:e.target.value}}))}
              />
            </label>
            <label className="text-sm text-gray-600">Color del título
              <input type="color" className="block w-full h-10 rounded" value={data.apariencia?.titleColor || "#0f172a"}
                onChange={e=>setData((p:any)=>({...p, apariencia:{...p.apariencia, titleColor:e.target.value}}))}
              />
            </label>
            <label className="text-sm text-gray-600">Color del texto
              <input type="color" className="block w-full h-10 rounded" value={data.apariencia?.textColor || "#0f172a"}
                onChange={e=>setData((p:any)=>({...p, apariencia:{...p.apariencia, textColor:e.target.value}}))}
              />
            </label>
          </div>
          <div className="mt-2">
            <label className="text-sm text-tecnm-azul underline cursor-pointer">
              Imagen de fondo (desde tu equipo)
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e)=>{
                  const f = e.target.files?.[0]; if(!f) return
                  const fr = new FileReader()
                  fr.onload = () => setData((p:any)=>({...p, apariencia:{...p.apariencia, bgImageDataUrl: fr.result}}))
                  fr.readAsDataURL(f)
                }}
              />
            </label>
            {data.apariencia?.bgImageDataUrl && (
              <div className="mt-2 relative inline-block">
                <img src={data.apariencia.bgImageDataUrl} className="h-24 rounded" />
                <button className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full h-6 w-6"
                  onClick={()=>setData((p:any)=>({...p, apariencia:{...p.apariencia, bgImageDataUrl:null}}))}
                >x</button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Preguntas personalizadas */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Preguntas personalizadas</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>addQuestion("open")}>Respuesta abierta</Button>
            <Button variant="outline" onClick={()=>addQuestion("select")}>Lista desplegable</Button>
            <Button variant="outline" onClick={()=>addQuestion("radio")}>Opción múltiple</Button>
            <Button variant="outline" onClick={()=>addQuestion("checkbox")}>Checkbox</Button>
          </div>
        </div>

        {(data.customQuestions||[]).map((q:Question, i:number)=>(
          <div key={q.id} className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{q.type}</span>
              <input
                value={q.title}
                onChange={e=>{
                  const arr=[...data.customQuestions]; arr[i]={...q, title:e.target.value}; setData((p:any)=>({...p, customQuestions:arr}))
                }}
                placeholder="Escribe tu pregunta…"
                className="flex-1 rounded-xl border px-3 py-2"
              />
              <label className="text-sm flex items-center gap-1">
                <input type="checkbox" checked={!!q.required}
                  onChange={e=>{
                    const arr=[...data.customQuestions]; arr[i]={...q, required:e.target.checked}; setData((p:any)=>({...p, customQuestions:arr}))
                  }}
                />
                Requerida
              </label>
              <Button variant="outline" onClick={()=>{
                const arr=[...data.customQuestions]; arr.splice(i,1); setData((p:any)=>({...p, customQuestions:arr}))
              }}>Eliminar</Button>
            </div>

            {q.type!=="open" && (
              <div className="space-y-2">
                {(q.options||[]).map((op, k)=>(
                  <div key={k} className="flex gap-2">
                    <input
                      value={op}
                      onChange={e=>{
                        const arr=[...q.options!]; arr[k]=e.target.value
                        const qs=[...data.customQuestions]; qs[i]={...q, options:arr}; setData((p:any)=>({...p, customQuestions:qs}))
                      }}
                      className="flex-1 rounded-xl border px-3 py-2"
                    />
                    <Button variant="outline" onClick={()=>{
                      const arr=[...(q.options||[])]; arr.splice(k,1)
                      const qs=[...data.customQuestions]; qs[i]={...q, options:arr}; setData((p:any)=>({...p, customQuestions:qs}))
                    }}>Quitar</Button>
                  </div>
                ))}
                <Button variant="outline" onClick={()=>{
                  const arr=[...(q.options||[]), ""]; const qs=[...data.customQuestions]; qs[i]={...q, options:arr}; setData((p:any)=>({...p, customQuestions:qs}))
                }}>+ Opción</Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </section>
  )
}
