import { db } from '../servicios/firebaseConfig'
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  limit,
} from 'firebase/firestore'

const ENCUESTAS = 'encuestas'

/* -------------------- helpers -------------------- */
const DEFAULT_THEME = {
  backgroundColor: '#f5f7fb',
  backgroundImage: '',
  titleColor: '#111827',
  textColor: '#374151',
  overlayOpacity: 0.35,
}

function detectHashBase() {
  const usesHashRouter =
    typeof window !== 'undefined' && window.location.hash?.startsWith('#/')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return origin + (usesHashRouter ? '/#' : '')
}

function slugify(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function pickSlug(baseSlug?: string) {
  const candidate = slugify(baseSlug || 'formulario')
  const q1 = query(
    collection(db, ENCUESTAS),
    where('linkSlug', '==', candidate),
    limit(1),
  )
  const snap = await getDocs(q1)
  if (snap.empty) return candidate

  const ts = Date.now().toString(36).slice(-4)
  return `${candidate}-${ts}`
}

const cleanCats = (arr: string[] = []) =>
  Array.from(new Set(arr.map((c) => (c || '').trim()).filter(Boolean)))

/** Builder → compat (viejo) */
type TipoPregunta = 'texto' | 'select' | 'radio' | 'checkbox'
type PreguntaNueva = {
  id: string
  titulo: string
  tipo: TipoPregunta
  opciones?: string[]
  requerido?: boolean
}

function mapTipo(t: TipoPregunta) {
  if (t === 'texto') return 'text'
  return t
}

function toCompatQuestions(arr: PreguntaNueva[] = []) {
  return arr.map((p) => ({
    id: p.id,
    etiqueta: p.titulo?.trim() || p.id,
    tipo: mapTipo(p.tipo),
    opciones:
      p.tipo === 'texto'
        ? []
        : (p.opciones || []).map((o) => o.trim()).filter(Boolean),
    requerida: !!p.requerido,
  }))
}

/* -------------------- lecturas -------------------- */
export async function getById(encuestaId: string) {
  const ref = doc(db, ENCUESTAS, encuestaId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function getByCourse(cursoId: string) {
  const qy = query(collection(db, ENCUESTAS), where('cursoId', '==', cursoId))
  const snap = await getDocs(qy)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getBySlug(slug: string) {
  const qy = query(
    collection(db, ENCUESTAS),
    where('linkSlug', '==', slug),
    limit(1),
  )
  const snap = await getDocs(qy)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

/* -------------------- escrituras -------------------- */
export async function createForCourse({
  cursoId,
  titulo,
  descripcion,
  user,
  slug,
  theme,
  preguntas = [],
  cantidadParticipantes = 1,
  categorias = [],
  camposPreestablecidos = {
    nombreEquipo: true,
    nombreLider: true,
    contactoEquipo: true,
    categoria: true,
    cantidadParticipantes: true,
  },
}: {
  cursoId?: string
  titulo?: string
  descripcion?: string
  user?: { uid?: string }
  slug?: string
  theme?: Record<string, any>
  preguntas?: PreguntaNueva[]
  cantidadParticipantes?: number
  categorias?: string[]
  camposPreestablecidos?: Record<string, boolean>
}) {
  const baseUrl = detectHashBase()
  const cats = cleanCats(categorias)
  const compatQuestions = toCompatQuestions(preguntas)

  const ref = await addDoc(collection(db, ENCUESTAS), {
    cursoId: cursoId || null,
    titulo: titulo || 'Registro de Grupos',
    descripcion: descripcion || '',
    createdAt: serverTimestamp(),
    creadoPor: user?.uid || null,

    camposPreestablecidos: {
      nombreEquipo: !!camposPreestablecidos.nombreEquipo,
      nombreLider: !!camposPreestablecidos.nombreLider,
      contactoEquipo: !!camposPreestablecidos.contactoEquipo,
      categoria: !!camposPreestablecidos.categoria,
    },
    categorias: cats,
    cantidadParticipantes,
    preguntas,
    apariencia: {},

    theme: { ...DEFAULT_THEME, ...(theme || {}) },
    form: { preguntas: compatQuestions },
    preguntasPersonalizadas: compatQuestions,
    questions: compatQuestions,
    questionsVersion: Date.now(),
    formularioGrupos: {
      camposPreestablecidos: { ...camposPreestablecidos },
      cantidadParticipantes,
      categorias: cats,
      preguntasPersonalizadas: compatQuestions,
    },
    habilitado: true,
  })

  const linkSlug = await pickSlug(slug || titulo || 'registro')
  const linkById = `${baseUrl}/formulario-publico/${ref.id}`
  const linkBySlug = `${baseUrl}/registro/${linkSlug}` // ← FIX

  await updateDoc(ref, {
    link: linkById,
    linkSlug,
    linkBySlug,
  })

  return { id: ref.id, link: linkById, linkBySlug, linkSlug }
}

export async function saveResponse(
  encuestaId: string,
  payload: { preset?: any; custom?: any; createdAt?: any },
) {
  const sub = collection(doc(db, ENCUESTAS, encuestaId), 'respuestas')
  await addDoc(sub, {
    ...payload,
    createdAt: payload?.createdAt || serverTimestamp(),
    submittedAt: serverTimestamp(),
  })
}

export async function updateSurvey(encuestaId: string, patch: any) {
  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
    ...patch,
  }

  if (Array.isArray(patch?.preguntas)) {
    const compat = toCompatQuestions(patch.preguntas)
    updates['form'] = { preguntas: compat }
    updates['preguntasPersonalizadas'] = compat
    updates['questions'] = compat
    updates['questionsVersion'] = Date.now()
    updates['formularioGrupos.preguntasPersonalizadas'] = compat
  }

  if (Array.isArray(patch?.categorias)) {
    updates['categorias'] = cleanCats(patch.categorias)
    updates['formularioGrupos.categorias'] = cleanCats(patch.categorias)
  }

  if (typeof patch?.cantidadParticipantes === 'number') {
    updates['formularioGrupos.cantidadParticipantes'] = patch.cantidadParticipantes
  }

  if (patch?.camposPreestablecidos) {
    updates['formularioGrupos.camposPreestablecidos'] = {
      ...(patch.camposPreestablecidos || {}),
    }
  }

  await updateDoc(doc(db, ENCUESTAS, encuestaId), updates)
}

export async function updateSurveyTheme(
  encuestaId: string,
  themePatch: Record<string, any> = {},
  { bgDataUrl, removeBg }: { bgDataUrl?: string; removeBg?: boolean } = {},
) {
  const updates: Record<string, any> = {}
  Object.entries(themePatch || {}).forEach(([k, v]) => {
    updates[`theme.${k}`] = v
  })
  if (bgDataUrl) {
    updates['theme.backgroundImage'] = bgDataUrl
    updates['theme.bgVersion'] = Date.now()
  } else if (removeBg) {
    updates['theme.backgroundImage'] = ''
    updates['theme.bgVersion'] = Date.now()
  }
  updates['updatedAt'] = serverTimestamp()
  await updateDoc(doc(db, ENCUESTAS, encuestaId), updates)
}

export async function setSurveySlug(encuestaId: string, desiredSlug: string) {
  const base = detectHashBase()
  const linkSlug = await pickSlug(desiredSlug)
  const linkBySlug = `${base}/registro/${linkSlug}` // ← FIX
  await updateDoc(doc(db, ENCUESTAS, encuestaId), { linkSlug, linkBySlug })
  return { linkSlug, linkBySlug }
}

/* -------------------- hook con loading -------------------- */
import { useState, useCallback } from 'react'

export function useSurveys() {
  const [loading, setLoading] = useState(false)

  const _getByCourse = useCallback(async (cursoId: string) => getByCourse(cursoId), [])
  const _getById = useCallback(async (encuestaId: string) => getById(encuestaId), [])
  const _getBySlug = useCallback(async (slug: string) => getBySlug(slug), [])

  const _createForCourse = useCallback(async (opts: any) => {
    setLoading(true)
    try {
      return await createForCourse(opts)
    } finally {
      setLoading(false)
    }
  }, [])

  const _saveResponse = useCallback(
    async (encuestaId: string, payload: any) => saveResponse(encuestaId, payload),
    [],
  )

  const _updateSurvey = useCallback(async (encuestaId: string, patch: any) => {
    setLoading(true)
    try {
      await updateSurvey(encuestaId, patch)
    } finally {
      setLoading(false)
    }
  }, [])

  const _updateSurveyTheme = useCallback(
    async (encuestaId: string, themePatch: any, opts?: any) => {
      setLoading(true)
      try {
        await updateSurveyTheme(encuestaId, themePatch, opts || {})
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const _setSurveySlug = useCallback(async (encuestaId: string, desiredSlug: string) => {
    setLoading(true)
    try {
      return await setSurveySlug(encuestaId, desiredSlug)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    getByCourse: _getByCourse,
    getById: _getById,
    getBySlug: _getBySlug,
    createForCourse: _createForCourse,
    saveResponse: _saveResponse,
    updateSurvey: _updateSurvey,
    updateSurveyTheme: _updateSurveyTheme,
    setSurveySlug: _setSurveySlug,
  }
}
