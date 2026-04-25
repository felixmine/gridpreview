import { corsHeaders } from '../_shared/cors.ts'

const ALLOWED_FORMATS = new Set(['stl', 'obj', '3mf', 'step', 'stp'])

// ── Platform detection ────────────────────────────────────────────────────────

function detectPlatform(url: string): 'printables' | 'makerworld' | null {
  if (/printables\.com\/model\/\d+/i.test(url)) return 'printables'
  if (/makerworld\.com\/.*\/models\/\d+/i.test(url)) return 'makerworld'
  return null
}

// ── Printables ────────────────────────────────────────────────────────────────

function extractPrintablesId(url: string): string | null {
  const m = url.match(/\/model\/(\d+)/)
  return m ? m[1] : null
}

async function listPrintables(modelId: string) {
  const query = `
    query PrintProfile($id: ID!) {
      print(id: $id) {
        name
        files {
          id
          name
          fileSize
          fileType
          downloadPath
        }
      }
    }
  `
  const res = await fetch('https://api.printables.com/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: modelId } }),
  })
  if (!res.ok) throw new Error(`Printables API error: ${res.status}`)
  const json = await res.json()
  const print = json?.data?.print
  if (!print) throw new Error('Model not found on Printables')

  const files = (print.files ?? [])
    .filter((f: { name: string }) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      return ALLOWED_FORMATS.has(ext)
    })
    .map((f: { id: string; name: string; fileSize: number; downloadPath: string }) => ({
      id: f.id,
      name: f.name,
      size: f.fileSize,
      format: f.name.split('.').pop()?.toLowerCase(),
      downloadUrl: f.downloadPath,
    }))

  return { platform: 'printables', modelName: print.name, files }
}

// ── MakerWorld ────────────────────────────────────────────────────────────────

function extractMakerworldId(url: string): string | null {
  const m = url.match(/\/models\/(\d+)/)
  return m ? m[1] : null
}

async function listMakerworld(modelId: string) {
  const res = await fetch(
    `https://makerworld.com/api/v1/design/detail?id=${modelId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://makerworld.com/',
      },
    }
  )
  if (!res.ok) throw new Error(`MakerWorld API error: ${res.status}`)
  const json = await res.json()

  // MakerWorld response structure (reverse-engineered from web app)
  const modelName: string = json?.title ?? json?.name ?? 'Unknown model'
  const profileList: Array<{
    id: number
    profileType?: string
    downloadUrl?: string
    files?: Array<{ id: number; name: string; size: number; url: string }>
  }> = json?.profileList ?? json?.profiles ?? []

  const files: Array<{ id: string; name: string; size: number; format: string; downloadUrl: string }> = []

  for (const profile of profileList) {
    const profileFiles: Array<{ id: number; name: string; size: number; url: string }> =
      profile.files ?? []
    for (const f of profileFiles) {
      const ext = (f.name ?? '').split('.').pop()?.toLowerCase() ?? ''
      if (ALLOWED_FORMATS.has(ext)) {
        files.push({
          id: String(f.id),
          name: f.name,
          size: f.size,
          format: ext,
          downloadUrl: f.url,
        })
      }
    }
    // Some responses nest files differently — try top-level downloadUrl as fallback
    if (profileFiles.length === 0 && profile.downloadUrl) {
      const name = `profile_${profile.id}.stl`
      files.push({
        id: String(profile.id),
        name,
        size: 0,
        format: 'stl',
        downloadUrl: profile.downloadUrl,
      })
    }
  }

  if (files.length === 0) {
    throw new Error(
      'No printable files found. MakerWorld may require login for this model.'
    )
  }

  return { platform: 'makerworld', modelName, files }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, url, filename } = await req.json()

    // ── list: return file metadata for a model page URL ──
    if (action === 'list') {
      if (!url || typeof url !== 'string') {
        return new Response(JSON.stringify({ error: 'url is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const platform = detectPlatform(url)
      if (!platform) {
        return new Response(
          JSON.stringify({ error: 'Unsupported URL. Paste a Printables or MakerWorld model page URL.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let result
      if (platform === 'printables') {
        const id = extractPrintablesId(url)
        if (!id) throw new Error('Could not extract model ID from URL')
        result = await listPrintables(id)
      } else {
        const id = extractMakerworldId(url)
        if (!id) throw new Error('Could not extract model ID from URL')
        result = await listMakerworld(id)
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── download: proxy a file URL and stream it back ──
    if (action === 'download') {
      if (!url || typeof url !== 'string') {
        return new Response(JSON.stringify({ error: 'url is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const fileRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': url.includes('makerworld') ? 'https://makerworld.com/' : 'https://www.printables.com/',
        },
      })
      if (!fileRes.ok) {
        throw new Error(`Failed to fetch file: ${fileRes.status} ${fileRes.statusText}`)
      }

      const contentType =
        fileRes.headers.get('Content-Type') ?? 'application/octet-stream'

      const disposition = filename
        ? `attachment; filename="${filename}"`
        : fileRes.headers.get('Content-Disposition') ?? 'attachment'

      return new Response(fileRes.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Content-Disposition': disposition,
        },
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
