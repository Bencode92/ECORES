let QUESTIONS = [];

// Determine global priority per question (from scorecard notes)
function priorityOf(q) {
  if (q.scorecard_notes.some(n => n.includes("ÉLEVÉE") || n.includes("PRIORITÉ ÉLEVÉE"))) return "haute";
  if (q.scorecard_notes.some(n => n.includes("🟠"))) return "moyenne";
  if (q.scorecard_notes.length > 0) return "faible";
  return "ok";
}
const PRIORITY_LABEL = {
  haute: "🔴 Priorité haute",
  moyenne: "🟠 Priorité moyenne",
  faible: "🟡 Priorité faible",
  ok: "🟢 Pas d'amélioration identifiée"
};

const THEME_CLASS = {
  "Général": "théme-général",
  "Environnement": "theme-environnement",
  "Social et Droits Humains": "theme-social",
  "Éthique": "theme-éthique",
  "Achats Responsables": "theme-achats",
};
function themeClass(t) {
  if (t === "Général") return "theme-général";
  if (t === "Environnement") return "theme-environnement";
  if (t === "Social et Droits Humains") return "theme-social";
  if (t === "Éthique") return "theme-éthique";
  if (t === "Achats Responsables") return "theme-achats";
  return "theme-général";
}

// LocalStorage helpers
const STORAGE_KEY = "ecovadis_2026_annotations";
function loadAnnotations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveAnnotations(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
let annotations = loadAnnotations();

function getAnn(code, key, defaultVal = "") {
  return (annotations[code] && annotations[code][key]) || defaultVal;
}
function setAnn(code, key, val) {
  if (!annotations[code]) annotations[code] = {};
  annotations[code][key] = val;
  saveAnnotations(annotations);
  updateStats();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Match a question's attached doc to its real entry in the library (auto status sync)
function findLibraryDocForQuestion(qDoc) {
  if (!qDoc || !qDoc.name) return null;
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[…\.]+$/, '').trim();
  const target = norm(qDoc.name);
  for (const d of library) {
    const dn = norm(d.name);
    if (dn === target) return d;
    if (dn.length >= 12 && (target.startsWith(dn) || dn.startsWith(target))) return d;
  }
  return null;
}

// Compute a status pill for a doc based on its library entry
function docStatusBadge(libDoc) {
  if (!libDoc) return { cls: 'unknown', label: '⚪ Inconnu (pas dans la bibliothèque)', kind: 'unknown' };
  const status = libDoc.status || '';
  const validity = computeValidity(libDoc);
  if (validity.status === 'expired') return { cls: 'expired', label: `🔴 EXPIRÉ — ${validity.label.replace('🔴 ','')}`, kind: 'update' };
  if (status.includes('🟢')) return { cls: 'ok', label: '🟢 OK reconduire', kind: 'ok' };
  if (status.includes('🟡')) return { cls: 'warn', label: '🟡 À mettre à jour', kind: 'update' };
  if (status.includes('🔴')) return { cls: 'expired', label: '🔴 À refaire', kind: 'update' };
  return { cls: 'unknown', label: '⚪ Statut à confirmer', kind: 'unknown' };
}

function renderQuestion(q) {
  const prio = priorityOf(q);
  const tcls = themeClass(q.theme);
  const docId = `q-${q.code}`;

  // Resolve each attached doc against the library to get its real status
  const docsResolved = q.docs.map(d => {
    const libDoc = findLibraryDocForQuestion(d);
    const badge = docStatusBadge(libDoc);
    return { qDoc: d, libDoc, badge };
  });

  const docsOk = docsResolved.filter(x => x.badge.kind === 'ok');
  const docsToUpdate = docsResolved.filter(x => x.badge.kind === 'update');
  const docsUnknown = docsResolved.filter(x => x.badge.kind === 'unknown');

  // Find recommended new docs targeting this question
  const newDocsForQ = (typeof RECOMMENDED_NEW_DOCS !== 'undefined' ? RECOMMENDED_NEW_DOCS : [])
    .filter(r => Array.isArray(r.forQ) && r.forQ.includes(q.code))
    .filter(r => !library.some(d => d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 30))));

  // Rejected claims from scorecard (priorité élevée)
  const rejectedHigh = q.scorecard_notes.filter(n => n.includes('ÉLEVÉE') || n.includes('PRIORITÉ ÉLEVÉE'));

  // Question overall status
  let qStatus, qStatusLabel;
  if (docsToUpdate.length === 0 && newDocsForQ.length === 0 && rejectedHigh.length === 0 && docsOk.length > 0) {
    qStatus = 'ok'; qStatusLabel = `✅ TOUT EST PRÊT — ${docsOk.length} doc${docsOk.length > 1 ? 's' : ''} OK`;
  } else if (rejectedHigh.length > 0 || docsResolved.some(x => x.badge.cls === 'expired')) {
    qStatus = 'critical';
    const parts = [];
    if (docsToUpdate.length) parts.push(`${docsToUpdate.length} à mettre à jour`);
    if (newDocsForQ.length) parts.push(`${newDocsForQ.length} à créer`);
    qStatusLabel = `🔴 ACTION CRITIQUE — ${parts.join(' · ') || 'rejets scorecard'}`;
  } else if (docsToUpdate.length > 0 || newDocsForQ.length > 0) {
    qStatus = 'warn';
    const parts = [];
    if (docsToUpdate.length) parts.push(`${docsToUpdate.length} à mettre à jour`);
    if (newDocsForQ.length) parts.push(`${newDocsForQ.length} à créer`);
    qStatusLabel = `🟡 ACTION REQUISE — ${parts.join(' · ')}`;
  } else if (docsResolved.length === 0) {
    qStatus = 'critical'; qStatusLabel = '🔴 AUCUN DOCUMENT ATTACHÉ';
  } else {
    qStatus = 'unknown'; qStatusLabel = '⚪ À confirmer';
  }

  // Render section: ✅ Docs OK
  const okSection = docsOk.length === 0 ? '' : `
    <div class="qsec qsec-ok">
      <div class="qsec-title">✅ Documents OK — rien à faire (${docsOk.length})</div>
      ${docsOk.map(({qDoc, libDoc, badge}) => `
        <div class="qsec-doc">
          <div class="qsec-doc-name">${escapeHtml(qDoc.name)}${qDoc.pages ? ` · <span class="qsec-doc-pages">p. ${escapeHtml(qDoc.pages)}</span>` : ''}</div>
          <div class="qsec-doc-status status-${badge.cls}">${escapeHtml(badge.label)}</div>
          ${libDoc && libDoc.location ? `<a class="qsec-doc-link" href="${escapeHtml(libDoc.location)}" target="_blank">📄 PDF</a>` : ''}
        </div>
      `).join('')}
    </div>`;

  // Render section: 🟡 À mettre à jour
  const updateSection = docsToUpdate.length === 0 ? '' : `
    <div class="qsec qsec-warn">
      <div class="qsec-title">🟡 À METTRE À JOUR (${docsToUpdate.length})</div>
      ${docsToUpdate.map(({qDoc, libDoc, badge}) => `
        <div class="qsec-doc">
          <div class="qsec-doc-name">${escapeHtml(qDoc.name)}${qDoc.pages ? ` · <span class="qsec-doc-pages">p. ${escapeHtml(qDoc.pages)}</span>` : ''}</div>
          <div class="qsec-doc-status status-${badge.cls}">${escapeHtml(badge.label)}</div>
          ${libDoc && libDoc.status_reason ? `<div class="qsec-doc-reason">→ ${escapeHtml(libDoc.status_reason)}</div>` : ''}
          ${libDoc && libDoc.pending_actions ? `<div class="qsec-doc-pending">🖊️ ${escapeHtml(libDoc.pending_actions)}</div>` : ''}
          ${libDoc && libDoc.location ? `<a class="qsec-doc-link" href="${escapeHtml(libDoc.location)}" target="_blank">📄 PDF actuel</a>` : ''}
        </div>
      `).join('')}
    </div>`;

  // Render section: 🆕 À créer
  const newSection = newDocsForQ.length === 0 ? '' : `
    <div class="qsec qsec-new">
      <div class="qsec-title">🆕 À PRODUIRE (${newDocsForQ.length})</div>
      ${newDocsForQ.map(r => `
        <div class="qsec-doc">
          <div class="qsec-doc-name">${escapeHtml(r.name)}</div>
          <div class="qsec-doc-status status-new">🆕 Nouveau · priorité ${r.priority}</div>
          <div class="qsec-doc-reason">→ ${escapeHtml(r.why)}</div>
        </div>
      `).join('')}
    </div>`;

  // Render section: ⚪ Statut inconnu
  const unknownSection = docsUnknown.length === 0 ? '' : `
    <div class="qsec qsec-unknown">
      <div class="qsec-title">⚪ Statut à confirmer (${docsUnknown.length})</div>
      ${docsUnknown.map(({qDoc, badge}) => `
        <div class="qsec-doc">
          <div class="qsec-doc-name">${escapeHtml(qDoc.name)}${qDoc.pages ? ` · <span class="qsec-doc-pages">p. ${escapeHtml(qDoc.pages)}</span>` : ''}</div>
          <div class="qsec-doc-status status-${badge.cls}">${escapeHtml(badge.label)}</div>
        </div>
      `).join('')}
    </div>`;

  // Scorecard rejects
  const scorecardHtml = q.scorecard_notes.length === 0 ? '' : `
    <div class="qsec qsec-scorecard">
      <div class="qsec-title">📊 Axes d'amélioration (scorecard 2024)</div>
      ${q.scorecard_notes.map(n => `<div class="scorecard-note ${n.includes('ÉLEVÉE') || n.includes('🔴') ? 'priority-haute' : ''}">${escapeHtml(n)}</div>`).join('')}
    </div>`;

  return `
  <div class="question-card q-status-${qStatus}" data-theme="${escapeHtml(q.theme)}" data-priority="${prio}" data-qstatus="${qStatus}" id="${docId}">
    <div class="q-header">
      <div class="q-meta">
        <span class="q-code">${q.code}</span>
        <span class="theme-tag ${tcls}">${escapeHtml(q.theme)}</span>
        <span class="section-tag">${escapeHtml(q.section)} · ${escapeHtml(q.section_label)}</span>
        <span class="priority-badge priority-${prio}">${PRIORITY_LABEL[prio]}</span>
      </div>
      <div class="q-status-banner banner-${qStatus}">${qStatusLabel}</div>
    </div>
    <div class="q-body">
      <div class="q-text">${escapeHtml(q.question)}</div>

      ${updateSection}
      ${newSection}
      ${unknownSection}
      ${okSection}
      ${scorecardHtml}

      <details class="q-notes-collapse">
        <summary>📝 Mes notes équipe</summary>
        <div class="annotation">
          <div class="annotation-row">
            <label>Responsable :</label>
            <input type="text" oninput="setAnn('${q.code}', 'owner', this.value)" placeholder="ex: Benoit, RH, Direction..." value="${escapeHtml(getAnn(q.code, 'owner'))}">
          </div>
          <div class="annotation-row">
            <label>Notes libres :</label>
            <textarea oninput="setAnn('${q.code}', 'notes', this.value)" placeholder="commentaires équipe...">${escapeHtml(getAnn(q.code, 'notes'))}</textarea>
          </div>
        </div>
      </details>

      <details class="q-raw-collapse">
        <summary>📄 Voir le contenu brut du questionnaire EcoVadis</summary>
        <pre class="raw">${escapeHtml(q.raw)}</pre>
      </details>
    </div>
  </div>
  `;
}

