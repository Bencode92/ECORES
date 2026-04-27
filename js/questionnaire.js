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

function renderQuestion(q) {
  const prio = priorityOf(q);
  const tcls = themeClass(q.theme);
  const docId = `q-${q.code}`;
  
  let docsHtml = q.docs.length === 0
    ? '<div class="empty-msg">Aucun document attaché actuellement</div>'
    : '<div class="docs-list">' + q.docs.map((d, i) => {
        const ann = getAnn(q.code, `doc_${i}`, "à confirmer");
        return `
        <div class="doc-item">
          <div class="doc-name">${escapeHtml(d.name)}</div>
          <div class="doc-meta">
            Type : ${escapeHtml(d.type)}${d.pages ? ` · Pages : ${escapeHtml(d.pages)}` : ''}
          </div>
          ${d.comment ? `<div class="doc-comment">💬 ${escapeHtml(d.comment)}</div>` : ''}
          <div class="doc-status-bar">
            <label style="font-size:0.78rem; color:var(--c-muted);">Statut 2026 :</label>
            <select onchange="setAnn('${q.code}', 'doc_${i}', this.value); this.style.background = STATUS_BG[this.value] || 'white';">
              ${['à confirmer', '🟢 OK reconduire', '🟡 mettre à jour', '⚫ obsolète remplacer', '🔴 ne couvre pas'].map(s =>
                `<option value="${s}" ${ann === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </div>`;
      }).join('') + '</div>';
  
  let scorecardHtml = q.scorecard_notes.length === 0
    ? ''
    : `<div class="section-block">
        <div class="section-title">📊 Axes d'amélioration (scorecard 2024)</div>
        <div class="scorecard-notes">
          ${q.scorecard_notes.map(n => `<div class="scorecard-note ${n.includes('ÉLEVÉE') || n.includes('🔴') ? 'priority-haute' : ''}">${escapeHtml(n)}</div>`).join('')}
        </div>
      </div>`;
  
  return `
  <div class="question-card" data-theme="${escapeHtml(q.theme)}" data-priority="${prio}" id="${docId}">
    <div class="q-header">
      <div class="q-meta">
        <span class="q-code">${q.code}</span>
        <span class="theme-tag ${tcls}">${escapeHtml(q.theme)}</span>
        <span class="section-tag">${escapeHtml(q.section)} · ${escapeHtml(q.section_label)}</span>
        <span class="priority-badge priority-${prio}">${PRIORITY_LABEL[prio]}</span>
      </div>
    </div>
    <div class="q-body">
      <div class="q-text">${escapeHtml(q.question)}</div>
      
      <div class="section-block">
        <div class="section-title">📎 Documents actuellement attachés (${q.docs.length})</div>
        ${docsHtml}
      </div>
      
      ${scorecardHtml}
      
      <div class="annotation">
        <div class="annotation-title">📝 Notes équipe — préparation 2026</div>
        <div class="annotation-row">
          <label>Documents existants à fournir :</label>
          <textarea oninput="setAnn('${q.code}', 'existing_docs', this.value)" placeholder="ex: politique sociale 2024, livret S&S à jour...">${escapeHtml(getAnn(q.code, 'existing_docs'))}</textarea>
        </div>
        <div class="annotation-row">
          <label>Nouveaux docs à créer :</label>
          <textarea oninput="setAnn('${q.code}', 'new_docs', this.value)" placeholder="ex: évaluation risques corruption, grille fournisseurs...">${escapeHtml(getAnn(q.code, 'new_docs'))}</textarea>
        </div>
        <div class="annotation-row">
          <label>Responsable :</label>
          <input type="text" oninput="setAnn('${q.code}', 'owner', this.value)" placeholder="ex: Benoit, RH, Direction..." value="${escapeHtml(getAnn(q.code, 'owner'))}">
        </div>
        <div class="annotation-row">
          <label>Statut global :</label>
          <select onchange="setAnn('${q.code}', 'status', this.value)">
            ${['☐ à traiter', '🟡 en cours', '🟢 prêt 2026', '🔴 bloqué'].map(s => {
              const cur = getAnn(q.code, 'status', '☐ à traiter');
              return `<option value="${s}" ${cur === s ? 'selected' : ''}>${s}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="annotation-row">
          <label>Notes libres :</label>
          <textarea oninput="setAnn('${q.code}', 'notes', this.value)" placeholder="commentaires équipe...">${escapeHtml(getAnn(q.code, 'notes'))}</textarea>
        </div>
      </div>
      
      <details>
        <summary>📄 Voir le contenu brut du questionnaire pour cette question</summary>
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
  // Try localStorage first (user's in-progress state takes priority)
  try {
    const stored = JSON.parse(localStorage.getItem(LIB_STORAGE_KEY));
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
  } catch {}
  // Otherwise build from questionnaire + merge with curated entries
  const built = buildInitialLibrary();
  const curated = loadCuratedLibrary();
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const builtByName = new Map(built.map(d => [norm(d.name), d]));
  for (const c of curated) {
    const key = norm(c.name);
    if (builtByName.has(key)) {
      const target = builtByName.get(key);
      target.upload_date = c.upload_date || target.upload_date || '';
      target.valid_until = c.valid_until || target.valid_until || '';
      target.publication_date = c.publication_date || target.publication_date || '';
      target.guessed_type = c.guessed_type || target.guessed_type;
      target.status = c.status || target.status;
      target.location = c.location || target.location || '';
      target.comment = c.comment || target.comment || '';
      target.privacy = c.privacy || target.privacy;
      // Prefer curated questions if they are more complete
      if (Array.isArray(c.questions) && c.questions.length >= target.questions.length) {
        target.questions = c.questions;
      }
      target.curated = true;
    } else {
      built.push({...c, curated: true});
    }
  }
  return built;
}
function saveLibrary(data) {
  localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(data));
}
let library = loadLibrary();

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

  return `
  <div class="doc-card ${validity.status}" data-type="${doc.guessed_type}" data-validity="${validity.status}" id="${doc.id}">
    <div class="doc-row-main">
      <div class="doc-row-left">
        <h3 class="doc-row-title">${escapeHtml(doc.name)}</h3>
        <div class="doc-row-meta">
          <span class="ratt-count">📎 ${doc.questions.length} question${doc.questions.length > 1 ? 's' : ''}</span>
          ${doc.valid_until ? `<span class="validity-mini ${validity.status}">${validity.label}</span>` : ''}
          <span class="status-pill status-${statusKey}">${escapeHtml(statusLabel)}</span>
        </div>
      </div>
      <div class="doc-row-actions">
        ${hasPdf
          ? `<a href="${escapeHtml(doc.location)}" target="_blank" rel="noopener" class="btn btn-primary">📄 Voir PDF</a>`
          : `<span class="btn btn-disabled" title="PDF pas encore uploadé dans le repo">📄 PDF manquant</span>`}
      </div>
    </div>
    <details class="doc-details">
      <summary>Voir les ${doc.questions.length} rattachement${doc.questions.length > 1 ? 's' : ''}</summary>
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
  console.log('[ECORES] Rendered:', QUESTIONS.length, 'questions,', library.length, 'docs');
} catch (err) {
  console.error('[ECORES] Render failed:', err);
  const errBox = document.createElement('div');
  errBox.style.cssText = 'background:#ffebee;border:2px solid #c62828;color:#b71c1c;padding:20px;margin:20px;border-radius:8px;font-family:monospace;white-space:pre-wrap;font-size:14px;';
  errBox.textContent = '⚠️ Erreur : ' + err.name + ': ' + err.message + '\n\n' + err.stack;
  (document.querySelector('main') || document.body).prepend(errBox);
}
