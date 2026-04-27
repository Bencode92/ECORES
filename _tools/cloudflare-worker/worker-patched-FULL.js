var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CORS_BASE = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token, X-User-Email",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
var JSON_H = { ...CORS_BASE, "Content-Type": "application/json" };
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_H });
}
__name(json, "json");
async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function audit(env, { action, bordereauId = null, userEmail = null, ip = null, details = null }) {
  const ipHash = ip ? await sha256(ip + (env.AUDIT_SALT || "cameleons")) : null;
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (action, bordereau_id, user_email, ip_hash, details_json) VALUES (?, ?, ?, ?, ?)"
    ).bind(action, bordereauId, userEmail, ipHash, details ? JSON.stringify(details) : null).run();
  } catch (e) {
    console.error("audit fail", e);
  }
}
__name(audit, "audit");
function requireAuth(request, env) {
  const token = request.headers.get("X-Auth-Token");
  if (!env.BORDEREAUX_AUTH_TOKEN) return { ok: false, err: json({ error: "BORDEREAUX_AUTH_TOKEN not configured" }, 500) };
  if (token !== env.BORDEREAUX_AUTH_TOKEN) return { ok: false, err: json({ error: "Unauthorized" }, 401) };
  return { ok: true, user: request.headers.get("X-User-Email") || "unknown" };
}
__name(requireAuth, "requireAuth");
function getIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || null;
}
__name(getIp, "getIp");
function normalizeName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeName, "normalizeName");
function levenshtein(a, b) {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const prev = new Array(m + 1);
  const cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= m; j++) prev[j] = cur[j];
  }
  return prev[m];
}
__name(levenshtein, "levenshtein");
function similarityScore(a, b) {
  const an = normalizeName(a);
  const bn = normalizeName(b);
  if (!an || !bn) return 0;
  const maxLen = Math.max(an.length, bn.length);
  const dist = levenshtein(an, bn);
  return 1 - dist / maxLen;
}
__name(similarityScore, "similarityScore");
function markCurrentAvenants(contrats) {
  if (!contrats || contrats.length === 0) return [];
  const numeroOf = /* @__PURE__ */ __name((c) => String(c.numero_contrat ?? c.numero ?? ""), "numeroOf");
  const maxByNumero = /* @__PURE__ */ new Map();
  for (const c of contrats) {
    const k = numeroOf(c);
    if (!k) continue;
    const av = c.avenant || 0;
    const prev = maxByNumero.get(k);
    if (prev === void 0 || av > prev) maxByNumero.set(k, av);
  }
  return contrats.map((c) => ({
    ...c,
    is_current: (c.avenant || 0) === maxByNumero.get(numeroOf(c))
  }));
}
__name(markCurrentAvenants, "markCurrentAvenants");
function groupAvenants(contrats) {
  if (!contrats || contrats.length === 0) return [];
  const numeroOf = /* @__PURE__ */ __name((c) => String(c.numero_contrat ?? c.numero ?? ""), "numeroOf");
  const startOf = /* @__PURE__ */ __name((c) => c.date_debut ?? c.debut ?? null, "startOf");
  const endOf = /* @__PURE__ */ __name((c) => c.date_fin ?? c.fin ?? null, "endOf");
  const clientOf = /* @__PURE__ */ __name((c) => c.client ?? null, "clientOf");
  const groups = /* @__PURE__ */ new Map();
  for (const c of contrats) {
    const k = numeroOf(c);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const out = [];
  for (const [numero, list] of groups) {
    list.sort((a, b) => {
      const av = (a.avenant || 0) - (b.avenant || 0);
      if (av !== 0) return av;
      return String(startOf(a) || "").localeCompare(String(startOf(b) || ""));
    });
    const hasIncomplete = list.some((c) => !startOf(c) || !endOf(c));
    let coherence = list.length === 1 ? "single" : "chained";
    const gaps = [];
    if (hasIncomplete) {
      coherence = "incomplete";
    } else if (list.length > 1) {
      const sorted = list.slice().sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b))));
      for (let i = 0; i < sorted.length - 1; i++) {
        const fin2 = endOf(sorted[i]);
        const nextDebut = startOf(sorted[i + 1]);
        if (!fin2 || !nextDebut) continue;
        const dFin = /* @__PURE__ */ new Date(fin2 + "T00:00:00Z");
        const dNext = /* @__PURE__ */ new Date(nextDebut + "T00:00:00Z");
        const dayDiff = Math.round((dNext - dFin) / 864e5);
        if (dayDiff < 0) {
          coherence = coherence === "gap" ? "gap" : "overlap";
        } else if (dayDiff > 1) {
          coherence = "gap";
          gaps.push({ from: fin2, to: nextDebut, days: dayDiff - 1 });
        }
      }
    }
    const debuts = list.map(startOf).filter(Boolean).sort();
    const debut = debuts[0] || null;
    const sortedByDebut = list.slice().sort((a, b) => {
      const sa = startOf(a) || "";
      const sb = startOf(b) || "";
      return String(sb).localeCompare(String(sa));
    });
    const lastAvenant = sortedByDebut[0];
    const lastFin = endOf(lastAvenant);
    let fin;
    if (lastFin === null || lastFin === void 0 || lastFin === "") {
      fin = null;
    } else {
      const fins = list.map(endOf).filter(Boolean).sort();
      fin = fins[fins.length - 1] || null;
    }
    const principal = list[list.length - 1];
    out.push({
      numero,
      client: clientOf(principal) ?? clientOf(list[0]),
      debut,
      fin,
      nbAvenants: list.length,
      coherence,
      gaps,
      avenants: list.map((c) => ({
        avenant: c.avenant || 0,
        client: clientOf(c),
        debut: startOf(c),
        fin: endOf(c)
      }))
    });
  }
  out.sort((a, b) => {
    const aActive = !a.fin ? 0 : 1;
    const bActive = !b.fin ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return String(b.fin || "").localeCompare(String(a.fin || ""));
  });
  return out;
}
__name(groupAvenants, "groupAvenants");
async function handleBordereaux(request, env, url) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.err;
  const user = auth.user;
  const ip = getIp(request);
  const sub = url.pathname.replace(/^\/bordereaux\/?/, "");
  const method = request.method;
  if (sub === "interimaires/import" && method === "POST") {
    const { rows, csvRaw, filename, errors } = await request.json();
    if (!Array.isArray(rows)) return json({ error: "rows requis (array)" }, 400);
    const stats = { intermediaires: { inserted: 0, updated: 0 }, contrats: { inserted: 0, updated: 0 } };
    const events = {
      new_intermediaires: [],
      new_contrats: [],
      new_avenants: [],
      updated: [],
      unchanged: 0
    };
    for (const r of rows) {
      if (!r.nom || !r.prenom) continue;
      const fullNorm = normalizeName(`${r.prenom} ${r.nom}`);
      const existing = await env.DB.prepare(
        "SELECT id FROM intermediaires WHERE nom = ? AND prenom = ?"
      ).bind(r.nom, r.prenom).first();
      let intermId;
      let isNewInterm = false;
      if (existing) {
        intermId = existing.id;
        await env.DB.prepare(
          "UPDATE intermediaires SET matricule_notion=?, full_name_norm=?, updated_at=datetime('now') WHERE id=?"
        ).bind(r.matricule || null, fullNorm, intermId).run();
        stats.intermediaires.updated++;
      } else {
        const res = await env.DB.prepare(
          "INSERT INTO intermediaires (nom, prenom, matricule_notion, full_name_norm) VALUES (?, ?, ?, ?)"
        ).bind(r.nom, r.prenom, r.matricule || null, fullNorm).run();
        intermId = res.meta.last_row_id;
        stats.intermediaires.inserted++;
        isNewInterm = true;
        events.new_intermediaires.push({ id: intermId, nom: r.nom, prenom: r.prenom });
      }
      if (r.numero) {
        const ave = r.avenant || 0;
        const existingC = await env.DB.prepare(
          "SELECT id, client, date_debut, date_fin FROM contrats WHERE intermediaire_id=? AND numero_contrat=? AND avenant=?"
        ).bind(intermId, r.numero, ave).first();
        if (existingC) {
          const changed = [];
          if ((existingC.client || null) !== (r.client || null)) changed.push("client");
          if ((existingC.date_debut || null) !== (r.debut || null)) changed.push("debut");
          if ((existingC.date_fin || null) !== (r.fin || null)) changed.push("fin");
          if (changed.length === 0) {
            events.unchanged++;
          } else {
            await env.DB.prepare(
              "UPDATE contrats SET client=?, date_debut=?, date_fin=?, updated_at=datetime('now') WHERE id=?"
            ).bind(r.client || null, r.debut || null, r.fin || null, existingC.id).run();
            stats.contrats.updated++;
            events.updated.push({
              nom: r.nom,
              prenom: r.prenom,
              numero: r.numero,
              avenant: ave,
              client: r.client,
              changed,
              before: { client: existingC.client, debut: existingC.date_debut, fin: existingC.date_fin },
              after: { client: r.client, debut: r.debut, fin: r.fin }
            });
          }
        } else {
          const sameNumero = await env.DB.prepare(
            "SELECT MAX(avenant) AS max_av FROM contrats WHERE intermediaire_id=? AND numero_contrat=?"
          ).bind(intermId, r.numero).first();
          const previousMaxAv = sameNumero?.max_av;
          await env.DB.prepare(
            "INSERT INTO contrats (intermediaire_id, numero_contrat, avenant, client, date_debut, date_fin) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(intermId, r.numero, ave, r.client || null, r.debut || null, r.fin || null).run();
          stats.contrats.inserted++;
          if (previousMaxAv !== null && previousMaxAv !== void 0) {
            events.new_avenants.push({
              nom: r.nom,
              prenom: r.prenom,
              numero: r.numero,
              oldAvenant: previousMaxAv,
              newAvenant: ave,
              client: r.client,
              debut: r.debut,
              fin: r.fin
            });
          } else {
            events.new_contrats.push({
              nom: r.nom,
              prenom: r.prenom,
              numero: r.numero,
              avenant: ave,
              client: r.client,
              debut: r.debut,
              fin: r.fin,
              isNewInterm
            });
          }
        }
      }
    }
    let r2Key = null;
    if (csvRaw) {
      const now = /* @__PURE__ */ new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const d = String(now.getUTCDate()).padStart(2, "0");
      const ts = now.toISOString().replace(/[:.]/g, "-");
      const safe = (filename || "import.csv").replace(/[^A-Za-z0-9._-]/g, "_");
      r2Key = `imports/${y}/${m}/${d}/${ts}-${safe}`;
      const bytes = Uint8Array.from(atob(csvRaw), (c) => c.charCodeAt(0));
      await env.BUCKET.put(r2Key, bytes, {
        httpMetadata: { contentType: "text/csv; charset=utf-8" }
      });
    }
    const snapRes = await env.DB.prepare(`
      INSERT INTO import_snapshots
      (filename, r2_key, nb_lignes_csv,
       nb_inter_inserted, nb_inter_updated,
       nb_contrats_inserted, nb_contrats_updated,
       user_email, errors_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      filename || null,
      r2Key,
      rows.length,
      stats.intermediaires.inserted,
      stats.intermediaires.updated,
      stats.contrats.inserted,
      stats.contrats.updated,
      user,
      errors && errors.length ? JSON.stringify(errors) : null
    ).run();
    await audit(env, { action: "import_intermediaires", userEmail: user, ip, details: { ...stats, snapshotId: snapRes.meta.last_row_id } });
    return json({ ok: true, stats, snapshotId: snapRes.meta.last_row_id, events });
  }
  if (sub === "interimaires/snapshots" && method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, import_date, filename, nb_lignes_csv,
              nb_inter_inserted, nb_inter_updated,
              nb_contrats_inserted, nb_contrats_updated,
              user_email, r2_key IS NOT NULL as has_csv
       FROM import_snapshots
       ORDER BY import_date DESC
       LIMIT 500`
    ).all();
    return json({ snapshots: results });
  }
  if (/^interimaires\/snapshot\/\d+\/download$/.test(sub) && method === "GET") {
    const id = parseInt(sub.split("/")[2], 10);
    const row = await env.DB.prepare(
      "SELECT r2_key, filename FROM import_snapshots WHERE id = ?"
    ).bind(id).first();
    if (!row) return json({ error: "Snapshot introuvable" }, 404);
    if (!row.r2_key) return json({ error: "Pas de CSV archiv\xE9 pour ce snapshot" }, 404);
    const obj = await env.BUCKET.get(row.r2_key);
    if (!obj) return json({ error: "CSV introuvable en R2" }, 404);
    await audit(env, { action: "snapshot_download", userEmail: user, ip, details: { id } });
    return new Response(obj.body, {
      headers: {
        ...CORS_BASE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${row.filename || "import.csv"}"`
      }
    });
  }
  if (sub === "interimaires/match" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    const qNom = url.searchParams.get("nom") || "";
    const qPrenom = url.searchParams.get("prenom") || "";
    const date = url.searchParams.get("date");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 20);
    const { results } = await env.DB.prepare(
      "SELECT id, nom, prenom, matricule_notion, full_name_norm FROM intermediaires"
    ).all();
    const scored = results.map((r) => {
      const sFull = similarityScore(q, r.full_name_norm);
      const sFullSwap = qNom && qPrenom ? similarityScore(`${qNom} ${qPrenom}`, r.full_name_norm) : 0;
      const sNom = qNom ? similarityScore(qNom, r.nom) : 0;
      const sPrenom = qPrenom ? similarityScore(qPrenom, r.prenom) : 0;
      const sNomX = qNom ? similarityScore(qNom, r.prenom) : 0;
      const sPrenomX = qPrenom ? similarityScore(qPrenom, r.nom) : 0;
      const score = Math.max(
        sFull,
        sFullSwap,
        sNom * 0.85,
        sPrenom * 0.85,
        sNomX * 0.85,
        sPrenomX * 0.85
      );
      return { ...r, score, sFull, sFullSwap, sNom, sPrenom, sNomX, sPrenomX };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);
    const out = [];
    for (const t of top) {
      const r = await env.DB.prepare(
        `SELECT numero_contrat, avenant, client, date_debut, date_fin
         FROM contrats WHERE intermediaire_id = ?
         ORDER BY
           CASE WHEN date_fin IS NULL THEN 0 ELSE 1 END,
           date_fin DESC,
           date_debut DESC`
      ).bind(t.id).all();
      const contrats = markCurrentAvenants(r.results);
      const contratGroupes = groupAvenants(r.results);
      out.push({
        id: t.id,
        nom: t.nom,
        prenom: t.prenom,
        matricule: t.matricule_notion,
        score: Math.round(t.score * 100) / 100,
        scoreFull: Math.round(t.sFull * 100) / 100,
        scoreFullSwap: Math.round(t.sFullSwap * 100) / 100,
        scoreNom: Math.round(t.sNom * 100) / 100,
        scorePrenom: Math.round(t.sPrenom * 100) / 100,
        scoreNomX: Math.round(t.sNomX * 100) / 100,
        scorePrenomX: Math.round(t.sPrenomX * 100) / 100,
        contrats,
        contrat_groupes: contratGroupes
      });
    }
    await audit(env, { action: "match_intermediaire", userEmail: user, ip, details: { q, date, found: out.length } });
    return json({ query: q, date, matches: out });
  }
  if (sub === "interimaires/list" && method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 1e3);
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.nom, i.prenom, i.matricule_notion,
              COUNT(c.id) as nb_contrats,
              MAX(c.date_fin) as derniere_fin,
              json_group_array(
                CASE WHEN c.id IS NOT NULL THEN
                  json_object(
                    'numero',  c.numero_contrat,
                    'avenant', c.avenant,
                    'client',  c.client,
                    'debut',   c.date_debut,
                    'fin',     c.date_fin
                  )
                END
              ) as contrats_json
       FROM intermediaires i
       LEFT JOIN contrats c ON c.intermediaire_id = i.id
       GROUP BY i.id
       ORDER BY i.nom, i.prenom
       LIMIT ?`
    ).bind(limit).all();
    const clean = results.map((r) => {
      let contrats = [];
      try {
        contrats = JSON.parse(r.contrats_json || "[]").filter(Boolean);
        contrats.sort((a, b) => (b.fin || b.debut || "").localeCompare(a.fin || a.debut || ""));
      } catch {
      }
      contrats = markCurrentAvenants(contrats);
      const contratGroupes = groupAvenants(contrats);
      return {
        id: r.id,
        nom: r.nom,
        prenom: r.prenom,
        matricule_notion: r.matricule_notion,
        nb_contrats: r.nb_contrats,
        derniere_fin: r.derniere_fin,
        contrats,
        contrat_groupes: contratGroupes
      };
    });
    return json({ intermediaires: clean });
  }
  if (sub.startsWith("interimaires/") && method === "DELETE") {
    const id = parseInt(sub.slice("interimaires/".length), 10);
    if (!id) return json({ error: "id invalide" }, 400);
    await env.DB.prepare("DELETE FROM intermediaires WHERE id = ?").bind(id).run();
    await audit(env, { action: "delete_intermediaire", userEmail: user, ip, details: { id } });
    return json({ ok: true });
  }
  if (sub === "batch/check-hashes" && method === "POST") {
    const { hashes = [], filenames = [] } = await request.json();
    const out = { knownByHash: [], knownByFilename: [], unknownHashes: [] };
    if (Array.isArray(hashes) && hashes.length > 0) {
      const placeholders = hashes.map(() => "?").join(",");
      const { results } = await env.DB.prepare(
        `SELECT id, file_hash, nom, prenom, semaine_du, status, original_filename
         FROM bordereaux WHERE file_hash IN (${placeholders})`
      ).bind(...hashes).all();
      const knownMap = new Map(results.map((r) => [r.file_hash, r]));
      for (const h of hashes) {
        if (knownMap.has(h)) {
          const r = knownMap.get(h);
          out.knownByHash.push({
            hash: h,
            bordereauId: r.id,
            nom: r.nom,
            prenom: r.prenom,
            semaineDu: r.semaine_du,
            status: r.status,
            filename: r.original_filename
          });
        } else {
          out.unknownHashes.push(h);
        }
      }
    }
    if (Array.isArray(filenames) && filenames.length > 0) {
      const placeholders = filenames.map(() => "?").join(",");
      const { results } = await env.DB.prepare(
        `SELECT id, file_hash, nom, prenom, semaine_du, status, original_filename
         FROM bordereaux WHERE original_filename IN (${placeholders})`
      ).bind(...filenames).all();
      const knownMap = new Map(results.map((r) => [r.original_filename, r]));
      for (const f of filenames) {
        if (knownMap.has(f)) {
          const r = knownMap.get(f);
          out.knownByFilename.push({
            filename: f,
            bordereauId: r.id,
            nom: r.nom,
            prenom: r.prenom,
            semaineDu: r.semaine_du,
            status: r.status,
            hash: r.file_hash
          });
        }
      }
    }
    return json(out);
  }
  if (sub === "save" && method === "POST") {
    const body = await request.json();
    const {
      nom,
      prenom,
      matricule,
      client,
      contratDefaut,
      semaineDu,
      semaineAu,
      totalHt,
      totalHn,
      jours,
      csvPld,
      source,
      pdfBase64,
      pdfMediaType,
      fileHash,
      originalFilename
    } = body;
    if (!nom || !prenom || !semaineDu) return json({ error: "nom/prenom/semaineDu requis" }, 400);
    if (fileHash) {
      const existing = await env.DB.prepare(
        "SELECT id, nom, prenom, semaine_du, status FROM bordereaux WHERE file_hash = ? LIMIT 1"
      ).bind(fileHash).first();
      if (existing) {
        return json({
          error: "duplicate",
          message: `Fichier d\xE9j\xE0 archiv\xE9 (id=${existing.id}, ${existing.prenom} ${existing.nom}, semaine ${existing.semaine_du})`,
          duplicate: true,
          existingId: existing.id,
          existing
        }, 409);
      }
    }
    let pdfKey = null;
    if (pdfBase64) {
      const year = semaineDu.slice(0, 4);
      const month = semaineDu.slice(5, 7);
      const safe = /* @__PURE__ */ __name((s) => String(s).replace(/[^A-Za-z0-9-]/g, "_"), "safe");
      const ext = (pdfMediaType || "").includes("pdf") ? "pdf" : "jpg";
      pdfKey = `bordereaux/${year}/${month}/${safe(nom)}-${safe(prenom)}-${semaineDu}-${Date.now()}.${ext}`;
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      await env.BUCKET.put(pdfKey, bytes, {
        httpMetadata: { contentType: pdfMediaType || "application/octet-stream" }
      });
    }
    const res = await env.DB.prepare(`
      INSERT INTO bordereaux
      (nom, prenom, matricule, client, contrat_defaut, semaine_du, semaine_au,
       total_ht, total_hn, jours_json, csv_pld, pdf_r2_key, source, validated_by, file_hash, original_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      nom,
      prenom,
      matricule || null,
      client || null,
      contratDefaut || null,
      semaineDu,
      semaineAu || semaineDu,
      totalHt || 0,
      totalHn || 0,
      JSON.stringify(jours || []),
      csvPld || null,
      pdfKey,
      source || "manual",
      user,
      fileHash || null,
      originalFilename || null
    ).run();
    const id = res.meta.last_row_id;
    await audit(env, { action: "create", bordereauId: id, userEmail: user, ip, details: { nom, prenom, semaineDu } });
    return json({ ok: true, id, pdfKey });
  }
  if (sub === "list" && method === "GET") {
    const params = url.searchParams;
    const nom = params.get("nom");
    const prenom = params.get("prenom");
    const from = params.get("from");
    const to = params.get("to");
    let query = "SELECT id, nom, prenom, client, semaine_du, semaine_au, total_ht, total_hn, source, validated_by, created_at, status, exported, exported_at, export_batch_id, reviewed_by, reviewed_at, file_hash, pdf_r2_key FROM bordereaux WHERE 1=1";
    const binds = [];
    if (nom) {
      query += " AND nom = ?";
      binds.push(nom);
    }
    if (prenom) {
      query += " AND prenom = ?";
      binds.push(prenom);
    }
    if (from) {
      query += " AND semaine_du >= ?";
      binds.push(from);
    }
    if (to) {
      query += " AND semaine_du <= ?";
      binds.push(to);
    }
    query += " ORDER BY created_at DESC LIMIT 500";
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    await audit(env, { action: "read", userEmail: user, ip, details: { filter: { nom, prenom, from, to }, count: results.length } });
    return json({ bordereaux: results });
  }
  if (sub.startsWith("get/") && method === "GET") {
    const id = parseInt(sub.slice(4), 10);
    const b = await env.DB.prepare("SELECT * FROM bordereaux WHERE id = ?").bind(id).first();
    if (!b) return json({ error: "Not found" }, 404);
    await audit(env, { action: "read", bordereauId: id, userEmail: user, ip });
    return json(b);
  }
  if (sub.startsWith("pdf/") && method === "GET") {
    const key = sub.slice(4);
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: "PDF not found" }, 404);
    return new Response(obj.body, {
      headers: {
        ...CORS_BASE,
        "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600"
      }
    });
  }
  if (sub === "batch-fetch" && method === "POST") {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return json({ bordereaux: [] });
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT id, nom, prenom, matricule, client, contrat_defaut, semaine_du, semaine_au,
              jours_json, status, exported
       FROM bordereaux WHERE id IN (${placeholders})
       ORDER BY semaine_du ASC, nom ASC, prenom ASC`
    ).bind(...ids).all();
    return json({ bordereaux: results });
  }
  if (sub === "batch-export" && method === "POST") {
    const { ids, csv, notes } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return json({ error: "ids requis" }, 400);
    if (!csv || typeof csv !== "string") return json({ error: "csv requis" }, 400);
    const placeholders = ids.map(() => "?").join(",");
    const { results: dateRows } = await env.DB.prepare(
      `SELECT MIN(semaine_du) AS pstart, MAX(semaine_du) AS pend FROM bordereaux WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    const pStart = dateRows[0]?.pstart || null;
    const pEnd = dateRows[0]?.pend || null;
    const now = /* @__PURE__ */ new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const r2Key = `exports/${y}/${m}/pld-${ts}-${ids.length}-bordereaux.csv`;
    await env.BUCKET.put(r2Key, csv, {
      httpMetadata: { contentType: "text/csv; charset=utf-8" }
    });
    const batchRes = await env.DB.prepare(`
      INSERT INTO export_batches (user_email, nb_bordereaux, period_start, period_end, csv_r2_key, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(user, ids.length, pStart, pEnd, r2Key, notes || null).run();
    const batchId = batchRes.meta.last_row_id;
    await env.DB.prepare(`
      UPDATE bordereaux
      SET exported = 1, exported_at = datetime('now'), export_batch_id = ?
      WHERE id IN (${placeholders})
    `).bind(batchId, ...ids).run();
    await audit(env, {
      action: "batch_export",
      userEmail: user,
      ip,
      details: { batchId, count: ids.length, pStart, pEnd, r2Key }
    });
    return json({ ok: true, batchId, r2Key, count: ids.length, periodStart: pStart, periodEnd: pEnd });
  }
  if (sub === "export-batches" && method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, user_email, nb_bordereaux, period_start, period_end,
              r2_key IS NOT NULL AS has_csv, notes
       FROM (SELECT *, csv_r2_key AS r2_key FROM export_batches)
       ORDER BY created_at DESC LIMIT 500`
    ).all();
    return json({ batches: results });
  }
  if (/^export-batches\/\d+\/download$/.test(sub) && method === "GET") {
    const id = parseInt(sub.split("/")[1], 10);
    const row = await env.DB.prepare(
      "SELECT csv_r2_key FROM export_batches WHERE id = ?"
    ).bind(id).first();
    if (!row) return json({ error: "Batch introuvable" }, 404);
    if (!row.csv_r2_key) return json({ error: "CSV non archiv\xE9" }, 404);
    const obj = await env.BUCKET.get(row.csv_r2_key);
    if (!obj) return json({ error: "CSV introuvable en R2" }, 404);
    await audit(env, { action: "export_redownload", userEmail: user, ip, details: { id } });
    return new Response(obj.body, {
      headers: {
        ...CORS_BASE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pld-export-batch-${id}.csv"`
      }
    });
  }
  if (sub.startsWith("update/") && (method === "PATCH" || method === "PUT")) {
    const id = parseInt(sub.slice("update/".length), 10);
    if (!id) return json({ error: "id invalide" }, 400);
    const body = await request.json();
    const allowed = {
      nom: "nom",
      prenom: "prenom",
      matricule: "matricule",
      client: "client",
      contratDefaut: "contrat_defaut",
      semaineDu: "semaine_du",
      semaineAu: "semaine_au",
      totalHt: "total_ht",
      totalHn: "total_hn",
      jours: "jours_json",
      csvPld: "csv_pld"
    };
    const sets = [];
    const binds = [];
    const changed = [];
    for (const [key, col] of Object.entries(allowed)) {
      if (body[key] !== void 0) {
        const v = key === "jours" ? JSON.stringify(body[key] || []) : body[key];
        sets.push(`${col} = ?`);
        binds.push(v);
        changed.push(key);
      }
    }
    if (sets.length === 0) return json({ error: "Rien \xE0 mettre \xE0 jour" }, 400);
    sets.push("updated_at = datetime('now')");
    binds.push(id);
    await env.DB.prepare(`UPDATE bordereaux SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    await audit(env, { action: "update", bordereauId: id, userEmail: user, ip, details: { fields: changed } });
    return json({ ok: true, id, changed });
  }
  if (sub.startsWith("delete/") && method === "DELETE") {
    const id = parseInt(sub.slice(7), 10);
    const b = await env.DB.prepare("SELECT pdf_r2_key FROM bordereaux WHERE id = ?").bind(id).first();
    if (!b) return json({ error: "Not found" }, 404);
    if (b.pdf_r2_key) await env.BUCKET.delete(b.pdf_r2_key);
    await env.DB.prepare("DELETE FROM bordereaux WHERE id = ?").bind(id).run();
    await audit(env, { action: "delete", bordereauId: id, userEmail: user, ip });
    return json({ ok: true });
  }
  if (sub === "rgpd/export" && method === "GET") {
    const nom = url.searchParams.get("nom");
    const prenom = url.searchParams.get("prenom");
    if (!nom || !prenom) return json({ error: "nom et prenom requis" }, 400);
    const { results } = await env.DB.prepare(
      "SELECT * FROM bordereaux WHERE nom = ? AND prenom = ?"
    ).bind(nom, prenom).all();
    await audit(env, { action: "rgpd_export", userEmail: user, ip, details: { nom, prenom, count: results.length } });
    return json({ nom, prenom, bordereaux: results, exportedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  if (sub === "rgpd/forget" && method === "DELETE") {
    const nom = url.searchParams.get("nom");
    const prenom = url.searchParams.get("prenom");
    if (!nom || !prenom) return json({ error: "nom et prenom requis" }, 400);
    const legalCutoff = /* @__PURE__ */ new Date();
    legalCutoff.setFullYear(legalCutoff.getFullYear() - 5);
    const iso = legalCutoff.toISOString().slice(0, 19).replace("T", " ");
    const { results } = await env.DB.prepare(
      "SELECT id, pdf_r2_key FROM bordereaux WHERE nom = ? AND prenom = ? AND created_at < ?"
    ).bind(nom, prenom, iso).all();
    for (const row of results) {
      if (row.pdf_r2_key) await env.BUCKET.delete(row.pdf_r2_key);
    }
    await env.DB.prepare(
      "DELETE FROM bordereaux WHERE nom = ? AND prenom = ? AND created_at < ?"
    ).bind(nom, prenom, iso).run();
    await audit(env, {
      action: "rgpd_forget",
      userEmail: user,
      ip,
      details: { nom, prenom, deletedCount: results.length, legalCutoff: iso }
    });
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM bordereaux WHERE nom = ? AND prenom = ?"
    ).bind(nom, prenom).first();
    return json({
      ok: true,
      deleted: results.length,
      retained: remaining.n,
      note: "Les enregistrements de moins de 5 ans sont conserv\xE9s au titre de l'obligation l\xE9gale de conservation des donn\xE9es de paie (Code du travail L.3243-4)."
    });
  }
  return json({ error: "Route bordereaux inconnue" }, 404);
}
__name(handleBordereaux, "handleBordereaux");
async function purgeOld(env) {
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  const iso = cutoff.toISOString().slice(0, 19).replace("T", " ");
  const { results } = await env.DB.prepare(
    "SELECT id, pdf_r2_key FROM bordereaux WHERE created_at < ?"
  ).bind(iso).all();
  for (const row of results) {
    if (row.pdf_r2_key) {
      try {
        await env.BUCKET.delete(row.pdf_r2_key);
      } catch (e) {
        console.error(e);
      }
    }
  }
  await env.DB.prepare("DELETE FROM bordereaux WHERE created_at < ?").bind(iso).run();
  await audit(env, { action: "auto_purge", details: { count: results.length, cutoff: iso } });
  return results.length;
}
__name(purgeOld, "purgeOld");
var worker_default = {
  async scheduled(event, env) {
    await purgeOld(env);
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_BASE });
    const url = new URL(request.url);
    if (url.pathname.startsWith("/bordereaux/") || url.pathname === "/bordereaux") {
      return handleBordereaux(request, env, url);
    }
    if (url.pathname.startsWith("/github/")) {
      // === AUTH AJOUTÉE : refuser sans X-Auth-Token valide ===
      const ghProxyToken = request.headers.get("X-Auth-Token");
      if (!env.GITHUB_PROXY_TOKEN) return json({ error: "GITHUB_PROXY_TOKEN not configured" }, 500);
      if (ghProxyToken !== env.GITHUB_PROXY_TOKEN) return json({ error: "Unauthorized — X-Auth-Token missing or invalid" }, 401);
      // === FIN AUTH ===

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
    if (url.pathname.startsWith("/twelvedata/")) {
      const tdPath = url.pathname.replace("/twelvedata/", "");
      const params = url.search ? url.search + "&apikey=" + env.TWELVE_DATA_API_KEY : "?apikey=" + env.TWELVE_DATA_API_KEY;
      try {
        const resp = await fetch("https://api.twelvedata.com/" + tdPath + params);
        return new Response(await resp.text(), { headers: JSON_H });
      } catch (e) {
        return json({ status: "error", message: e.message }, 502);
      }
    }
    if (url.pathname.startsWith("/dvf/")) {
      const dep = url.searchParams.get("dep");
      if (!dep) return json({ error: "Missing dep parameter" }, 400);
      try {
        const resp = await fetch("https://dvf-api.data.gouv.fr/dvf/csv/?dep=" + encodeURIComponent(dep));
        return new Response(await resp.text(), {
          status: resp.status,
          headers: { ...CORS_BASE, "Content-Type": "text/csv" }
        });
      } catch (e) {
        return json({ error: e.message }, 502);
      }
    }
    if (url.pathname.startsWith("/bdf/")) {
      const bdfPath = url.pathname.replace("/bdf/", "");
      const bdfUrl = "https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/" + bdfPath + (url.search || "");
      try {
        const resp = await fetch(bdfUrl, {
          headers: { "Authorization": "Apikey " + env.FRENCH_API, "Accept": "application/json" }
        });
        return new Response(await resp.text(), { status: resp.status, headers: JSON_H });
      } catch (e) {
        return json({ error: "BdF API error: " + e.message }, 502);
      }
    }
    if (request.method === "POST") {
      const body = await request.text();
      if (!body) return json({ error: "No body" }, 400);
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body
      });
      return new Response(await resp.text(), { headers: JSON_H });
    }
    return new Response("Proxy OK", { status: 200, headers: CORS_BASE });
  }
};
export {
  worker_default as default
};