const STATUS_BG = {
  '🟢 OK reconduire': '#e8f5e9',
  '🟡 mettre à jour': '#fff8e1',
  '⚫ obsolète remplacer': '#eceff1',
  '🔴 ne couvre pas': '#ffebee',
};

function render() {
  document.getElementById('questions').innerHTML = QUESTIONS.map(renderQuestion).join('');
  updateStats();
}

function updateStats() {
  const total = QUESTIONS.length;
  const totalDocs = QUESTIONS.reduce((s, q) => s + q.docs.length, 0);
  const haute = QUESTIONS.filter(q => priorityOf(q) === "haute").length;
  const moyenne = QUESTIONS.filter(q => priorityOf(q) === "moyenne").length;
  const treated = QUESTIONS.filter(q => {
    const s = getAnn(q.code, 'status', '☐ à traiter');
    return s === '🟢 prêt 2026';
  }).length;
  const inprog = QUESTIONS.filter(q => getAnn(q.code, 'status') === '🟡 en cours').length;
  
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="lbl">Questions</div></div>
    <div class="stat-card"><div class="num">${totalDocs}</div><div class="lbl">Doc. rattachements</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-danger)">${haute}</div><div class="lbl">🔴 Priorité haute</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-warning)">${moyenne}</div><div class="lbl">🟠 Priorité moyenne</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-warning)">${inprog}</div><div class="lbl">🟡 En cours</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-success)">${treated}/${total}</div><div class="lbl">🟢 Prêtes 2026</div></div>
  `;
}

// Filters
const filters = { theme: 'all', priority: 'all' };
function applyFilters() {
  document.querySelectorAll('.question-card').forEach(card => {
    const t = card.dataset.theme;
    const p = card.dataset.priority;
    const themeOk = filters.theme === 'all' || t === filters.theme;
    const prioOk = filters.priority === 'all' || p === filters.priority;
    card.classList.toggle('hidden', !(themeOk && prioOk));
  });
}
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    document.querySelectorAll(`.filter-btn[data-filter="${f}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filters[f] = btn.dataset.value;
    applyFilters();
  });
});

// Export / Import
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecovadis-2026-annotations-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-input').click();
});
document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      annotations = JSON.parse(ev.target.result);
      saveAnnotations(annotations);
      render();
      alert('Annotations importées avec succès');
    } catch (err) { alert('Erreur : ' + err.message); }
  };
  reader.readAsText(file);
});

document.getElementById('btn-print').addEventListener('click', () => window.print());

// ====================================================================
// LIBRARY VIEW
// ====================================================================

const LIB_STORAGE_KEY = "ecovadis_2026_library";

// Doc type → validity duration in years (per EcoVadis methodology)
const VALIDITY_YEARS = {
  politique: 8,
  action: 8,
  reporting: 2,
  audit: 2,
  certificat: 3,
  adhesion: 99,
  autre: 8,
};

// Heuristic: guess type from EcoVadis "type" field of a doc
function guessType(rawType, name) {
  const s = ((rawType || '') + ' ' + (name || '')).toLowerCase();
  if (s.includes('politique') || s.includes('code') || s.includes('charte') || s.includes('lettre d\'engagement')) return 'politique';
  if (s.includes('rapport annuel') || s.includes('rapport rse') || s.includes('rse')) return 'reporting';
  if (s.includes('certificat') || s.includes('iso')) return 'certificat';
  if (s.includes('audit')) return 'audit';
  if (s.includes('adhésion') || s.includes('adhesion')) return 'adhesion';
  if (s.includes('kpi') || s.includes('bilan') || s.includes('reporting')) return 'reporting';
  return 'action';
}

// Build initial library from QUESTIONS data
function buildInitialLibrary() {
  const docMap = new Map();
  for (const q of QUESTIONS) {
    for (const d of q.docs) {
      const key = d.name.trim();
      if (!docMap.has(key)) {
        docMap.set(key, {
          id: 'doc_' + key.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40),
          name: key,
          ecovadis_type: d.type || '',
          guessed_type: guessType(d.type, d.name),
          publication_date: '',  // user fills
          questions: [],
          comment: '',
          status: '☐ à confirmer',
          location: '',  // chemin local fichier
        });
      }
      const doc = docMap.get(key);
      doc.questions.push({
        code: q.code,
        theme: q.theme,
        pages: d.pages || '',
        question_comment: d.comment || ''
      });
    }
  }
  return Array.from(docMap.values());
}

// Load curated entries from inline JSON (library-data.json embedded in HTML)
// These have proper upload_date, valid_until, statuses etc. for already-processed docs.
function loadCuratedLibrary() {
  try {
    const el = document.getElementById('library-data');
    if (!el) return [];
    const data = JSON.parse(el.textContent);
    return Array.isArray(data) ? data : (data.documents || []);
  } catch (e) {
    console.warn('[ECORES] No curated library data:', e.message);
    return [];
  }
}

function loadLibrary() {
  // ALWAYS build fresh from QUESTIONS + curated JSON (source of truth)
  const built = buildInitialLibrary();
  const curated = loadCuratedLibrary();
  // Normalize: lowercase, collapse whitespace, strip trailing ellipsis (…) added by EcoVadis truncation
  const norm = s => (s || '').toLowerCase()
    .replace(/\s+/g, ' ').trim()
    .replace(/[…\.]+$/, '').trim();
  const builtByName = new Map(built.map(d => [norm(d.name), d]));
  for (const c of curated) {
    const cKey = norm(c.name);
    let target = builtByName.get(cKey);
    // Fuzzy match : built names from EcoVadis can be truncated (e.g. "charte diversité site web liste")
    // while curated names are full (e.g. "charte diversité site web liste signataires")
    if (!target) {
      for (const [bKey, b] of builtByName) {
        if (bKey.length >= 12 && cKey.startsWith(bKey)) {
          target = b;
          break;
        }
        // Also handle reverse case (built longer than curated, unlikely but safe)
        if (cKey.length >= 12 && bKey.startsWith(cKey)) {
          target = b;
          break;
        }
      }
    }
    if (target) {
      target.name = c.name; // Use full name from curated
      target.upload_date = c.upload_date || target.upload_date || '';
      target.valid_until = c.valid_until || target.valid_until || '';
      target.publication_date = c.publication_date || target.publication_date || '';
      target.guessed_type = c.guessed_type || target.guessed_type;
      target.status = c.status || target.status;
      target.status_reason = c.status_reason || target.status_reason || '';
      target.location = c.location || target.location || '';
      target.comment = c.comment || target.comment || '';
      target.pending_actions = c.pending_actions || target.pending_actions || '';
      target.privacy = c.privacy || target.privacy;
      if (Array.isArray(c.questions) && c.questions.length >= target.questions.length) {
        target.questions = c.questions;
      }
      target.curated = true;
    } else {
      built.push({...c, curated: true});
    }
  }
  // Overlay user-edited pending_actions from localStorage (so notes typed in UI persist across reloads)
  try {
    const stored = JSON.parse(localStorage.getItem(LIB_STORAGE_KEY));
    if (stored && Array.isArray(stored)) {
      const storedById = new Map(stored.map(d => [d.id, d]));
      for (const d of built) {
        const s = storedById.get(d.id);
        if (s && typeof s.pending_actions === 'string') {
          d.pending_actions = s.pending_actions;
        }
      }
      // Custom user-added docs (id starts with doc_rec_) — preserve as-is
      const builtIds = new Set(built.map(d => d.id));
      for (const s of stored) {
        if (!builtIds.has(s.id) && s.id && s.id.startsWith('doc_rec_')) {
          built.push(s);
        }
      }
    }
  } catch {}
  return built;
}
function saveLibrary(data) {
  localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(data));
}
let library = loadLibrary();

// ====================================================================
// SYNC CLOUDFLARE PROXY ↔ GITHUB
// Utilise un endpoint /github/<owner>/<repo>/contents/<path> qui forward
// à api.github.com avec le GITHUB_TOKEN du Worker (jamais exposé).
// ====================================================================
const SYNC_CFG_KEY = 'ecores_sync_config';
const GH_REPO = 'Bencode92/ECORES';
const GH_BRANCH = 'main';
const FILE_PATHS = {
  kanban: '_tools/kanban-data.json',
  library: '_tools/library-data.json',
};

function getSyncCfg() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_CFG_KEY)) || {};
  } catch { return {}; }
}
function setSyncCfg(cfg) {
  localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
}
function syncEnabled() {
  const cfg = getSyncCfg();
  return !!(cfg.url);
}

// UTF-8 safe base64 encode/decode
function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64Decode(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

function ghHeaders() {
  const cfg = getSyncCfg();
  const h = { 'Content-Type': 'application/json' };
  if (cfg.secret) h['X-Auth-Token'] = cfg.secret;
  return h;
}

// GET file via proxy : returns { sha, content (decoded), raw } or { sha: null } if 404
async function ghGet(path) {
  const cfg = getSyncCfg();
  if (!cfg.url) throw new Error('Worker URL non configuré');
  const url = `${cfg.url.replace(/\/$/, '')}/github/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return { sha: null, content: null };
  if (res.status === 401) throw new Error('401 Unauthorized — vérifier le X-Auth-Token dans ⚙️');
  if (!res.ok) throw new Error(`GET HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { sha: data.sha, content: b64Decode(data.content), raw: data };
}

// PUT file via proxy : commits new content
async function ghPut(path, contentString, sha = null, message = null) {
  const cfg = getSyncCfg();
  if (!cfg.url) throw new Error('Worker URL non configuré');
  const url = `${cfg.url.replace(/\/$/, '')}/github/${GH_REPO}/contents/${path}`;
  const body = {
    message: message || `chore(sync): update ${path}`,
    content: b64Encode(contentString),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('401 Unauthorized — vérifier le X-Auth-Token dans ⚙️');
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`PUT HTTP ${res.status} : ${detail}`);
  }
  return res.json();
}

