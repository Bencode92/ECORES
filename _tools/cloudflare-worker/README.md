# Cloudflare Worker — Sync ECORES ↔ GitHub

Permet à la page `questionnaire-2026.html` de **lire et écrire** directement dans le repo GitHub
(`_tools/kanban-data.json` et `_tools/library-data.json`) via un Worker Cloudflare authentifié.

## Architecture

```
Page (https://bencode92.github.io/ECORES/questionnaire-2026.html)
   │
   │ POST /api/state?file=kanban   (header X-Sync-Secret + body JSON)
   ▼
Cloudflare Worker (https://ecores-sync.<ton-compte>.workers.dev)
   │  - vérifie X-Sync-Secret
   │  - lit GITHUB_TOKEN depuis ses secrets (jamais exposé)
   ▼
GitHub API → commit dans _tools/kanban-data.json
   │
   ▼
GH Pages rebuild → la page voit la nouvelle version au prochain GET
```

Ton token GitHub n'est **jamais visible côté navigateur** : il vit uniquement dans les secrets Cloudflare.

---

## 1. Déployer le Worker

### Option A — Dashboard Cloudflare (le plus simple)

1. Va sur https://dash.cloudflare.com/ → **Workers & Pages** → **Create** → **Create Worker**
2. Donne-lui un nom (ex. `ecores-sync`)
3. Édite le code → colle le contenu de `worker.js`
4. **Save and Deploy**

### Option B — wrangler CLI

```bash
npm install -g wrangler
wrangler login
cd _tools/cloudflare-worker
wrangler deploy worker.js --name ecores-sync
```

---

## 2. Configurer les secrets et variables

Dans ton Worker → **Settings** → **Variables and Secrets** → **Add variable** :

### Secrets (chiffrés, jamais visibles dans la console)

| Variable | Valeur | Comment obtenir |
|---|---|---|
| `GITHUB_TOKEN` | `ghp_xxxxxx...` | https://github.com/settings/tokens → Fine-grained → permissions `Contents: Read and write` sur le repo `Bencode92/ECORES` |
| `SYNC_SECRET` | une chaîne aléatoire de 32 chars | À générer toi-même : `openssl rand -hex 16` |

### Variables (en clair, pas sensibles)

| Variable | Valeur |
|---|---|
| `REPO_OWNER` | `Bencode92` |
| `REPO_NAME` | `ECORES` |
| `REPO_BRANCH` | `main` |
| `ALLOWED_ORIGIN` | `https://bencode92.github.io` |

---

## 3. Tester le Worker

Une fois déployé, l'URL ressemble à `https://ecores-sync.benoit.workers.dev` (à adapter).

```bash
# Healthcheck (pas d'auth)
curl https://ecores-sync.benoit.workers.dev/api/health
# → {"ok":true,"repo":"Bencode92/ECORES"}

# Read kanban (avec ton SYNC_SECRET)
curl -H "X-Sync-Secret: TON_SECRET" \
  "https://ecores-sync.benoit.workers.dev/api/state?file=kanban"

# Write kanban
curl -X POST \
  -H "X-Sync-Secret: TON_SECRET" \
  -H "Content-Type: application/json" \
  -d '[{"id":"test","title":"Hello","status":"backlog"}]' \
  "https://ecores-sync.benoit.workers.dev/api/state?file=kanban"
```

Si tu reçois `{"ok":true,"commit":"..."}` → ça marche, regarde dans le repo, le fichier
`_tools/kanban-data.json` a été commit.

---

## 4. Configurer la page

Dans la page `questionnaire-2026.html`, clique sur l'icône ⚙️ (à venir dans le header) →
remplis :
- **Worker URL** : `https://ecores-sync.benoit.workers.dev`
- **Sync secret** : la chaîne du `SYNC_SECRET`

Ces 2 valeurs sont stockées dans `localStorage` de ton navigateur (par utilisateur, par device).
Tu peux les partager à ton équipe pour qu'ils utilisent le même Worker.

---

## 5. Sécurité

- Le `GITHUB_TOKEN` ne quitte JAMAIS le Worker (Cloudflare le chiffre).
- Le `SYNC_SECRET` est partagé entre Worker et page. Quiconque a ce secret peut écrire dans le repo via le Worker → ne le mets pas en public, partage-le uniquement avec ton équipe.
- L'`ALLOWED_ORIGIN` empêche les autres sites de faire des requêtes (CORS).
- Si tu suspectes une fuite du `SYNC_SECRET` : régénère-le côté Cloudflare ET côté page.

## 6. Coûts

Cloudflare Workers : **100 000 requêtes/jour gratuites**. Largement suffisant pour ce cas d'usage
(quelques dizaines de saves par jour max).

GitHub API : 5000 requêtes/heure pour un token authentifié. Pareil, largement OK.
