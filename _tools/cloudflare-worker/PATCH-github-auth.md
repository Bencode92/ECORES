# Patch : ajouter auth `X-Auth-Token` sur la route `/github/`

Aujourd'hui ton proxy expose `/github/<owner>/<repo>/contents/<path>` **sans authentification**.
N'importe qui qui connaît l'URL du Worker peut lire/écrire tous tes repos via l'API GitHub.

Ce patch ajoute une vérif `X-Auth-Token` (même mécanisme que `/bordereaux/`).

## Étape 1 — Ajouter le secret côté Cloudflare

Dans le dashboard Worker → **Settings** → **Variables and Secrets** → **Add variable** :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `GITHUB_PROXY_TOKEN` | Une chaîne aléatoire de 32 chars (ex: `openssl rand -hex 16`) |

Garde cette valeur, tu vas la coller dans la page ECORES.

> Tu peux aussi réutiliser `BORDEREAUX_AUTH_TOKEN` si tu veux 1 seul token pour tout — dans ce cas, dans le code ci-dessous remplace `env.GITHUB_PROXY_TOKEN` par `env.BORDEREAUX_AUTH_TOKEN`.

## Étape 2 — Modifier le code du Worker

**Trouve ce bloc** dans `worker.js` :

```js
if (url.pathname.startsWith("/github/")) {
  let ghUrl;
  const afterGithub = url.pathname.replace("/github/", "");
  if (afterGithub.startsWith("contents/")) {
    ghUrl = "https://api.github.com/repos/Bencode92/studyforge/" + afterGithub;
  } else {
    ghUrl = "https://api.github.com/repos/" + afterGithub;
  }
  const ghHeaders = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": "token " + env.GITHUB_TOKEN,
    "Content-Type": "application/json",
    "User-Agent": "StructBoard-Worker"
  };
  let resp;
  if (request.method === "GET") resp = await fetch(ghUrl, { headers: ghHeaders });
  else if (request.method === "PUT") resp = await fetch(ghUrl, { method: "PUT", headers: ghHeaders, body: await request.text() });
  else if (request.method === "DELETE") resp = await fetch(ghUrl, { method: "DELETE", headers: ghHeaders, body: await request.text() });
  else return json({ error: "Method not allowed" }, 405);
  return new Response(await resp.text(), { status: resp.status, headers: JSON_H });
}
```

**Remplace par** (les 5 lignes ajoutées sont marquées `// + AUTH`) :

```js
if (url.pathname.startsWith("/github/")) {
  // + AUTH : refuser sans X-Auth-Token valide
  const ghProxyToken = request.headers.get("X-Auth-Token");
  if (!env.GITHUB_PROXY_TOKEN) return json({ error: "GITHUB_PROXY_TOKEN not configured" }, 500);
  if (ghProxyToken !== env.GITHUB_PROXY_TOKEN) return json({ error: "Unauthorized — X-Auth-Token missing or invalid" }, 401);

  let ghUrl;
  const afterGithub = url.pathname.replace("/github/", "");
  if (afterGithub.startsWith("contents/")) {
    ghUrl = "https://api.github.com/repos/Bencode92/studyforge/" + afterGithub;
  } else {
    ghUrl = "https://api.github.com/repos/" + afterGithub;
  }
  const ghHeaders = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": "token " + env.GITHUB_TOKEN,
    "Content-Type": "application/json",
    "User-Agent": "StructBoard-Worker"
  };
  let resp;
  if (request.method === "GET") resp = await fetch(ghUrl, { headers: ghHeaders });
  else if (request.method === "PUT") resp = await fetch(ghUrl, { method: "PUT", headers: ghHeaders, body: await request.text() });
  else if (request.method === "DELETE") resp = await fetch(ghUrl, { method: "DELETE", headers: ghHeaders, body: await request.text() });
  else return json({ error: "Method not allowed" }, 405);
  return new Response(await resp.text(), { status: resp.status, headers: JSON_H });
}
```

CORS : pas besoin de modifier, `X-Auth-Token` est déjà dans `Access-Control-Allow-Headers` (ligne 7 de ton Worker).

## Étape 3 — Déployer

Save & Deploy depuis le dashboard Cloudflare (ou `wrangler deploy`).

## Étape 4 — Tester depuis terminal

```bash
# Sans token : 401 attendu
curl -i "https://<ton-proxy>/github/Bencode92/ECORES"
# → HTTP/2 401  {"error":"Unauthorized — X-Auth-Token missing or invalid"}

# Avec token : OK
curl -i -H "X-Auth-Token: TON_TOKEN" \
  "https://<ton-proxy>/github/Bencode92/ECORES"
# → HTTP/2 200  { full_name: "Bencode92/ECORES", ... }
```

## Étape 5 — Activer côté page ECORES

Sur https://bencode92.github.io/ECORES/questionnaire-2026.html → ⚙️ → champ **Auth token (X-Auth-Token)** apparaît → coller la valeur du `GITHUB_PROXY_TOKEN`.

C'est tout. Désormais quiconque appelle `/github/...` sans le bon token reçoit 401.

## Optionnel : restreindre aux repos ECORES + studyforge

Si tu veux pousser la sécurité plus loin, tu peux whitelist les owner/repos autorisés :

```js
if (url.pathname.startsWith("/github/")) {
  // + AUTH
  const ghProxyToken = request.headers.get("X-Auth-Token");
  if (!env.GITHUB_PROXY_TOKEN) return json({ error: "GITHUB_PROXY_TOKEN not configured" }, 500);
  if (ghProxyToken !== env.GITHUB_PROXY_TOKEN) return json({ error: "Unauthorized" }, 401);

  // + WHITELIST : seuls ces repos sont accessibles
  const ALLOWED = ["Bencode92/ECORES", "Bencode92/studyforge"];
  const afterGithub = url.pathname.replace("/github/", "");
  const repoMatch = afterGithub.match(/^([^\/]+\/[^\/]+)/);
  if (afterGithub.startsWith("contents/")) {
    // ancien format pour studyforge — toujours autorisé
  } else if (!repoMatch || !ALLOWED.includes(repoMatch[1])) {
    return json({ error: "Repo not in allowlist" }, 403);
  }
  // ...
}
```