async function pullKanbanFromCloud() {
  const { content } = await ghGet(FILE_PATHS.kanban);
  if (!content) {
    console.log('[ECORES] Aucun kanban-data.json sur le repo encore.');
    return;
  }
  const remote = JSON.parse(content);
  if (Array.isArray(remote)) {
    kanban = remote;
    saveKanban(kanban);
    if (typeof renderKanban === 'function') renderKanban();
  }
}

async function pushKanbanToCloud() {
  await ghPutWithRetry(FILE_PATHS.kanban, JSON.stringify(kanban, null, 2));
}

async function pullLibraryFromCloud() {
  const { content } = await ghGet(FILE_PATHS.library);
  if (!content) return;
  console.log('[ECORES] Pulled library-data.json from cloud');
  return content;
}

async function pushLibraryToCloud() {
  const data = {
    _meta: {
      description: 'Library data synced from page UI',
      last_updated: new Date().toISOString().slice(0, 10),
    },
    documents: library,
  };
  await ghPutWithRetry(FILE_PATHS.library, JSON.stringify(data, null, 2));
}

// PUT with automatic retry on 409 (SHA mismatch) — fetches fresh SHA and retries once
async function ghPutWithRetry(path, contentString) {
  let sha = null;
  try {
    const cur = await ghGet(path);
    sha = cur.sha;
  } catch (e) { /* file might not exist yet */ }
  try {
    return await ghPut(path, contentString, sha);
  } catch (err) {
    // 409 = SHA conflict (file was updated between GET and PUT). Retry once with fresh SHA.
    if (/HTTP 409/.test(err.message)) {
      console.warn('[ECORES] 409 SHA conflict — refetching fresh SHA and retrying once');
      let freshSha = null;
      try {
        const cur2 = await ghGet(path);
        freshSha = cur2.sha;
      } catch (e) {}
      return await ghPut(path, contentString, freshSha);
    }
    throw err;
  }
}

// Auto-sync hook called from saveKanban after localStorage save
function autoSyncKanbanIfEnabled() {
  const cfg = getSyncCfg();
  if (!cfg.autoSync || !syncEnabled()) return;
  // Debounce : 2s après la dernière modif
  clearTimeout(window._kanbanSyncTimer);
  updateSyncStatus('syncing');
  window._kanbanSyncTimer = setTimeout(() => {
    pushKanbanToCloud()
      .then(() => updateSyncStatus('ok'))
      .catch(err => {
        console.warn('[ECORES] Push kanban échec:', err.message);
        updateSyncStatus('error');
      });
  }, 2000);
}

function updateSyncStatus(state) {
  const icon = document.getElementById('sync-status-icon');
  if (!icon) return;
  if (!syncEnabled()) { icon.textContent = '⚪'; icon.title = 'Sync désactivé'; return; }
  if (state === 'ok') { icon.textContent = '🟢'; icon.title = 'Sync OK'; }
  else if (state === 'syncing') { icon.textContent = '🔵'; icon.title = 'Sync en cours...'; }
  else if (state === 'error') { icon.textContent = '🔴'; icon.title = 'Erreur de sync'; }
  else { icon.textContent = '⚫'; icon.title = 'Configuré, pas testé'; }
}

// === SETTINGS MODAL ===
function openSettings() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const cfg = getSyncCfg();
  document.getElementById('set-worker-url').value = cfg.url || '';
  document.getElementById('set-worker-secret').value = cfg.secret || '';
  document.getElementById('set-auto-sync').checked = !!cfg.autoSync;
  document.getElementById('settings-msg').classList.remove('show');
  modal.showModal();
}

function saveSettings(ev) {
  if (ev) ev.preventDefault();
  const cfg = {
    url: document.getElementById('set-worker-url').value.trim(),
    secret: (document.getElementById('set-worker-secret') || {}).value || '',
    autoSync: document.getElementById('set-auto-sync').checked,
  };
  setSyncCfg(cfg);
  showSettingsMsg('✅ Configuration enregistrée', 'success');
  updateSyncStatus(syncEnabled() ? 'idle' : 'off');
  return false;
}

function clearSettings() {
  if (!confirm('Effacer la config sync (URL + secret) ?')) return;
  localStorage.removeItem(SYNC_CFG_KEY);
  document.getElementById('set-worker-url').value = '';
  document.getElementById('set-worker-secret').value = '';
  document.getElementById('set-auto-sync').checked = false;
  showSettingsMsg('🗑️ Config effacée', 'success');
  updateSyncStatus('off');
}

async function testWorker() {
  saveSettings(); // save current values first
  const cfg = getSyncCfg();
  if (!cfg.url) { showSettingsMsg('❌ URL manquante', 'error'); return; }
  showSettingsMsg('🧪 Test en cours…', '');
  try {
    // Test : récupérer le repo info via /github/Bencode92/ECORES
    const url = `${cfg.url.replace(/\/$/, '')}/github/${GH_REPO}`;
    const res = await fetch(url);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      showSettingsMsg(`❌ HTTP ${res.status} : ${detail}`, 'error');
      updateSyncStatus('error');
      return;
    }
    const data = await res.json();
    if (data.full_name === GH_REPO) {
      showSettingsMsg(`✅ Connecté à ${data.full_name} (${data.private ? 'privé' : 'public'}, default branch: ${data.default_branch})`, 'success');
      updateSyncStatus('ok');
    } else {
      showSettingsMsg(`❌ Réponse inattendue : ${JSON.stringify(data).slice(0, 200)}`, 'error');
    }
  } catch (err) {
    showSettingsMsg(`❌ Erreur : ${err.message}`, 'error');
    updateSyncStatus('error');
  }
}

async function pullFromCloud() {
  saveSettings();
  if (!syncEnabled()) { showSettingsMsg('❌ Configurer d\'abord URL + secret', 'error'); return; }
  showSettingsMsg('⬇️ Téléchargement depuis GitHub...', '');
  try {
    await pullKanbanFromCloud();
    showSettingsMsg(`✅ Kanban à jour (${kanban.length} cards)`, 'success');
    updateSyncStatus('ok');
  } catch (err) {
    showSettingsMsg(`❌ Pull failed : ${err.message}`, 'error');
    updateSyncStatus('error');
  }
}

async function pushToCloud() {
  saveSettings();
  if (!syncEnabled()) { showSettingsMsg('❌ Configurer d\'abord URL + secret', 'error'); return; }
  showSettingsMsg('⬆️ Push vers GitHub...', '');
  try {
    await pushKanbanToCloud();
    showSettingsMsg(`✅ Kanban pushé (${kanban.length} cards)`, 'success');
    updateSyncStatus('ok');
  } catch (err) {
    showSettingsMsg(`❌ Push failed : ${err.message}`, 'error');
    updateSyncStatus('error');
  }
}

function showSettingsMsg(msg, kind) {
  const el = document.getElementById('settings-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'settings-msg show ' + (kind || '');
}

// Toast feedback for the Save button
function showToast(msg, kind = 'info', durationMs = 3500) {
  const el = document.getElementById('save-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'save-toast show ' + kind;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, durationMs);
}

async function saveAllToGitHub() {
  const btn = document.getElementById('btn-save-github');
  const label = document.getElementById('save-label');
  if (!syncEnabled()) {
    showToast('⚙️ Configure d\'abord URL + token (clic ⚙️)', 'error');
    openSettings();
    return;
  }
  if (!btn) return;
  btn.classList.remove('success', 'error');
  btn.classList.add('saving');
  if (label) label.textContent = 'Sauvegarde…';
  showToast('⬆️ Push vers GitHub en cours…', 'info');
  try {
    await pushKanbanToCloud();
    // Push library aussi (pour que les notes/changements de statut soient sauvés)
    try { await pushLibraryToCloud(); } catch (e) { console.warn('Library push échoué (non-bloquant)', e); }
    btn.classList.remove('saving');
    btn.classList.add('success');
    if (label) label.textContent = 'Sauvegardé ✅';
    showToast(`✅ Kanban (${kanban.length} cards) + Bibliothèque (${library.length} docs) sauvés sur GitHub`, 'success', 5000);
    setTimeout(() => {
      btn.classList.remove('success');
      if (label) label.textContent = 'Save GitHub';
    }, 3000);
  } catch (err) {
    btn.classList.remove('saving');
    btn.classList.add('error');
    if (label) label.textContent = 'Erreur';
    showToast(`❌ Erreur sauvegarde : ${err.message}`, 'error', 8000);
    setTimeout(() => {
      btn.classList.remove('error');
      if (label) label.textContent = 'Save GitHub';
    }, 5000);
  }
}

// Cmd+S / Ctrl+S = Save shortcut
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    saveAllToGitHub();
  }
});

// Wire up settings + save buttons
document.addEventListener('DOMContentLoaded', () => {
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', openSettings);
  const btnSave = document.getElementById('btn-save-github');
  if (btnSave) btnSave.addEventListener('click', saveAllToGitHub);
  updateSyncStatus(syncEnabled() ? 'idle' : 'off');
});


function setDocField(docId, field, value) {
  const doc = library.find(d => d.id === docId);
  if (!doc) return;
  doc[field] = value;
  saveLibrary(library);
  // Re-render only this card to update validity
  if (field === 'publication_date' || field === 'guessed_type') {
    const card = document.getElementById(docId);
    if (card) card.outerHTML = renderDocCard(doc);
  }
  updateLibStats();
}

// Quiet update — no re-render (keeps focus/caret in textarea while typing)
function setDocFieldQuiet(docId, field, value) {
  const doc = library.find(d => d.id === docId);
  if (!doc) return;
  doc[field] = value;
  saveLibrary(library);
}

// Compute validity status from publication_date + type
function computeValidity(doc) {
  // Prefer EcoVadis-authoritative valid_until if set
  let expiry;
  if (doc.valid_until) {
    expiry = new Date(doc.valid_until);
    if (isNaN(expiry)) expiry = null;
  } else if (doc.publication_date) {
    const pub = new Date(doc.publication_date);
    if (isNaN(pub)) return { status: 'unknown', label: '⚪ Date invalide', expiry: null };
    const years = VALIDITY_YEARS[doc.guessed_type] || 8;
    expiry = new Date(pub);
    expiry.setFullYear(expiry.getFullYear() + years);
  } else if (doc.upload_date) {
    // Fallback: compute from upload date + type validity
    const up = new Date(doc.upload_date);
    if (isNaN(up)) return { status: 'unknown', label: '⚪ Date inconnue', expiry: null };
    const years = VALIDITY_YEARS[doc.guessed_type] || 8;
    expiry = new Date(up);
    expiry.setFullYear(expiry.getFullYear() + years);
  } else {
    return { status: 'unknown', label: '⚪ Date inconnue', expiry: null };
  }
  if (!expiry) return { status: 'unknown', label: '⚪ Date invalide', expiry: null };
  const now = new Date();
  const monthsLeft = (expiry - now) / (1000 * 60 * 60 * 24 * 30);
  const expiryStr = expiry.toISOString().slice(0, 10);
  if (monthsLeft < 0) return { status: 'expired', label: `🔴 Expiré le ${expiryStr}`, expiry: expiryStr };
  if (monthsLeft < 6) return { status: 'warning', label: `🟡 Expire le ${expiryStr}`, expiry: expiryStr };
  return { status: 'valid', label: `🟢 Valide jusqu'au ${expiryStr}`, expiry: expiryStr };
}

