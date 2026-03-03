import { Env } from './types'

// Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors })
    }

    const url = new URL(request.url)

    try {
      switch (url.pathname) {
        case '/assign':
          return handleAssign(request, env, cors)
        case '/impression':
          return handleImpression(request, env, cors)
        case '/convert':
          return handleConversion(request, env, cors)
        case '/stats':
          return handleStats(request, env, cors)
        case '/health':
          return Response.json({ status: 'ok' }, { headers: cors })
        default:
          return new Response('Not Found', { status: 404, headers: cors })
      }
    } catch (error: any) {
      console.error('Error:', error.message)
      return Response.json({ error: error.message }, { status: 500, headers: cors })
    }
  }
}

async function handleAssign(request: Request, env: Env, cors: any) {
  const url = new URL(request.url)
  const experimentId = url.searchParams.get('exp') || 'default'
  const userId = url.searchParams.get('user_id') || generateUUID()
  
  try {
    // Check existing assignment
    const existing = await env.DB.prepare(
      'SELECT variant FROM assignments WHERE experiment_id = ? AND user_id = ?'
    ).bind(experimentId, userId).first()
    
    if (existing) {
      return Response.json({ 
        variant: existing.variant, 
        user_id: userId,
        experiment_id: experimentId
      }, { headers: cors })
    }
    
    // Get experiment split
    const exp = await env.DB.prepare(
      'SELECT split FROM experiments WHERE id = ?'
    ).bind(experimentId).first()
    
    if (!exp) {
      return Response.json({ error: 'Experiment not found' }, { status: 404, headers: cors })
    }
    
    const variant = Math.random() < (exp.split || 0.5) ? 'B' : 'A'
    
    // Insert assignment with generated UUID
    await env.DB.prepare(
      'INSERT INTO assignments (id, experiment_id, user_id, variant) VALUES (?, ?, ?, ?)'
    ).bind(generateUUID(), experimentId, userId, variant).run()
    
    return Response.json({ 
      variant, 
      user_id: userId,
      experiment_id: experimentId
    }, { headers: cors })
  } catch (e: any) {
    return Response.json({ error: 'Assign failed: ' + e.message }, { status: 500, headers: cors })
  }
}

async function handleImpression(request: Request, env: Env, cors: any) {
  try {
    const body = await request.json()
    const { experiment_id, variant, user_id } = body

    if (!experiment_id || !variant) {
      return Response.json({ error: 'Missing experiment_id or variant' }, { status: 400, headers: cors })
    }

    await env.DB.prepare(
      'INSERT INTO impressions (id, experiment_id, user_id, variant) VALUES (?, ?, ?, ?)'
    ).bind(generateUUID(), experiment_id, user_id || null, variant).run()

    return Response.json({ success: true }, { headers: cors })
  } catch (e: any) {
    return Response.json({ error: 'Impression failed: ' + e.message }, { status: 500, headers: cors })
  }
}

async function handleConversion(request: Request, env: Env, cors: any) {
  try {
    const body = await request.json()
    const { experiment_id, variant, user_id, type = 'click', metadata } = body

    if (!experiment_id || !variant) {
      return Response.json({ error: 'Missing experiment_id or variant' }, { status: 400, headers: cors })
    }

    await env.DB.prepare(
      'INSERT INTO conversions (id, experiment_id, user_id, variant, type, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(generateUUID(), experiment_id, user_id || null, variant, type, metadata ? JSON.stringify(metadata) : null).run()

    return Response.json({ success: true }, { headers: cors })
  } catch (e: any) {
    return Response.json({ error: 'Conversion failed: ' + e.message }, { status: 500, headers: cors })
  }
}

async function handleStats(request: Request, env: Env, cors: any) {
  const url = new URL(request.url)
  const experimentId = url.searchParams.get('exp') || 'default'
  
  try {
    const impressions = await env.DB.prepare(
      'SELECT variant, COUNT(*) as count FROM impressions WHERE experiment_id = ? GROUP BY variant'
    ).bind(experimentId).all()
    
    const conversions = await env.DB.prepare(
      'SELECT variant, COUNT(*) as count FROM conversions WHERE experiment_id = ? GROUP BY variant'
    ).bind(experimentId).all()

    const stats = {
      A: { impressions: 0, conversions: 0, conversion_rate: 0 },
      B: { impressions: 0, conversions: 0, conversion_rate: 0 }
    }

    for (const row of impressions.results || []) {
      const v = row.variant as 'A' | 'B'
      stats[v].impressions = row.count as number
    }
    
    for (const row of conversions.results || []) {
      const v = row.variant as 'A' | 'B'
      stats[v].conversions = row.count as number
    }

    for (const v of ['A', 'B'] as const) {
      stats[v].conversion_rate = stats[v].impressions > 0 
        ? parseFloat(((stats[v].conversions / stats[v].impressions) * 100).toFixed(2))
        : 0
    }

    return Response.json({
      experiment_id: experimentId,
      variants: stats
    }, { headers: cors })
  } catch (e: any) {
    return Response.json({ error: 'Stats failed: ' + e.message }, { status: 500, headers: cors })
  }
}
