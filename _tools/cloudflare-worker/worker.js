/**
 * ECORES — Worker Cloudflare de sync GitHub
 *
 * Rôle : proxy authentifié entre la page (questionnaire-2026.html) et l'API GitHub.
 * Le token GitHub est stocké comme secret Cloudflare (jamais exposé côté navigateur).
 *
 * Endpoints :
 *   GET  /api/state?file=kanban         → renvoie kanban-data.json depuis le repo
 *   GET  /api/state?file=library        → renvoie library-data.json depuis le repo
 *   POST /api/state?file=kanban         → met à jour kanban-data.json (commit)
 *   POST /api/state?file=library        → met à jour library-data.json (commit)
 *
 * Auth simple : header `X-Sync-Secret` doit matcher la variable SYNC_SECRET.
 *
 * Variables Cloudflare à configurer (en secret) :
 *   - GITHUB_TOKEN  : Personal Access Token GitHub avec scope `repo` ou `contents:write`
 *   - SYNC_SECRET   : mot de passe partagé que la page envoie pour s'authentifier
 *   - REPO_OWNER    : ex. "Bencode92"
 *   - REPO_NAME     : ex. "ECORES"
 *   - REPO_BRANCH   : ex. "main"
 *   - ALLOWED_ORIGIN: ex. "https://bencode92.github.io" (CORS)
 */

const FILE_PATHS = {
  kanban: '_tools/kanban-data.json',
  library: '_tools/library-data.json',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Secret',
      'Access-Control-Max-Age': '86400',
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Healthcheck
    if (url.pathname === '/api/health') {
      return json({ ok: true, repo: `${env.REPO_OWNER}/${env.REPO_NAME}` }, corsHeaders);
    }

    // Auth check (skip for OPTIONS already handled)
    const secret = request.headers.get('X-Sync-Secret');
    if (!secret || secret !== env.SYNC_SECRET) {
      return json({ error: 'Unauthorized — header X-Sync-Secret missing or invalid' }, corsHeaders, 401);
    }

    // Sync endpoint
    if (url.pathname === '/api/state') {
      const fileKey = url.searchParams.get('file');
      const path = FILE_PATHS[fileKey];
      if (!path) {
        return json({ error: 'file param must be "kanban" or "library"' }, corsHeaders, 400);
      }

      if (request.method === 'GET') {
        return await readFromGitHub(env, path, corsHeaders);
      }

      if (request.method === 'POST') {
        const body = await request.text();
        // Validate JSON
        try {
          JSON.parse(body);
        } catch (e) {
          return json({ error: 'invalid JSON body' }, corsHeaders, 400);
        }
        return await writeToGitHub(env, path, body, corsHeaders);
      }

      return json({ error: 'method not allowed' }, corsHeaders, 405);
    }

    return json({ error: 'not found' }, corsHeaders, 404);
  },
};

async function readFromGitHub(env, path, corsHeaders) {
  const ghUrl = `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${path}?ref=${env.REPO_BRANCH || 'main'}`;
  const res = await fetch(ghUrl, {
    headers: ghHeaders(env),
  });
  if (res.status === 404) {
    return json({ content: null, sha: null, message: 'file does not exist yet' }, corsHeaders);
  }
  if (!res.ok) {
    return json({ error: 'github read failed', status: res.status, detail: await res.text() }, corsHeaders, 502);
  }
  const data = await res.json();
  // Decode base64
  const content = atob(data.content.replace(/\n/g, ''));
  return new Response(content, {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Sha': data.sha },
  });
}

async function writeToGitHub(env, path, body, corsHeaders) {
  const branch = env.REPO_BRANCH || 'main';
  const ghUrl = `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${path}`;

  // Get current SHA (required for update)
  let sha = null;
  const getRes = await fetch(`${ghUrl}?ref=${branch}`, { headers: ghHeaders(env) });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  // Encode content as base64 (UTF-8 safe)
  const contentB64 = btoa(unescape(encodeURIComponent(body)));

  const putBody = {
    message: `chore(sync): update ${path} via Cloudflare Worker`,
    content: contentB64,
    branch,
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(ghUrl, {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    return json({ error: 'github write failed', status: putRes.status, detail: await putRes.text() }, corsHeaders, 502);
  }
  const result = await putRes.json();
  return json({ ok: true, commit: result.commit?.sha, path }, corsHeaders);
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ECORES-Sync-Worker',
  };
}

function json(obj, corsHeaders, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
