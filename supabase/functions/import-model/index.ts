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
  // Step 1: get model name + file IDs (Printables split files into stls/otherFiles)
  const listQuery = `
    query PrintProfile($id: ID!) {
      print(id: $id) {
        name
        stls { id name fileSize }
        otherFiles { id name fileSize }
      }
    }
  `
  const res = await fetch('https://api.printables.com/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: listQuery, variables: { id: modelId } }),
  })
  if (!res.ok) throw new Error(`Printables API error: ${res.status}`)
  const json = await res.json()
  const print = json?.data?.print
  if (!print) throw new Error('Model not found on Printables')

  type RawFile = { id: string; name: string; fileSize: number }
  const stls: RawFile[] = (print.stls ?? []).filter((f: RawFile) => ALLOWED_FORMATS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
  const others: RawFile[] = (print.otherFiles ?? []).filter((f: RawFile) => ALLOWED_FORMATS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))

  if (stls.length === 0 && others.length === 0) throw new Error('No printable files found on Printables')

  // Step 2: get signed download URLs via getDownloadLink mutation
  const filesInput = [
    ...(stls.length  ? [{ fileType: 'stl',   ids: stls.map(f => f.id) }] : []),
    ...(others.length ? [{ fileType: 'other', ids: others.map(f => f.id) }] : []),
  ]
  const dlMutation = `
    mutation GetDownloadLink($printId: ID!, $files: [DownloadFileInput]) {
      getDownloadLink(printId: $printId, files: $files, source: model_detail) {
        ok
        output { files { id link } }
      }
    }
  `
  const dlRes = await fetch('https://api.printables.com/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: dlMutation, variables: { printId: modelId, files: filesInput } }),
  })
  if (!dlRes.ok) throw new Error(`Printables download-link error: ${dlRes.status}`)
  const dlJson = await dlRes.json()
  const linkMap = new Map<string, string>(
    ((dlJson?.data?.getDownloadLink?.output?.files ?? []) as Array<{ id: string; link: string }>)
      .map(f => [f.id, f.link])
  )

  const files = [...stls, ...others]
    .filter(f => linkMap.has(f.id))
    .map(f => ({
      id: f.id,
      name: f.name,
      size: f.fileSize,
      format: f.name.split('.').pop()?.toLowerCase(),
      downloadUrl: linkMap.get(f.id)!,
    }))

  if (files.length === 0) throw new Error('No downloadable files found on Printables')
  return { platform: 'printables', modelName: print.name, files }
}

// ── MakerWorld ────────────────────────────────────────────────────────────────

function extractMakerworldId(url: string): string | null {
  const m = url.match(/\/models\/(\d+)/)
  return m ? m[1] : null
}

async function listMakerworld(modelId: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://makerworld.com/en/models/${modelId}`,
    'Origin': 'https://makerworld.com',
  }

  // Try v2 first, fall back to v1
  let json: Record<string, unknown> | null = null
  for (const endpoint of [
    `https://makerworld.com/api/v2/design/detail?id=${modelId}`,
    `https://makerworld.com/api/v1/design/detail?id=${modelId}`,
  ]) {
    const res = await fetch(endpoint, { headers })
    if (res.ok) {
      json = await res.json()
      break
    }
  }
  if (!json) throw new Error('MakerWorld model not found or API unavailable')

  const modelName: string = (json.title ?? json.name ?? 'Unknown model') as string

  // v2 wraps data under a `data` key; v1 returns it flat
  const root = (json.data ?? json) as Record<string, unknown>

  const profileList: Array<{
    id: number
    downloadUrl?: string
    files?: Array<{ id: number; name: string; size: number; url: string }>
  }> = (root.profileList ?? root.profiles ?? []) as Array<{
    id: number; downloadUrl?: string
    files?: Array<{ id: number; name: string; size: number; url: string }>
  }>

  const files: Array<{ id: string; name: string; size: number; format: string; downloadUrl: string }> = []

  for (const profile of profileList) {
    const profileFiles = profile.files ?? []
    for (const f of profileFiles) {
      const ext = (f.name ?? '').split('.').pop()?.toLowerCase() ?? ''
      if (ALLOWED_FORMATS.has(ext)) {
        files.push({ id: String(f.id), name: f.name, size: f.size, format: ext, downloadUrl: f.url })
      }
    }
    if (profileFiles.length === 0 && profile.downloadUrl) {
      files.push({ id: String(profile.id), name: `profile_${profile.id}.stl`, size: 0, format: 'stl', downloadUrl: profile.downloadUrl })
    }
  }

  if (files.length === 0) {
    throw new Error('No printable files found. MakerWorld may require login for this model.')
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

    // ping: warmup request, just return ok
    if (action === 'ping') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
