import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function isAllowedImageProxyUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) return false
    return host === 'volces.com' ||
      host.endsWith('.volces.com') ||
      host === 'volcengine.com' ||
      host.endsWith('.volcengine.com') ||
      host === 'aliyuncs.com' ||
      host.endsWith('.aliyuncs.com') ||
      host === 'aliyun.com' ||
      host.endsWith('.aliyun.com') ||
      host === 'openai.com' ||
      host.endsWith('.openai.com') ||
      host === 'oaidalleapiprodscus.blob.core.windows.net' ||
      host.endsWith('.blob.core.windows.net') ||
      host === 'app.yylx.io' ||
      host.endsWith('.app.yylx.io')
  } catch {
    return false
  }
}

function imageProxyPlugin() {
  return {
    name: 'amazon-image-studio-image-proxy',
    configureServer(server: any) {
      server.middlewares.use('/image-proxy/', async (req: any, res: any) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const imageUrl = Array.isArray(req.headers['x-image-url'])
          ? req.headers['x-image-url'][0]
          : req.headers['x-image-url']
        if (typeof imageUrl !== 'string' || !isAllowedImageProxyUrl(imageUrl)) {
          res.statusCode = 403
          res.end('Forbidden image URL')
          return
        }

        try {
          const upstream = await fetch(imageUrl, { cache: 'no-store' })
          res.statusCode = upstream.status
          res.setHeader('X-Image-Proxy', '1')
          const contentType = upstream.headers.get('content-type')
          if (contentType) res.setHeader('Content-Type', contentType)
          const contentLength = upstream.headers.get('content-length')
          if (contentLength) res.setHeader('Content-Length', contentLength)
          const buffer = Buffer.from(await upstream.arrayBuffer())
          res.end(buffer)
        } catch (err) {
          res.statusCode = 502
          res.end(err instanceof Error ? err.message : 'Image proxy failed')
        }
      })
    },
  }
}

function normalizeProxyTarget(value: string | undefined) {
  const raw = value?.trim() || 'https://app.yylx.io'
  try {
    const url = new URL(raw)
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return 'https://app.yylx.io'
  }
}

function apiProxyPlugin() {
  const prefix = process.env.VITE_API_PROXY_PREFIX?.trim() || '/api-proxy'
  const target = normalizeProxyTarget(process.env.VITE_API_PROXY_TARGET)
  return {
    name: 'amazon-image-studio-api-proxy',
    configureServer(server: any) {
      server.middlewares.use(prefix, async (req: any, res: any) => {
        const originalUrl = String(req.url || '/')
        const path = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`
        const upstreamUrl = `${target}${path}`

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }

          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (!value || ['host', 'origin', 'referer', 'content-length'].includes(key.toLowerCase())) continue
            headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
          }

          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(String(req.method).toUpperCase()) ? undefined : body,
            cache: 'no-store',
          })

          res.statusCode = upstream.status
          res.setHeader('X-API-Proxy', '1')
          upstream.headers.forEach((value, key) => {
            if (['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) return
            res.setHeader(key, value)
          })
          const buffer = Buffer.from(await upstream.arrayBuffer())
          res.end(buffer)
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(err instanceof Error ? err.message : 'API proxy failed')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin(), apiProxyPlugin()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
  },
})
