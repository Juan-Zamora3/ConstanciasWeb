import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { Card } from "../components/ui/Card"
import { db } from "../servicios/firebaseConfig"
import { doc, getDoc } from "firebase/firestore"

type EncuestaPub = {
  camposPreestablecidos?: {
    nombreEquipo?: boolean
    nombreLider?: boolean
    contactoEquipo?: boolean
    categoria?: boolean
    cantidadParticipantes?: boolean
  }
  cantidadParticipantes?: number
  categorias?: string[]
}

export default function FormularioPublico() {
  const { encuestaId } = useParams<{ encuestaId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [encuesta, setEncuesta] = useState<EncuestaPub | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        if (!encuestaId) return
        const ref = doc(db, "encuestas", encuestaId)
        const snap = await getDoc(ref)
        if (!snap.exists()) throw new Error("Formulario no encontrado")
        setEncuesta(snap.data() as EncuestaPub)
        setLoading(false)
      } catch (e) {
        console.error(e)
        setError("No fue posible cargar el formulario.")
        setLoading(false)
      }
    }
    run()
  }, [encuestaId])

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Formulario</h1>
        <Link to="/" className="text-sm text-tecnm-azul hover:underline">Inicio</Link>
      </div>

      {loading && <Card className="p-6 text-sm text-gray-600">Cargando…</Card>}
      {error && !loading && <Card className="p-6 text-sm text-red-600">{error}</Card>}

      {!loading && !error && encuesta && (
        <Card className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Participantes por equipo: <strong>{encuesta.cantidadParticipantes ?? 1}</strong>
          </p>

          {encuesta.categorias?.length ? (
            <div>
              <p className="text-sm text-gray-600">Categorías:</p>
              <ul className="list-disc ml-5">
                {encuesta.categorias.map((c, i) => <li key={i}>{c || "—"}</li>)}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-gray-500">
            (Aquí va el formulario real; esto es un preview funcional para probar la carga.)
          </p>
        </Card>
      )}
    </section>
  )
}