function renderDocCard(doc) {
  const validity = computeValidity(doc);
  const hasPdf = !!doc.location;

  // Compact rattachements list: just code + answer + page
  const rattHtml = doc.questions.length === 0
    ? '<div class="empty-msg">Pas encore rattaché</div>'
    : doc.questions.map(qa => {
        const ans = qa.selected_answer ? escapeHtml(qa.selected_answer) : '';
        return `
          <div class="ratt-line">
            <a class="ratt-code" href="javascript:void(0)" onclick="goToQuestion('${qa.code}')">${qa.code}</a>
            <span class="ratt-answer">${ans || '<em style="color:var(--c-muted)">—</em>'}</span>
            ${qa.pages ? `<span class="ratt-page">p. ${escapeHtml(qa.pages)}</span>` : ''}
          </div>
        `;
      }).join('');

  // Status pill
  const statusKey = (doc.status || '').includes('🟢') ? 'ok'
                  : (doc.status || '').includes('🟡') ? 'warn'
                  : (doc.status || '').includes('🔴') ? 'bad'
                  : (doc.status || '').includes('🆕') ? 'new'
                  : 'unset';
  const statusLabel = doc.status || '☐ à traiter';
  const hasPending = !!(doc.pending_actions && doc.pending_actions.trim());

  return `
  <div class="doc-card ${validity.status}" data-type="${doc.guessed_type}" data-validity="${validity.status}" id="${doc.id}">
    <div class="doc-row-main">
      <div class="doc-row-left">
        <h3 class="doc-row-title">${escapeHtml(doc.name)}</h3>
        <div class="doc-row-meta">
          <span class="ratt-count">📎 ${doc.questions.length} question${doc.questions.length > 1 ? 's' : ''}</span>
          ${doc.valid_until ? `<span class="validity-mini ${validity.status}">${validity.label}</span>` : ''}
          <span class="status-pill status-${statusKey}">${escapeHtml(statusLabel)}</span>
          ${hasPending ? `<span class="pending-badge" title="Actions en attente">🖊️ À finaliser</span>` : ''}
        </div>
      </div>
      <div class="doc-row-actions">
        ${hasPdf
          ? `<a href="${escapeHtml(doc.location)}" target="_blank" rel="noopener" class="btn btn-primary">📄 Voir PDF</a>`
          : `<span class="btn btn-disabled" title="PDF pas encore uploadé dans le repo">📄 PDF manquant</span>`}
      </div>
    </div>
    <details class="doc-details" ${hasPending ? 'open' : ''}>
      <summary>${hasPending ? '🖊️ Notes & rattachements' : `Voir les ${doc.questions.length} rattachement${doc.questions.length > 1 ? 's' : ''}`}</summary>
      <div class="doc-notes-block">
        <label>📝 Notes / À faire</label>
        <textarea class="doc-notes-input" placeholder="ex : reste à signer, manque pages X, à valider par DG..." oninput="setDocFieldQuiet('${doc.id}', 'pending_actions', this.value)">${escapeHtml(doc.pending_actions || '')}</textarea>
      </div>
      <div class="ratt-list">${rattHtml}</div>
    </details>
  </div>
  `;
}

function deleteDoc(docId) {
  if (!confirm('Supprimer ce document de la bibliothèque ?')) return;
  library = library.filter(d => d.id !== docId);
  saveLibrary(library);
  renderLibrary();
}

// Recommendations for new docs to produce in 2026 (derived from scorecard gaps)
const RECOMMENDED_NEW_DOCS = [
  {name: "Évaluation des risques sécurité de l'information 2026", type: "action", priority: "haute", forQ: ["FBP600"], why: "Scorecard 2024 — Priorité ÉLEVÉE : absence de preuve d'évaluation des risques sec. info"},
  {name: "Évaluation des risques de corruption 2026", type: "action", priority: "haute", forQ: ["FBP600"], why: "Scorecard 2024 — Priorité ÉLEVÉE : absence de preuve d'évaluation des risques corruption"},
  {name: "Grille d'évaluation RSE fournisseurs 2026", type: "action", priority: "moyenne", forQ: ["SUP305", "SUP320"], why: "Scorecard 2024 — Absence d'évaluation des fournisseurs sur pratiques env/sociales"},
  {name: "Plan de formation acheteurs RSE 2026", type: "action", priority: "moyenne", forQ: ["SUP100", "SUP305"], why: "Scorecard 2024 — Absence de formation acheteurs sur questions RSE chaîne d'appro"},
  {name: "Protocole d'audit fournisseurs sur site 2026", type: "action", priority: "moyenne", forQ: ["SUP305"], why: "Scorecard 2024 — Absence d'audits sur site fournisseurs"},
  {name: "Évaluation des risques RSE chaîne d'approvisionnement", type: "action", priority: "moyenne", forQ: ["SUP100"], why: "Scorecard 2024 — Absence d'évaluation des risques RSE chaîne d'appro"},
  {name: "Bilan carbone 2025 finalisé (Scopes 1, 2, 3)", type: "reporting", priority: "faible", forQ: ["ENV630", "ENV640", "ENV697", "SUP600"], why: "Scorecard 2024 — Bilan carbone provisoire à finaliser, Scope 1/2/3 manquants"},
  {name: "KPI énergie/GES 2024-2025", type: "reporting", priority: "faible", forQ: ["ENV697"], why: "Scorecard 2024 — Reporting énergie renouvelable consommée manquant"},
  {name: "KPI déchets dangereux 2024-2025", type: "reporting", priority: "faible", forQ: ["ENV640"], why: "Scorecard 2024 — Reporting poids total déchets dangereux manquant"},
  {name: "KPI santé/sécurité intérimaires 2024-2025", type: "reporting", priority: "faible", forQ: ["LAB601"], why: "Scorecard 2024 — Absence de reporting indicateurs S&S pour intérimaires (cœur de métier !)"},
  {name: "Politique no-recruitment-fee", type: "politique", priority: "faible", forQ: ["LAB100"], why: "Scorecard 2024 — Déclaration ambiguë sur frais de recrutement candidats — clarifier"},
  {name: "Procédure d'alerte corruption renforcée", type: "action", priority: "faible", forQ: ["FBP600"], why: "Scorecard 2024 — Procédure d'alerte corruption à renforcer"},
  {name: "Due diligence tiers anti-corruption", type: "action", priority: "faible", forQ: ["FBP600"], why: "Scorecard 2024 — Devoir de vigilance tiers anti-corruption manquant"},
  {name: "Audit contrôles anti-corruption 2025", type: "audit", priority: "faible", forQ: ["FBP600"], why: "Scorecard 2024 — Audits procédures de contrôle anti-corruption manquants"},
  {name: "Rapport RSE 2025-2026 (refonte annuelle)", type: "reporting", priority: "haute", forQ: ["GEN300", "GEN600", "GEN703", "LAB100", "LAB601", "ENV300", "ENV313", "ENV630", "ENV640", "ENV697", "FBP600", "SUP100", "SUP305", "SUP320", "SUP600"], why: "Document maître référencé 59 fois — refonte annuelle obligatoire"},
];

function renderRecommendations() {
  // Filter out recommendations already added to library
  const libNamesNorm = library.map(d => d.name.toLowerCase().replace(/\s+/g,' ').trim());
  const todo = RECOMMENDED_NEW_DOCS.filter(r => !libNamesNorm.some(n => n.includes(r.name.toLowerCase().slice(0,30))));
  if (todo.length === 0) return '';
  return `
    <div class="recommended-panel">
      <h2>🎯 Documents recommandés à produire pour 2026 (${todo.length})</h2>
      <p style="font-size:0.85rem; color:var(--c-muted); margin:0 0 12px 0;">
        Basé sur les axes d'amélioration de la fiche d'évaluation 2024. Cliquez "Ajouter à la bibliothèque" pour suivre la production.
      </p>
      ${todo.map(r => `
        <div class="recommendation priority-${r.priority}">
          <strong>${escapeHtml(r.name)}</strong>
          <span class="doc-tag type-${r.type}" style="margin-left:8px;">${escapeHtml(r.type)}</span>
          <span class="priority-badge priority-${r.priority}" style="margin-left:6px;">${r.priority === 'haute' ? '🔴 Haute' : r.priority === 'moyenne' ? '🟠 Moyenne' : '🟡 Faible'}</span>
          <div style="margin-top:6px; font-size:0.85rem;">${escapeHtml(r.why)}</div>
          <div class="for-q">📎 Pour : ${r.forQ.map(c => `<a href="javascript:void(0)" onclick="goToQuestion('${c}')" class="doc-q-chip">${c}</a>`).join(' ')}</div>
          <button class="add-this-btn" onclick="addRecommendedDocByIdx(${RECOMMENDED_NEW_DOCS.indexOf(r)})">➕ Ajouter à la bibliothèque</button>
        </div>
      `).join('')}
    </div>
  `;
}

function addRecommendedDocByIdx(idx) {
  const r = RECOMMENDED_NEW_DOCS[idx];
  if (!r) return;
  const newDoc = {
    id: 'doc_rec_' + r.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) + '_' + Date.now(),
    name: r.name,
    ecovadis_type: '',
    guessed_type: r.type,
    publication_date: '',
    questions: r.forQ.map(c => {
      const q = QUESTIONS.find(qq => qq.code === c);
      return { code: c, theme: q ? q.theme : '', pages: '', question_comment: r.why };
    }),
    comment: r.why,
    status: '🆕 nouveau doc à produire',
    location: '',
  };
  library.push(newDoc);
  saveLibrary(library);
  renderLibrary();
}

