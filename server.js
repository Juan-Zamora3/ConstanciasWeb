/* eslint-env node */
// server.js
import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Mailjet from 'node-mailjet'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app  = express()
const port = process.env.PORT || 4000

/* =========================
   Middlewares
========================= */
const frontOrigin = process.env.FRONT_ORIGIN // ej: http://localhost:5173 o tu front en prod
app.use(cors(frontOrigin ? { origin: frontOrigin } : undefined))
app.use(bodyParser.json({ limit: '50mb' }))

/* =========================
   Mailjet
========================= */
const MJ_KEY    = process.env.MJ_API_KEY    || ''
const MJ_SECRET = process.env.MJ_API_SECRET || ''
if (!MJ_KEY || !MJ_SECRET) {
  console.warn('⚠️  MJ_API_KEY / MJ_API_SECRET no configurados. El envío de correo fallará.')
}
const mailjet   = Mailjet.apiConnect(MJ_KEY, MJ_SECRET)

const senderEmail = process.env.MJ_SENDER || 'ConstanciasISCITSPP@outlook.com'
const senderName  = process.env.MJ_SENDER_NAME || 'Constancias ISC-ITSPP'

/* =========================
   Utils
========================= */
function registrarEnvio(entry) {
  const linea = { ...entry, fecha: new Date().toISOString() }
  try {
    if (process.env.NODE_ENV === 'production') {
      console.log('[ENVIO]', linea)
    } else {
      fs.appendFileSync(path.join(__dirname, 'envios.log'), JSON.stringify(linea) + '\n', 'utf8')
    }
  } catch (e) {
    console.error('No se pudo registrar el envío:', e.message)
  }
}

function normalizeB64(maybeDataUrl = '') {
  if (!maybeDataUrl) return ''
  const idx = maybeDataUrl.indexOf(',')
  return idx >= 0 ? maybeDataUrl.slice(idx + 1) : maybeDataUrl
}

function approxBase64Bytes(b64 = '') {
  const clean = normalizeB64(b64)
  return Math.floor((clean.length * 3) / 4)
}

// Escapa HTML básico y convierte saltos de línea cuando *sí* mandas HTMLPart.
function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
}
function nl2br(s = '') {
  return String(s).replace(/\n/g, '<br>')
}

/* =========================
   Healthcheck
========================= */
app.get('/health', (_req, res) => res.json({ ok: true }))

/* =========================
   Proxy PDF (evita CORS)
========================= */
app.get('/proxy-pdf', async (req, res) => {
  try {
    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'missing url' })

    const r = await fetch(url)
    if (!r.ok) return res.status(r.status).send(`upstream error (${r.status})`)

    res.setHeader('Access-Control-Allow-Origin', frontOrigin || '*')
    const ct = r.headers.get('content-type') || 'application/pdf'
    const ar = r.headers.get('accept-ranges')
    if (ar) res.setHeader('Accept-Ranges', ar)
    res.setHeader('Content-Type', ct)

    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Length', String(buf.length))
    return res.status(200).end(buf)
  } catch (e) {
    console.error('proxy-pdf error:', e)
    return res.status(500).json({ error: 'proxy error' })
  }
})

