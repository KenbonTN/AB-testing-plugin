import { Env } from './types'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS headers for Framer domain
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    
    try {
      switch (url.pathname) {
        case '/assign':
          return handleAssign(request, env, corsHeaders)
        case '/impression':
          return handleImpression(request, env, corsHeaders)
        case '/convert':
          return handleConversion(request, env, corsHeaders)
        case '/stats':
          return handleStats(request, env, corsHeaders)
        case '/health':
          return Response.json({ status: 'ok' }, { headers: corsHeaders })
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders })
      }
    } catch (error) {
      return Response.json(
        { error: error.message }, 
        { status: 500, headers: corsHeaders }
      )
    }
  }
}

// Handlers imported from separate files for cleanliness
async function handleAssign(req: Request, env: Env, cors: any) {
  // Implementation here
  return Response.json({ variant: 'A' }, { headers: cors })
}

async function handleImpression(req: Request, env: Env, cors: any) {
  return new Response('OK', { headers: cors })
}

async function handleConversion(req: Request, env: Env, cors: any) {
  return new Response('OK', { headers: cors })
}

async function handleStats(req: Request, env: Env, cors: any) {
  return Response.json({}, { headers: cors })
}