// Cross-tab navigation (replaces #anchor hrefs that trigger file:// security warnings)
function goToQuestion(code) {
  switchTab('questions');
  setTimeout(() => {
    const el = document.getElementById('q-' + code);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function renderLibrary() {
  document.getElementById('library').innerHTML = renderRecommendations() + library.map(renderDocCard).join('');
  updateLibStats();
  // Refresh dashboard if container exists (it may not on first call)
  if (document.getElementById('dash-list-ok')) renderDashboard();
}

// === DASHBOARD PAR THÈME ===

// Mapping question codes → theme + section
const THEME_STRUCTURE = [
  {
    name: 'Général',
    cssClass: 'theme-general',
    score: 'N/A',
    sections: [
      { title: 'Périmètre & activités', codes: ['GEN120', 'GEN800'] },
      { title: 'Adhésions externes RSE', codes: ['GEN300'] },
      { title: 'Certifications', codes: ['GEN703'] },
      { title: 'Reporting RSE général', codes: ['GEN600'] }
    ]
  },
  {
    name: 'Social et Droits Humains',
    cssClass: 'theme-social',
    score: '90/100',
    sections: [
      { title: 'Politiques sociales & DH', codes: ['LAB100', 'LAB1002', 'LAB1008'] },
      { title: 'Mesures Santé & Sécurité', codes: ['LAB3171s'] },
      { title: 'Mesures Conditions de travail', codes: ['LAB3203s'] },
      { title: 'Mesures Carrière & Formation', codes: ['LAB341s'] },
      { title: 'Mesures Travail enfants/forcé', codes: ['LAB3504'] },
      { title: 'Mesures Discrimination & harcèlement', codes: ['LAB3605'] },
      { title: 'Reporting social', codes: ['LAB601', 'LAB5041', 'LAB6013'] }
    ]
  },
  {
    name: 'Environnement',
    cssClass: 'theme-environnement',
    score: '80/100',
    sections: [
      { title: 'Politiques environnementales', codes: ['ENV300'] },
      { title: 'Mesures énergie & GES', codes: ['ENV313'] },
      { title: 'Mesures déchets', codes: ['ENV3551'] },
      { title: 'Mesures autres env.', codes: ['ENV7001'] },
      { title: 'Reporting GES', codes: ['ENV630', 'CAR1300'] },
      { title: 'Reporting environnemental', codes: ['ENV640', 'ENV697'] }
    ]
  },
  {
    name: 'Éthique',
    cssClass: 'theme-ethique',
    score: '80/100',
    sections: [
      { title: "Politique d'éthique", codes: ['FB100'] },
      { title: 'Mesures anti-corruption', codes: ['FB3104'] },
      { title: 'Mesures sécurité de l\'information', codes: ['FB3106'] },
      { title: 'Reporting éthique', codes: ['FBP600'] }
    ]
  },
  {
    name: 'Achats Responsables',
    cssClass: 'theme-achats',
    score: '70/100',
    sections: [
      { title: "Politiques d'achats responsables", codes: ['SUP100'] },
      { title: "Mesures intégration sociale/env achats", codes: ['SUP305'] },
      { title: "Programme inclusif chaîne appro", codes: ['SUP320'] },
      { title: "Reporting achats responsables", codes: ['SUP600'] }
    ]
  }
];

function getDocStatusClass(doc) {
  const validity = computeValidity(doc);
  const status = doc.status || '';
  if (validity.status === 'expired') return 'bad';
  if (status.includes('🔴')) return 'bad';
  if (status.includes('🟡') || status.includes('⚫')) return 'warn';
  if (status.includes('🟢')) return 'ok';
  if (status.includes('🆕')) return 'new';
  return 'warn'; // unset
}

function getDocStatusIcon(cls) {
  return ({ ok: '🟢', warn: '🟡', bad: '🔴', new: '🆕' }[cls]) || '⚪';
}

function renderThemeDocRow(doc, ratt) {
  const cls = getDocStatusClass(doc);
  const icon = getDocStatusIcon(cls);
  const validity = computeValidity(doc);
  const reasonShort = (doc.status || '').replace(/^[🟢🟡🔴⚫🆕☐]\s*/, '');
  const action = doc.location
    ? `<a href="${escapeHtml(doc.location)}" target="_blank" rel="noopener">📄 PDF</a>`
    : `<span class="miss">PDF manquant</span>`;
  return `
    <div class="theme-doc-row ${cls}">
      <div class="theme-doc-icon">${icon}</div>
      <div class="theme-doc-name">
        <strong>${escapeHtml(doc.name)}</strong>
        <span class="theme-doc-extra">— ${escapeHtml(ratt.selected_answer || '')}${ratt.pages ? ` · p. ${escapeHtml(ratt.pages)}` : ''}</span>
        ${reasonShort && cls !== 'ok' ? `<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">${escapeHtml(reasonShort)}</div>` : ''}
      </div>
      <div class="theme-doc-action">
        <span class="validity-mini ${validity.status}" style="font-size:0.7rem;">${validity.label}</span>
        ${action}
      </div>
    </div>
  `;
}

function renderThemeNewDocRow(rec) {
  return `
    <div class="theme-doc-row new">
      <div class="theme-doc-icon">🆕</div>
      <div class="theme-doc-name">
        <strong>${escapeHtml(rec.name)}</strong>
        <span class="priority-tag ${rec.priority}" style="margin-left:6px;">${rec.priority}</span>
        <div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">${escapeHtml(rec.why)}</div>
      </div>
      <div class="theme-doc-action">
        <span class="miss">À produire</span>
      </div>
    </div>
  `;
}

function renderThemeBlock(theme) {
  // For each section, find docs covering at least one of the codes
  let totalOk = 0, totalWarn = 0, totalBad = 0, totalTodo = 0;
  const sectionsHtml = theme.sections.map(sec => {
    const codeSet = new Set(sec.codes);
    // Get all rattachements (doc + ratt) that match a code in this section
    const rows = [];
    for (const doc of library) {
      for (const ratt of doc.questions) {
        if (codeSet.has(ratt.code)) {
          rows.push({ doc, ratt });
        }
      }
    }
    // Deduplicate by doc.id + ratt.selected_answer (one row per claim)
    const seen = new Set();
    const uniqueRows = rows.filter(r => {
      const k = r.doc.id + '||' + (r.ratt.selected_answer || '') + '||' + (r.ratt.pages || '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Sort: bad first, then warn, then ok
    const order = { bad: 0, warn: 1, new: 2, ok: 3 };
    uniqueRows.sort((a, b) => order[getDocStatusClass(a.doc)] - order[getDocStatusClass(b.doc)]);

    // New docs to produce in this section
    const newDocs = RECOMMENDED_NEW_DOCS.filter(r => {
      const inLib = library.some(d => d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 30)));
      if (inLib) return false;
      return r.forQ.some(q => codeSet.has(q));
    });

    // Count statuses
    let secOk = 0, secWarn = 0, secBad = 0;
    for (const r of uniqueRows) {
      const cls = getDocStatusClass(r.doc);
      if (cls === 'ok') secOk++;
      else if (cls === 'bad') secBad++;
      else secWarn++;
    }
    totalOk += secOk;
    totalWarn += secWarn;
    totalBad += secBad;
    totalTodo += newDocs.length;

    if (uniqueRows.length === 0 && newDocs.length === 0) return ''; // skip empty sections

    const docsHtml = uniqueRows.length === 0
      ? '<div class="theme-empty-section">Aucun document existant</div>'
      : uniqueRows.map(r => renderThemeDocRow(r.doc, r.ratt)).join('');
    const newHtml = newDocs.map(renderThemeNewDocRow).join('');

    return `
      <div class="theme-section">
        <h3 class="theme-section-title">
          ${escapeHtml(sec.title)}
          <span class="theme-section-codes">${sec.codes.join(' · ')}</span>
        </h3>
        ${docsHtml}
        ${newHtml}
      </div>
    `;
  }).filter(Boolean).join('');

  // Score class
  let scoreClass = 'score-na';
  if (theme.score.startsWith('9')) scoreClass = 'score-90';
  else if (theme.score.startsWith('8')) scoreClass = 'score-80';
  else if (theme.score.startsWith('7')) scoreClass = 'score-70';

  return `
    <div class="theme-block ${theme.cssClass}" id="theme-${theme.cssClass}">
      <div class="theme-block-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <h2 class="theme-block-title">
          ${escapeHtml(theme.name)}
          <span class="theme-score ${scoreClass}">${theme.score}</span>
        </h2>
        <div class="theme-block-meta">
          ${totalOk > 0 ? `<span class="theme-stat-chip ok">🟢 ${totalOk} OK</span>` : ''}
          ${totalWarn > 0 ? `<span class="theme-stat-chip warn">🟡 ${totalWarn}</span>` : ''}
          ${totalBad > 0 ? `<span class="theme-stat-chip bad">🔴 ${totalBad}</span>` : ''}
          ${totalTodo > 0 ? `<span class="theme-stat-chip todo">🆕 ${totalTodo}</span>` : ''}
          <span class="theme-block-toggle">▼</span>
        </div>
      </div>
      <div class="theme-block-body">
        ${sectionsHtml}
      </div>
    </div>
  `;
}

function renderDashItem(doc, isExpired) {
  const validity = computeValidity(doc);
  const pdfBtn = doc.location
    ? `<a href="${escapeHtml(doc.location)}" target="_blank" rel="noopener" class="dash-pdf-link">📄 Voir PDF</a>`
    : `<span class="dash-pdf-missing">📄 PDF manquant</span>`;
  // Brief reason: take first 200 chars of comment, before any "À FAIRE" or "Pour"
  let reason = (doc.comment || '').replace(/\s+/g, ' ').trim();
  if (reason.length > 220) reason = reason.slice(0, 220) + '…';
  const ratt = doc.questions.length;
  const codes = [...new Set(doc.questions.map(q => q.code))].slice(0, 5).join(', ');
  return `
    <div class="dash-item ${isExpired ? 'expired' : ''}">
      <div class="dash-item-name">${escapeHtml(doc.name)}</div>
      <div class="dash-item-meta">
        <span>📎 ${ratt} ratt.</span>
        <span class="validity-mini ${validity.status}">${validity.label}</span>
      </div>
      ${reason ? `<div class="dash-item-reason">${escapeHtml(reason)}</div>` : ''}
      ${codes ? `<div class="dash-item-questions">${escapeHtml(codes)}</div>` : ''}
      ${pdfBtn}
    </div>
  `;
}

function renderDashRecommendation(r, idx) {
  const inLib = library.some(d => d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 30)));
  if (inLib) return ''; // already added
  const codes = r.forQ.join(', ');
  return `
    <div class="dash-item priority-${r.priority}">
      <div class="dash-item-name">${escapeHtml(r.name)} <span class="priority-tag ${r.priority}">${r.priority}</span></div>
      <div class="dash-item-reason">${escapeHtml(r.why)}</div>
      <div class="dash-item-questions">Pour : ${escapeHtml(codes)}</div>
    </div>
  `;
}

function renderDashboard() {
  const themesContainer = document.getElementById('dash-themes');
  if (!themesContainer) return;

  // Render each theme block
  themesContainer.innerHTML = THEME_STRUCTURE.map(renderThemeBlock).join('');

  // MÉMO 2026 — synthèse des docs créés et choses à retenir
  renderMemo2026();

  // Top stats : score global + counts
  const okCount = library.filter(d => getDocStatusClass(d) === 'ok').length;
  const warnCount = library.filter(d => ['warn', 'bad'].includes(getDocStatusClass(d))).length;
  const newDocs = RECOMMENDED_NEW_DOCS.filter(r =>
    !library.some(d => d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 30)))
  );
  const totalRatt = library.reduce((s, d) => s + d.questions.length, 0);

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card"><div class="num" style="color:var(--c-primary)">84/100</div><div class="lbl">Score 2024 (cible : maintenir)</div></div>
    <div class="stat-card"><div class="num">${library.length}</div><div class="lbl">Docs bibliothèque</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-success)">${okCount}</div><div class="lbl">🟢 OK reconduire</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-warning)">${warnCount}</div><div class="lbl">🟡 À modifier</div></div>
    <div class="stat-card"><div class="num" style="color:#1976d2">${newDocs.length}</div><div class="lbl">🆕 À produire</div></div>
    <div class="stat-card"><div class="num">${totalRatt}</div><div class="lbl">Rattachements</div></div>
  `;
}

// MÉMO 2026 — Synthèse des 5 docs créés + claims EcoVadis + choses à retenir
function renderMemo2026() {
  const memoContainer = document.getElementById('dash-memo');
  if (!memoContainer) return;

  const docs2026 = [
    {
      name: "Charte anti-corruption v2026",
      file: "04-ethique/politiques/charte-anti-corruption-2026.pdf",
      pages: 16,
      signaturePage: 15,
      coversQuestions: ["FB3104"],
      claims: [
        { ans: "Programme devoir vigilance tiers", page: "13" },
        { ans: "Procédure d'alerte", page: "6" },
        { ans: "Cartographie des risques de corruption", page: "12" },
        { ans: "Procédure approbation transactions sensibles", page: "9" },
        { ans: "Mesures disciplinaires (NEW)", page: "7" },
      ],
      rejets_combles: 3,
    },
    {
      name: "Procédure d'alerte sécurité info v2026",
      file: "04-ethique/actions/procedure-alerte-securite-info-2026.pdf",
      pages: 10,
      signaturePage: 10,
      coversQuestions: ["FB3106"],
      claims: [
        { ans: "Procédure d'alerte parties prenantes sécurité info", page: "5-6" },
        { ans: "Évaluations risques sécurité info", page: "7-8" },
        { ans: "Plan de réponse aux incidents", page: "5-6" },
        { ans: "Audits procédures contrôle sécurité info (NEW)", page: "9" },
      ],
      rejets_combles: 1,
    },
    {
      name: "Programme diligence raisonnable tiers v2026",
      file: "04-ethique/actions/securite-tiers-2026.pdf",
      pages: 9,
      signaturePage: 9,
      coversQuestions: ["FB3106"],
      claims: [
        { ans: "Programme devoir vigilance tiers sécurité info", page: "4-6" },
        { ans: "Mesures protection données tiers", page: "5-7" },
      ],
      rejets_combles: 1,
      note: "15 tiers évalués 100% Conformes — sources publiques vérifiables",
    },
    {
      name: "Rapport évaluation périodique progrès GES 2025",
      file: "02-environnement/reporting/rapport-evaluation-progres-ges-2025.pdf",
      pages: 7,
      signaturePage: 7,
      coversQuestions: ["ENV313", "ENV630", "ENV640", "CAR1300"],
      claims: [
        { ans: "Évaluations périodiques progrès GES", page: "5-6" },
        { ans: "Surveillance GES sur tout le périmètre", page: "3" },
        { ans: "Suivi annuel des progrès GES", page: "4-5" },
        { ans: "Consommation totale énergie 2025 (4 406 kWh)", page: "5" },
      ],
      rejets_combles: 2,
      note: "3 régressions assumées (énergie +14%, VE 100%→83%, mobilité) + 4 actions correctives",
    },
    {
      name: "Procédure d'évaluation RSE des fournisseurs 2026",
      file: "05-achats-responsables/evaluation-fournisseurs/procedure-evaluation-rse-fournisseurs-2026.pdf",
      pages: 9,
      signaturePage: 9,
      coversQuestions: ["SUP305"],
      claims: [
        { ans: "Évaluation fournisseurs env/sociales", page: "6" },
        { ans: "Évaluation risques RSE chaîne d'appro (NEW)", page: "3" },
        { ans: "Audits sur site fournisseurs (NEW)", page: "7" },
        { ans: "Formation acheteurs RSE (NEW)", page: "7" },
      ],
      rejets_combles: 1,
      note: "17 fournisseurs / 14 Conformes + 3 Exemplaires (EDF Pro, HP, Swile)",
    },
  ];

  const totalRejets = docs2026.reduce((s, d) => s + d.rejets_combles, 0);
  const totalClaims = docs2026.reduce((s, d) => s + d.claims.length, 0);
  const newClaims = docs2026.reduce((s, d) => s + d.claims.filter(c => c.ans.includes('NEW')).length, 0);

  let html = `
    <div class="memo2026">
      <div class="memo-header">
        <div class="memo-title">📌 Mémo Remise EcoVadis Mai 2026</div>
        <div class="memo-subtitle">Bilan des 5 docs créés en avril 2026 + claims à mettre à jour sur EcoVadis</div>
      </div>

      <div class="memo-stats">
        <div class="memo-stat"><span class="num">5</span><span class="lbl">Docs refaits 2026</span></div>
        <div class="memo-stat"><span class="num">${totalRejets}</span><span class="lbl">Rejets EcoVadis comblés</span></div>
        <div class="memo-stat"><span class="num">${totalClaims}</span><span class="lbl">Claims à actualiser</span></div>
        <div class="memo-stat new"><span class="num">${newClaims}</span><span class="lbl">Nouveaux claims</span></div>
      </div>

      <div class="memo-docs-title">📑 Tes 5 docs créés et claims associés</div>
      <div class="memo-docs">
        ${docs2026.map(d => `
          <div class="memo-doc">
            <div class="memo-doc-head">
              <div class="memo-doc-name">${escapeHtml(d.name)}</div>
              <a class="memo-doc-link" href="${escapeHtml(d.file)}" target="_blank">📄 PDF (${d.pages}p)</a>
            </div>
            <div class="memo-doc-meta">
              Couvre : ${d.coversQuestions.map(q => `<a class="qcode-pill" href="javascript:void(0)" onclick="goToQuestion('${q}')">${q}</a>`).join(' ')}
              · 🖊️ Signature page ${d.signaturePage}
              ${d.rejets_combles ? ` · ✅ ${d.rejets_combles} rejet${d.rejets_combles > 1 ? 's' : ''} comblé${d.rejets_combles > 1 ? 's' : ''}` : ''}
            </div>
            <div class="memo-doc-claims">
              <div class="memo-claims-title">Sur EcoVadis, coche / met à jour ces claims :</div>
              <ul>
                ${d.claims.map(c => `
                  <li>
                    <span class="memo-claim-ans">${escapeHtml(c.ans)}</span>
                    <span class="memo-claim-page">→ page ${escapeHtml(c.page)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
            ${d.note ? `<div class="memo-doc-note">💡 ${escapeHtml(d.note)}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="memo-reminders-title">⚠️ Choses à garder en tête</div>
      <div class="memo-reminders">
        <div class="memo-reminder critical">
          <div class="memo-reminder-icon">🖊️</div>
          <div class="memo-reminder-body">
            <strong>SIGNATURE des 5 docs avant remise EcoVadis</strong><br>
            Pour chacun des 5 docs ci-dessus : remplir [Nom DG] / [Ville] / [date] sur la page de signature, imprimer cette page, faire signer la Direction manuscrement, scanner et ré-insérer dans le PDF.
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">📧</div>
          <div class="memo-reminder-body">
            <strong>Email à EnSO Group</strong> pour obtenir une lettre RGPD 2026 à jour (la précédente date de mars 2025).
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">📊</div>
          <div class="memo-reminder-body">
            <strong>Bilan carbone 2025 (Greenly)</strong> — en attente. Quand reçu : déposer dans <code>02-environnement/reporting/bilan-carbone-2025.pdf</code> + utiliser pour ENV630/ENV640. Remplace le bilan carbone 2023 expiré.
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">⭐</div>
          <div class="memo-reminder-body">
            <strong>Rapport RSE 2025-2026</strong> — pièce maîtresse à refaire (16 questions couvertes). Le doc actuel "Rapport RSE 2023-2024" date trop pour les KPIs. À actualiser avec les chiffres 2025 (CA, % femmes, heures supp, etc.).
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">🎯</div>
          <div class="memo-reminder-body">
            <strong>FB3104 "Audits des procédures de contrôle"</strong> — Ne PAS refaire d'audit externe. Joindre le <strong>Rapport audit RGPD/corruption 2023</strong> (déjà dans le repo) + la <strong>Charte anti-corruption v2026 page 14</strong> (KPIs 2025) en preuve complémentaire. Programmer un nouvel audit en 2026 pour la prochaine évaluation 2027.
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">❌</div>
          <div class="memo-reminder-body">
            <strong>Décocher</strong> sur EcoVadis le claim "Autres actions" sur SUP305 où la <em>Lettre RGPD ADRH</em> avait été rejetée — ce doc n'est pas pertinent pour ce claim.
          </div>
        </div>

        <div class="memo-reminder">
          <div class="memo-reminder-icon">🔍</div>
          <div class="memo-reminder-body">
            <strong>Honnêteté assumée</strong> — tous les docs 2026 sont basés sur des sources publiques vérifiables (rapports ESG fournisseurs, certifications réelles). Pas d'affirmation "100% signé" inventée, pas de plans d'actions fictifs. Tu peux défendre chaque ligne.
          </div>
        </div>
      </div>
    </div>
  `;

  memoContainer.innerHTML = html;
}

// ====================================================================
// KANBAN / AGENDA
// ====================================================================
const KB_STORAGE_KEY = "ecovadis_2026_kanban";
const KB_DEFAULT_DEADLINE = "2026-05-31"; // EcoVadis remise fin mai

function themeCss(theme) {
  if (theme === 'Général') return 'theme-general';
  if (theme === 'Environnement') return 'theme-environnement';
  if (theme === 'Social et Droits Humains') return 'theme-social';
  if (theme === 'Éthique') return 'theme-ethique';
  if (theme === 'Achats Responsables') return 'theme-achats';
  return 'theme-general';
}

function pickPriorityFromDoc(doc) {
  // Heuristic: expired or 🔴 = haute, 🟡 = moyenne, else faible
  const validity = computeValidity(doc);
  if (validity.status === 'expired') return 'haute';
  if ((doc.status || '').includes('🔴')) return 'haute';
  if ((doc.status || '').includes('🟡')) return 'moyenne';
  return 'faible';
}

function pickThemeFromDoc(doc) {
  // Use the most common theme in rattachements
  const counts = {};
  for (const q of (doc.questions || [])) {
    if (q.theme) counts[q.theme] = (counts[q.theme] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : 'Général';
}

function pickThemeFromCodes(codes) {
  for (const c of (codes || [])) {
    if (c.startsWith('GEN')) return 'Général';
    if (c.startsWith('ENV') || c.startsWith('CAR')) return 'Environnement';
    if (c.startsWith('LAB')) return 'Social et Droits Humains';
    if (c.startsWith('FB')) return 'Éthique';
    if (c.startsWith('SUP')) return 'Achats Responsables';
  }
  return 'Général';
}

// Build initial Kanban from library (docs to update) + RECOMMENDED_NEW_DOCS
function buildInitialKanban() {
  const cards = [];
  // Docs to update
  for (const doc of library) {
    const cls = getDocStatusClass ? getDocStatusClass(doc) : '';
    const validity = computeValidity(doc);
    const status = doc.status || '';
    const isExpired = validity.status === 'expired';
    if (status.includes('🟡') || status.includes('🔴') || status.includes('⚫') || isExpired) {
      cards.push({
        id: 'kb_update_' + doc.id,
        kind: 'Mettre à jour',
        title: doc.name,
        description: (doc.comment || '').slice(0, 280),
        theme: pickThemeFromDoc(doc),
        priority: pickPriorityFromDoc(doc),
        status: 'backlog',
        notes: '',
        due: KB_DEFAULT_DEADLINE,
        location: doc.location || '',
        sourceCodes: [...new Set((doc.questions || []).map(q => q.code))],
        createdAt: new Date().toISOString().slice(0, 10),
        completedAt: ''
      });
    }
  }
  // New docs to produce
  for (const r of RECOMMENDED_NEW_DOCS) {
    const inLib = library.some(d => d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 30)));
    if (inLib) continue;
    cards.push({
      id: 'kb_new_' + r.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40),
      kind: 'Produire',
      title: r.name,
      description: r.why,
      theme: pickThemeFromCodes(r.forQ),
      priority: r.priority,
      status: 'backlog',
      notes: '',
      due: KB_DEFAULT_DEADLINE,
      location: '',
      sourceCodes: r.forQ.slice(),
      createdAt: new Date().toISOString().slice(0, 10),
      completedAt: ''
    });
  }
  return cards;
}

function loadKanban() {
  try {
    const stored = JSON.parse(localStorage.getItem(KB_STORAGE_KEY));
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
  } catch {}
  return buildInitialKanban();
}
function saveKanban(data) {
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(data));
  if (typeof autoSyncKanbanIfEnabled === 'function') autoSyncKanbanIfEnabled();
}
let kanban = loadKanban();

// Resync : ajoute les nouvelles cards sans toucher aux existantes
function resyncKanban() {
  const newCards = buildInitialKanban();
  const existingIds = new Set(kanban.map(c => c.id));
  let added = 0;
  for (const c of newCards) {
    if (!existingIds.has(c.id)) {
      kanban.push(c);
      added++;
    }
  }
  saveKanban(kanban);
  renderKanban();
  alert(`Resync : ${added} nouvelle(s) tâche(s) ajoutée(s). Tes cards existantes (notes, statuts, échéances) sont préservées.`);
}

// For frequent updates (e.g. typing notes) — save without re-rendering to preserve focus/cursor
function setKbFieldQuiet(cardId, field, value) {
  const c = kanban.find(x => x.id === cardId);
  if (!c) return;
  c[field] = value;
  saveKanban(kanban);
}

// For state changes that need visual update (status, move, due date)
function setKbField(cardId, field, value) {
  const c = kanban.find(x => x.id === cardId);
  if (!c) return;
  c[field] = value;
  if (field === 'status' && value === 'done' && !c.completedAt) {
    c.completedAt = new Date().toISOString().slice(0, 10);
  }
  if (field === 'status' && value !== 'done') {
    c.completedAt = '';
  }
  saveKanban(kanban);
  renderKanban();
}

function moveCard(cardId, direction) {
  const order = ['backlog', 'doing', 'review', 'done'];
  const c = kanban.find(x => x.id === cardId);
  if (!c) return;
  const idx = order.indexOf(c.status);
  const next = direction === 'right' ? Math.min(idx + 1, order.length - 1) : Math.max(idx - 1, 0);
  setKbField(cardId, 'status', order[next]);
}

function deleteCard(cardId) {
  if (!confirm('Supprimer cette tâche ?')) return;
  kanban = kanban.filter(c => c.id !== cardId);
  saveKanban(kanban);
  renderKanban();
}

function renderKbCard(c) {
  const theme = themeCss(c.theme);
  const overdue = c.due && c.status !== 'done' && new Date(c.due) < new Date();
  const dueLabel = c.due
    ? (overdue ? `🔴 Échéance dépassée : ${c.due}` : `📅 Échéance : ${c.due}`)
    : 'Pas d\'échéance';
  const codes = (c.sourceCodes || []).slice(0, 6);
  const codesHtml = codes.length
    ? `<div class="kanban-card-codes">${codes.map(code => `<span class="qcode-pill" onclick="goToQuestion('${code}')" title="Voir la question ${code}">${escapeHtml(code)}</span>`).join('')}</div>`
    : '';
  const sourceUpdated = isCardSourceUpdated(c);
  const kindBadge = c.kind === 'Mettre à jour'
    ? `<span class="kanban-card-tag kind-update">🟡 ${escapeHtml(c.kind)}</span>`
    : `<span class="kanban-card-tag kind-new">🆕 ${escapeHtml(c.kind)}</span>`;
  const updatedHint = sourceUpdated
    ? `<div class="kanban-source-updated">✅ Le document source est passé en statut 🟢 — tu peux faire avancer cette carte vers <strong>Terminé</strong></div>`
    : '';
  return `
    <div class="kanban-card priority-${c.priority} kind-${c.kind === 'Mettre à jour' ? 'update' : 'new'} ${sourceUpdated ? 'source-updated' : ''}" data-theme="${escapeHtml(c.theme)}" data-priority="${c.priority}" data-kind="${c.kind === 'Mettre à jour' ? 'update' : 'new'}" id="${c.id}">
      <div class="kanban-card-tags">
        ${kindBadge}
        <span class="kanban-card-tag prio-${c.priority}">${c.priority === 'haute' ? '🔴' : c.priority === 'moyenne' ? '🟠' : '🟡'} ${c.priority}</span>
        <span class="kanban-card-tag ${theme}">${escapeHtml(c.theme)}</span>
      </div>
      <div class="kanban-card-title">${escapeHtml(c.title)}</div>
      ${codesHtml}
      ${c.description ? `<details class="kanban-card-desc-collapse"><summary>Pourquoi ?</summary><div class="kanban-card-desc">${escapeHtml(c.description.slice(0, 300))}</div></details>` : ''}
      ${updatedHint}
      <div class="kanban-card-due ${overdue ? 'overdue' : ''}">
        ${dueLabel}
        ${c.completedAt ? ` · ✅ Fait le ${c.completedAt}` : ''}
      </div>
      <textarea class="kanban-card-notes" placeholder="Mes notes / avis..." oninput="setKbFieldQuiet('${c.id}', 'notes', this.value)">${escapeHtml(c.notes || '')}</textarea>
      <div class="kanban-card-actions">
        <input type="date" class="kanban-card-due-input" value="${escapeHtml(c.due || '')}" onchange="setKbField('${c.id}', 'due', this.value)" title="Échéance">
        ${c.status !== 'backlog' ? `<button class="kanban-btn" onclick="moveCard('${c.id}', 'left')" title="Reculer">←</button>` : ''}
        ${c.status !== 'done' ? `<button class="kanban-btn primary" onclick="moveCard('${c.id}', 'right')" title="Avancer">→</button>` : ''}
        ${c.location ? `<a class="kanban-btn" href="${escapeHtml(c.location)}" target="_blank" rel="noopener">📄 PDF</a>` : ''}
        <button class="kanban-btn danger" onclick="deleteCard('${c.id}')" title="Supprimer">🗑️</button>
      </div>
    </div>
  `;
}

const kbFilters = { theme: 'all', priority: 'all', kind: 'all' };

// Sort: 'Mettre à jour' first, then 'Produire'; within each, priority haute > moyenne > faible
function sortKbCards(cards) {
  const kindOrder = { 'Mettre à jour': 0, 'Produire': 1 };
  const prioOrder = { haute: 0, moyenne: 1, faible: 2 };
  return cards.slice().sort((a, b) => {
    const kindDiff = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
    if (kindDiff !== 0) return kindDiff;
    return (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9);
  });
}

// Detect if the source doc behind a "Mettre à jour" card is now 🟢 — suggest moving to Done
function isCardSourceUpdated(card) {
  if (card.kind !== 'Mettre à jour') return false;
  if (card.status === 'done') return false;
  // Match by stripping the kb_update_ prefix back to a doc id
  const docId = card.id.startsWith('kb_update_') ? card.id.slice('kb_update_'.length) : null;
  if (!docId) return false;
  const doc = library.find(d => d.id === docId);
  if (!doc) return false;
  return (doc.status || '').includes('🟢');
}

function renderKanban() {
  const cols = ['backlog', 'doing', 'review', 'done'];
  for (const col of cols) {
    const cards = sortKbCards(kanban.filter(c => c.status === col));
    const list = document.getElementById(`kb-list-${col}`);
    if (!cards.length) {
      list.innerHTML = '<div style="color:var(--c-muted);font-style:italic;padding:8px;font-size:0.82rem;">Aucune tâche</div>';
    } else if (col === 'backlog') {
      // Group Backlog visually: docs to update first, then docs to produce
      const updates = cards.filter(c => c.kind === 'Mettre à jour');
      const news = cards.filter(c => c.kind === 'Produire');
      let html = '';
      if (updates.length) {
        html += `<div class="kanban-group-title group-update">🟡 À METTRE À JOUR <span class="kanban-group-count">${updates.length}</span></div>`;
        html += updates.map(renderKbCard).join('');
      }
      if (news.length) {
        html += `<div class="kanban-group-title group-new">🆕 À PRODUIRE <span class="kanban-group-count">${news.length}</span></div>`;
        html += news.map(renderKbCard).join('');
      }
      list.innerHTML = html;
    } else {
      list.innerHTML = cards.map(renderKbCard).join('');
    }
    document.getElementById(`kb-count-${col}`).textContent = cards.length;
  }
  applyKbFilters();
  // Stats
  const total = kanban.length;
  const done = kanban.filter(c => c.status === 'done').length;
  const haute = kanban.filter(c => c.priority === 'haute' && c.status !== 'done').length;
  const overdue = kanban.filter(c => c.due && c.status !== 'done' && new Date(c.due) < new Date()).length;
  const updateCount = kanban.filter(c => c.kind === 'Mettre à jour' && c.status !== 'done').length;
  const produceCount = kanban.filter(c => c.kind === 'Produire' && c.status !== 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('kb-stats').innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="lbl">Tâches au total</div></div>
    <div class="stat-card"><div class="num" style="color:#e65100">${updateCount}</div><div class="lbl">🟡 À mettre à jour</div></div>
    <div class="stat-card"><div class="num" style="color:#1565c0">${produceCount}</div><div class="lbl">🆕 À produire</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-danger)">${haute}</div><div class="lbl">🔴 Priorité haute restantes</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-success)">${done}</div><div class="lbl">✅ Terminées (${pct}%)</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-danger)">${overdue}</div><div class="lbl">⏰ Échéance dépassée</div></div>
  `;
}

function applyKbFilters() {
  document.querySelectorAll('.kanban-card').forEach(card => {
    const t = card.dataset.theme;
    const p = card.dataset.priority;
    const k = card.dataset.kind;
    const themeOk = kbFilters.theme === 'all' || t === kbFilters.theme;
    const prioOk = kbFilters.priority === 'all' || p === kbFilters.priority;
    const kindOk = kbFilters.kind === 'all' || k === kbFilters.kind;
    card.classList.toggle('hidden', !(themeOk && prioOk && kindOk));
  });
  // Hide group titles when their entire group is filtered out
  document.querySelectorAll('.kanban-group-title').forEach(title => {
    let next = title.nextElementSibling;
    let hasVisible = false;
    while (next && next.classList.contains('kanban-card')) {
      if (!next.classList.contains('hidden')) { hasVisible = true; break; }
      next = next.nextElementSibling;
    }
    title.classList.toggle('hidden', !hasVisible);
  });
}

document.querySelectorAll('.filter-btn[data-filter-kb]').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filterKb;
    document.querySelectorAll(`.filter-btn[data-filter-kb="${f}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    kbFilters[f] = btn.dataset.value;
    applyKbFilters();
  });
});

// Add custom card
document.getElementById('btn-add-card').addEventListener('click', () => {
  const cont = document.getElementById('kb-add-form-container');
  if (cont.innerHTML) { cont.innerHTML = ''; return; }
  cont.innerHTML = `
    <div class="add-doc-form">
      <h3>➕ Nouvelle tâche</h3>
      <div class="doc-fields">
        <div class="doc-field"><label>Titre</label><input type="text" id="kb-new-title" placeholder="ex: Préparer matrice risques corruption"></div>
        <div class="doc-field"><label>Thème</label>
          <select id="kb-new-theme">
            <option value="Général">Général</option>
            <option value="Environnement">Environnement</option>
            <option value="Social et Droits Humains">Social et Droits Humains</option>
            <option value="Éthique">Éthique</option>
            <option value="Achats Responsables">Achats Responsables</option>
          </select>
        </div>
        <div class="doc-field"><label>Priorité</label>
          <select id="kb-new-prio">
            <option value="haute">🔴 Haute</option>
            <option value="moyenne" selected>🟠 Moyenne</option>
            <option value="faible">🟡 Faible</option>
          </select>
        </div>
        <div class="doc-field"><label>Échéance</label><input type="date" id="kb-new-due" value="${KB_DEFAULT_DEADLINE}"></div>
        <div class="doc-field" style="grid-column:1/-1"><label>Description</label><input type="text" id="kb-new-desc" placeholder="contexte / détails"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="addCustomCard()">Créer</button>
        <button class="btn" onclick="document.getElementById('kb-add-form-container').innerHTML=''">Annuler</button>
      </div>
    </div>
  `;
});

function addCustomCard() {
  const title = document.getElementById('kb-new-title').value.trim();
  if (!title) { alert('Titre requis'); return; }
  const card = {
    id: 'kb_custom_' + Date.now(),
    kind: 'Custom',
    title,
    description: document.getElementById('kb-new-desc').value,
    theme: document.getElementById('kb-new-theme').value,
    priority: document.getElementById('kb-new-prio').value,
    status: 'backlog',
    notes: '',
    due: document.getElementById('kb-new-due').value,
    location: '',
    sourceCodes: [],
    createdAt: new Date().toISOString().slice(0, 10),
    completedAt: ''
  };
  kanban.unshift(card);
  saveKanban(kanban);
  document.getElementById('kb-add-form-container').innerHTML = '';
  renderKanban();
}

document.getElementById('btn-export-kb').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(kanban, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecovadis-2026-kanban-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-reset-kb').addEventListener('click', () => {
  if (!confirm('Resync : ajouter les nouvelles tâches détectées dans la bibliothèque ? Les cards existantes (notes, statuts) seront préservées.')) return;
  resyncKanban();
});

function updateLibStats() {
  const total = library.length;
  const valid = library.filter(d => computeValidity(d).status === 'valid').length;
  const warning = library.filter(d => computeValidity(d).status === 'warning').length;
  const expired = library.filter(d => computeValidity(d).status === 'expired').length;
  const unknown = library.filter(d => computeValidity(d).status === 'unknown').length;
  const filled = library.filter(d => d.publication_date).length;
  document.getElementById('lib-stats').innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="lbl">Documents</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-success)">${valid}</div><div class="lbl">🟢 Valides</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-warning)">${warning}</div><div class="lbl">🟡 Bientôt expirés</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-danger)">${expired}</div><div class="lbl">🔴 Expirés</div></div>
    <div class="stat-card"><div class="num" style="color:var(--c-muted)">${unknown}</div><div class="lbl">⚪ Date à saisir</div></div>
    <div class="stat-card"><div class="num">${filled}/${total}</div><div class="lbl">Dates renseignées</div></div>
  `;
}

// Library filters
const libFilters = { type: 'all', validity: 'all' };
function applyLibFilters() {
  document.querySelectorAll('.doc-card').forEach(card => {
    const t = card.dataset.type;
    const v = card.dataset.validity;
    const typeOk = libFilters.type === 'all' || t === libFilters.type;
    const valOk = libFilters.validity === 'all' || v === libFilters.validity;
    card.classList.toggle('hidden', !(typeOk && valOk));
  });
}
document.querySelectorAll('.filter-btn[data-filter-lib]').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filterLib;
    document.querySelectorAll(`.filter-btn[data-filter-lib="${f}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    libFilters[f] = btn.dataset.value;
    applyLibFilters();
  });
});

// Add new doc
document.getElementById('btn-add-doc').addEventListener('click', () => {
  const container = document.getElementById('add-doc-form-container');
  if (container.innerHTML) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="add-doc-form">
      <h3>➕ Ajouter un nouveau document</h3>
      <div class="doc-fields">
        <div class="doc-field">
          <label>Nom</label>
          <input type="text" id="new-doc-name" placeholder="ex: Évaluation risques corruption 2026">
        </div>
        <div class="doc-field">
          <label>Type</label>
          <select id="new-doc-type">
            <option value="politique">Politique (8 ans)</option>
            <option value="action" selected>Action (8 ans)</option>
            <option value="reporting">Reporting/KPI (2 ans)</option>
            <option value="certificat">Certificat (3 ans)</option>
            <option value="adhesion">Adhésion</option>
            <option value="audit">Audit RSE (2 ans)</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="doc-field">
          <label>Date de parution</label>
          <input type="date" id="new-doc-date">
        </div>
        <div class="doc-field">
          <label>Statut</label>
          <select id="new-doc-status">
            <option value="🆕 nouveau doc à produire" selected>🆕 nouveau doc à produire</option>
            <option value="☐ à confirmer">☐ à confirmer</option>
            <option value="🟢 OK reconduire">🟢 OK reconduire</option>
            <option value="🟡 mettre à jour">🟡 mettre à jour</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" onclick="addNewDoc()">Créer</button>
        <button class="btn" onclick="document.getElementById('add-doc-form-container').innerHTML=''">Annuler</button>
      </div>
    </div>
  `;
});

function addNewDoc() {
  const name = document.getElementById('new-doc-name').value.trim();
  if (!name) { alert('Nom requis'); return; }
  const newDoc = {
    id: 'doc_' + name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) + '_' + Date.now(),
    name: name,
    ecovadis_type: '',
    guessed_type: document.getElementById('new-doc-type').value,
    publication_date: document.getElementById('new-doc-date').value,
    questions: [],
    comment: '',
    status: document.getElementById('new-doc-status').value,
    location: '',
  };
  library.push(newDoc);
  saveLibrary(library);
  document.getElementById('add-doc-form-container').innerHTML = '';
  renderLibrary();
}

// Export / Import library
document.getElementById('btn-export-lib').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecovadis-2026-bibliotheque-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('btn-import-lib').addEventListener('click', () => {
  document.getElementById('file-input-lib').click();
});
document.getElementById('file-input-lib').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      library = JSON.parse(ev.target.result);
      saveLibrary(library);
      renderLibrary();
      alert('Bibliothèque importée');
    } catch (err) { alert('Erreur : ' + err.message); }
  };
  reader.readAsText(file);
});

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'view-' + tab));
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Read QUESTIONS from inline JSON data block (no fetch, no Jekyll dependency, works in file:// too)
try {
  QUESTIONS = JSON.parse(document.getElementById('questions-data').textContent);
  library = loadLibrary();
  render();
  renderLibrary();
  renderDashboard();
  // Init Kanban after library is loaded
  if (kanban.length === 0 || !localStorage.getItem(KB_STORAGE_KEY)) {
    kanban = buildInitialKanban();
    saveKanban(kanban);
  }
  renderKanban();
  console.log('[ECORES] Rendered:', QUESTIONS.length, 'questions,', library.length, 'docs,', kanban.length, 'kanban cards');
} catch (err) {
  console.error('[ECORES] Render failed:', err);
  const errBox = document.createElement('div');
  errBox.style.cssText = 'background:#ffebee;border:2px solid #c62828;color:#b71c1c;padding:20px;margin:20px;border-radius:8px;font-family:monospace;white-space:pre-wrap;font-size:14px;';
  errBox.textContent = '⚠️ Erreur : ' + err.name + ': ' + err.message + '\n\n' + err.stack;
  (document.querySelector('main') || document.body).prepend(errBox);
}