/* =========================
   POST /EnviarCorreo
   NO agrega saludo/cierre. Usa exactamente "mensajeCorreo".
   Soporta: un PDF (pdf) o varios adjuntos (attachments[]).
========================= */
app.post('/EnviarCorreo', async (req, res) => {
  try {
    const {
      Correo,
      Nombres,
      Puesto,
      // Equipo (opcional, solo para tu log)
      Equipo,
      pdf,                // base64 de un PDF (modo individual)
      attachments,        // [{ Filename, ContentType, Base64Content }]
      mensajeCorreo,      // texto plano desde el front (sin modificaciones)
      Asunto,
      Filename,
      ContentType,
      FromEmail,
      FromName,
    } = req.body

    if (!Correo || !Nombres) {
      return res.status(400).json({ error: 'Faltan campos requeridos: Correo y Nombres' })
    }

    // Adjuntos finales
    let finalAttachments = []
    if (Array.isArray(attachments) && attachments.length > 0) {
      finalAttachments = attachments.map(a => ({
        ContentType: a.ContentType || 'application/pdf',
        Filename: a.Filename || 'archivo.pdf',
        Base64Content: normalizeB64(a.Base64Content || '')
      }))
    } else if (pdf) {
      finalAttachments = [{
        ContentType: ContentType || 'application/pdf',
        Filename: Filename || `Constancia_${String(Puesto || 'Participante').replace(/\s/g,'_')}_${String(Nombres).replace(/\s/g,'_')}.pdf`,
        Base64Content: normalizeB64(pdf)
      }]
    } else {
      return res.status(400).json({ error: 'Falta adjuntar "pdf" o "attachments[]"' })
    }

    // Límite total adjuntos (~15MB conservador)
    const totalBytes = finalAttachments.reduce((acc, a) => acc + approxBase64Bytes(a.Base64Content || ''), 0)
    if (totalBytes > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'El total de adjuntos supera ~15MB' })
    }

    const msg = typeof mensajeCorreo === 'string' ? mensajeCorreo : ''

    const request = await mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [{
          From: { Email: FromEmail || senderEmail, Name: FromName || senderName },
          To: [{ Email: Correo, Name: Nombres }],
          Subject: Asunto || 'Constancias',
          TextPart: msg,                                   // ← exactamente el texto del front
          HTMLPart: msg ? `<div>${nl2br(esc(msg))}</div>` : undefined, // opcional, mismo contenido
          Attachments: finalAttachments
        }]
      })

    const messageId = request?.body?.Messages?.[0]?.To?.[0]?.MessageID || null
    registrarEnvio({
      tipo: (finalAttachments.length === 1 && finalAttachments[0].ContentType === 'application/zip') ? 'zip' : 'pdfs',
      Correo, Nombres, Puesto, Equipo,
      filename: finalAttachments.map(a => a.Filename).join(','),
      messageId
    })
    return res.json({ message: 'Correo enviado', messageId })
  } catch (err) {
    const code = err?.statusCode || 500
    const detail = err?.response?.text || err?.message || 'Error al enviar correo'
    console.error('Mailjet error →', code, detail)
    return res.status(code === 400 || code === 413 ? code : 500).json({ error: 'Error al enviar correo', detail })
  }
})

/* =========================
   POST /EnviarZip
   NO agrega saludo/cierre. Usa exactamente "mensajeCorreo".
========================= */
app.post('/EnviarZip', async (req, res) => {
  try {
    const { Correo, Nombres, Equipo, mensajeCorreo, zipBase64, filename, Asunto, FromEmail, FromName } = req.body
    if (!Correo || !Nombres || !zipBase64 || !filename) {
      return res.status(400).json({ error: 'Faltan campos requeridos: Correo, Nombres, zipBase64, filename' })
    }

    const size = approxBase64Bytes(zipBase64)
    if (size > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'ZIP demasiado grande para enviar por correo' })
    }

    const msg = typeof mensajeCorreo === 'string' ? mensajeCorreo : ''

    const request = await mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [{
          From: { Email: FromEmail || senderEmail, Name: FromName || senderName },
          To: [{ Email: Correo, Name: Nombres }],
          Subject: Asunto || 'Constancias del equipo',
          TextPart: msg,                                   // ← exactamente el texto del front
          HTMLPart: msg ? `<div>${nl2br(esc(msg))}</div>` : undefined,
          Attachments: [{
            ContentType: 'application/zip',
            Filename: filename,
            Base64Content: normalizeB64(zipBase64)
          }]
        }]
      })

    const messageId = request?.body?.Messages?.[0]?.To?.[0]?.MessageID || null
    registrarEnvio({ tipo: 'zip', Correo, Nombres, Equipo, filename, messageId })
    return res.json({ message: 'ZIP enviado', messageId })
  } catch (err) {
    const code = err?.statusCode || 500
    const detail = err?.response?.text || err?.message || 'Error al enviar correo'
    console.error('Mailjet error (ZIP) →', code, detail)
    return res.status(code === 400 || code === 413 ? code : 500).json({ error: 'Error al enviar ZIP', detail })
  }
})

/* =========================
   Static (build Vite)
========================= */
const distPath = path.join(__dirname, 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/* =========================
   Start
========================= */
app.listen(port, () => {
  console.log(`Servidor listo en ${port}`)
})
