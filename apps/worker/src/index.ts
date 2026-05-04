import { Env } from "./types";

// Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID();
}

async function checkAuth(
  request: Request,
  env: Env,
  requiredType: "write" | "read",
): Promise<{ projectId: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const key = authHeader.slice(7);
  try {
    const project = await env.DB.prepare(
      "SELECT id, write_key, read_key FROM projects WHERE write_key = ? OR read_key = ?",
    )
      .bind(key, key)
      .first<{ id: string; write_key: string; read_key: string }>();
    if (!project) return null;
    if (requiredType === "write" && project.write_key !== key) return null;
    if (requiredType === "read" && project.read_key !== key) return null;
    return { projectId: project.id };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/v1/projects" && request.method === "POST") {
        // No auth, create project
        const body = (await request.json()) as any;
        const { name } = body;
        const writeKey = generateUUID();
        const readKey = generateUUID();
        const projectId = generateUUID();
        await env.DB.prepare(
          "INSERT INTO projects (id, name, write_key, read_key) VALUES (?, ?, ?, ?)",
        )
          .bind(projectId, name || "Untitled Project", writeKey, readKey)
          .run();
        return Response.json(
          { project_id: projectId, write_key: writeKey, read_key: readKey },
          { headers: cors },
        );
      } else if (
        url.pathname === "/v1/projects/me" &&
        request.method === "GET"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const project = await env.DB.prepare(
          "SELECT id, name, created_at FROM projects WHERE id = ?",
        )
          .bind(auth.projectId)
          .first();
        return Response.json(project, { headers: cors });
      } else if (
        url.pathname === "/v1/experiments" &&
        request.method === "GET"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const experiments = await env.DB.prepare(
          "SELECT id, name, status, split_a, cookie_days, version, created_at, updated_at FROM experiments WHERE project_id = ?",
        )
          .bind(auth.projectId)
          .all();
        return Response.json(experiments.results, { headers: cors });
      } else if (
        url.pathname === "/v1/experiments" &&
        request.method === "POST"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const body = (await request.json()) as any;
        const { name, split_a, cookie_days } = body;
        const experimentId = generateUUID();
        await env.DB.prepare(
          "INSERT INTO experiments (id, project_id, name, split_a, cookie_days, version) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(
            experimentId,
            auth.projectId,
            name,
            split_a || 0.5,
            cookie_days || 30,
            1,
          )
          .run();
        return Response.json(
          { experiment_id: experimentId },
          { headers: cors },
        );
      } else if (
        url.pathname.startsWith("/v1/experiments/") &&
        url.pathname.endsWith("/stats") &&
        request.method === "GET"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const parts = url.pathname.split("/");
        const experimentId = parts[3];
        // Check if experiment belongs to project
        const exp = await env.DB.prepare(
          "SELECT * FROM experiments WHERE id = ? AND project_id = ?",
        )
          .bind(experimentId, auth.projectId)
          .first();
        if (!exp)
          return Response.json(
            { error: "Experiment not found" },
            { status: 404, headers: cors },
          );
        // Compute stats — only count events from the current experiment version
        const currentVersion = (exp as any).version as number;
        const impressions = await env.DB.prepare(
          "SELECT variant, COUNT(*) as count FROM events WHERE experiment_id = ? AND experiment_version = ? AND type = ? GROUP BY variant",
        )
          .bind(experimentId, currentVersion, "impression")
          .all();
        const conversions = await env.DB.prepare(
          "SELECT variant, COUNT(*) as count FROM events WHERE experiment_id = ? AND experiment_version = ? AND type = ? GROUP BY variant",
        )
          .bind(experimentId, currentVersion, "conversion")
          .all();
        const stats = {
          A: { impressions: 0, conversions: 0, conversion_rate: 0 },
          B: { impressions: 0, conversions: 0, conversion_rate: 0 },
        };
        for (const row of impressions.results || []) {
          const v = row.variant as "A" | "B";
          stats[v].impressions = row.count as number;
        }
        for (const row of conversions.results || []) {
          const v = row.variant as "A" | "B";
          stats[v].conversions = row.count as number;
        }
        for (const v of ["A", "B"] as const) {
          stats[v].conversion_rate =
            stats[v].impressions > 0
              ? parseFloat(
                  ((stats[v].conversions / stats[v].impressions) * 100).toFixed(
                    2,
                  ),
                )
              : 0;
        }

        // Compute trends for the last 24 hours
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString();
        const trends = await env.DB.prepare(
          `SELECT 
             strftime('%Y-%m-%dT%H:00:00.000Z', created_at) as hour,
             COUNT(*) as count
           FROM events 
           WHERE experiment_id = ? 
             AND type = 'impression' 
             AND created_at >= ?
           GROUP BY hour
           ORDER BY hour ASC`,
        )
          .bind(experimentId, twentyFourHoursAgo)
          .all();

        return Response.json(
          {
            experiment_id: experimentId,
            variants: stats,
            trends: trends.results || [],
          },
          { headers: cors },
        );
      } else if (
        url.pathname.startsWith("/v1/experiments/") &&
        url.pathname.endsWith("/reset") &&
        request.method === "POST"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const parts = url.pathname.split("/");
        const experimentId = parts[3];
        // Check ownership
        const exp = await env.DB.prepare(
          "SELECT * FROM experiments WHERE id = ? AND project_id = ?",
        )
          .bind(experimentId, auth.projectId)
          .first();
        if (!exp)
          return Response.json(
            { error: "Experiment not found" },
            { status: 404, headers: cors },
          );
        // Delete all events AND increment version so existing visitor cookies become invalid
        await env.DB.prepare("DELETE FROM events WHERE experiment_id = ?")
          .bind(experimentId)
          .run();
        await env.DB.prepare(
          "UPDATE experiments SET version = version + 1, updated_at = ? WHERE id = ?",
        )
          .bind(new Date().toISOString(), experimentId)
          .run();
        return Response.json({ success: true }, { headers: cors });
      } else if (
        url.pathname.startsWith("/v1/experiments/") &&
        request.method === "PATCH"
      ) {
        const auth = await checkAuth(request, env, "read");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const parts = url.pathname.split("/");
        const experimentId = parts[3];
        const body = (await request.json()) as any;
        const { status } = body;
        // Check ownership
        const exp = await env.DB.prepare(
          "SELECT * FROM experiments WHERE id = ? AND project_id = ?",
        )
          .bind(experimentId, auth.projectId)
          .first();
        if (!exp)
          return Response.json(
            { error: "Experiment not found" },
            { status: 404, headers: cors },
          );
        await env.DB.prepare(
          "UPDATE experiments SET status = ?, updated_at = ? WHERE id = ?",
        )
          .bind(status, new Date().toISOString(), experimentId)
          .run();
        return Response.json({ success: true }, { headers: cors });
      } else if (url.pathname === "/v1/events" && request.method === "POST") {
        const auth = await checkAuth(request, env, "write");
        if (!auth)
          return Response.json(
            { error: "Unauthorized" },
            { status: 401, headers: cors },
          );
        const body = (await request.json()) as any;
        const { experiment_id, type, variant, visitor_id } = body;
        // Check experiment belongs to project
        const exp = await env.DB.prepare(
          "SELECT version FROM experiments WHERE id = ? AND project_id = ?",
        )
          .bind(experiment_id, auth.projectId)
          .first<{ version: number }>();
        if (!exp)
          return Response.json(
            { error: "Experiment not found" },
            { status: 400, headers: cors },
          );
        await env.DB.prepare(
          "INSERT OR IGNORE INTO events (id, experiment_id, experiment_version, visitor_id, variant, type) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(
            generateUUID(),
            experiment_id,
            exp.version,
            visitor_id || null,
            variant,
            type,
          )
          .run();
        return Response.json({ success: true }, { headers: cors });
      } else if (url.pathname === "/health") {
        return Response.json({ status: "ok" }, { headers: cors });
      } else {
        return new Response("Not Found", { status: 404, headers: cors });
      }
    } catch (error: any) {
      console.error("Error:", error.message);
      return Response.json(
        { error: error.message },
        { status: 500, headers: cors },
      );
    }
  },
};
