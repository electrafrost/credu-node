// CREDU node renderer. No build step, no dependencies. Accordions use native <details>, no JS needed.
// The JSON files are the canonical record; this script only renders them.

const CAP_DOMAIN = {
  "Ethics": "technical", "Audit & Assurance": "technical", "Corporate Finance": "technical",
  "Controls & Budgeting": "technical", "Risk Management": "technical", "Business Economics & Environment": "technical",
  "Financial Accounting & Reporting": "technical", "Taxation for Accounting Professionals": "technical", "Law for Accounting Professionals": "technical",
  "Communications": "professional", "Autonomous Learning & Wellbeing": "professional", "Critical Thinking": "professional",
  "Problem Solving": "professional", "Teamwork & Culture": "professional",
  "Sustainability": "transdisciplinary", "Governance & Culture": "transdisciplinary", "Data Analytics": "transdisciplinary",
  "Digital Acumen": "transdisciplinary", "Cyber security": "transdisciplinary"
};
const DOMAIN_LABEL = { technical: "Technical", professional: "Professional", transdisciplinary: "Trans-disciplinary" };

const ICONS = {
  github: '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 0C3.6 0 0 3.6 0 8c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.5c-2 .4-2.5-.5-2.7-.9-.1-.3-.5-.9-.8-1.1-.3-.2-.7-.5 0-.5.6 0 1 .6 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3.1-1.8 3.8-3.6 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.5.4A8 8 0 0016 8c0-4.4-3.6-8-8-8z"/></svg>',
  email: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  website: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/></svg>'
};

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load " + path);
  return res.json();
}

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function lastYear(s) { var m = String(s || "").match(/\d{4}/g); return m ? parseInt(m[m.length - 1], 10) : 0; }
function round1(x) { return Math.round(x * 10) / 10; }

function computePeriod(cfg, ref) {
  cfg = cfg || {};
  const p = cfg.primary_period || { type: "calendar" };
  const rollingYears = cfg.rolling_years || 3;
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  if (p.type === "financial-year") {
    const sm = p.start_month || 7;
    const fyStart = (m >= sm) ? y : y - 1;
    return { start: fyStart + "-" + pad(sm) + "-01", endExcl: (fyStart + 1) + "-" + pad(sm) + "-01", rollStart: (fyStart - (rollingYears - 1)) + "-" + pad(sm) + "-01", label: "FY" + fyStart + "-" + pad((fyStart + 1) % 100), rollingYears: rollingYears };
  }
  if (p.type === "custom" && p.start && p.end_exclusive) {
    return { start: p.start, endExcl: p.end_exclusive, rollStart: p.rolling_start || p.start, label: p.label || "period", rollingYears: rollingYears };
  }
  return { start: y + "-01-01", endExcl: (y + 1) + "-01-01", rollStart: (y - (rollingYears - 1)) + "-01-01", label: String(y), rollingYears: rollingYears };
}
function inWindow(d, lo, hi) { d = String(d || ""); return d >= lo && d < hi; }

// A record is anchored if its status is "anchored" AND it carries either a Bitcoin txid
// or an OpenTimestamps proof. The chip links to the best verification available:
// a block explorer when there is a txid, otherwise the .ots proof file.
function isAnchored(v) {
  return !!(v && v.status === "anchored" && (v.bitcoin_txid || v.ots_proof));
}
function anchorLink(v) {
  if (!v) return null;
  if (v.block_explorer_url) return v.block_explorer_url;
  if (v.bitcoin_txid) return "https://mempool.space/tx/" + v.bitcoin_txid;
  if (v.ots_proof) return v.ots_proof;
  return null;
}
function chip(v) {
  if (isAnchored(v)) {
    const url = anchorLink(v);
    const inner = '<span class="chip anchored">Anchored on Bitcoin</span>';
    return url ? '<a class="chip-link" href="' + esc(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation();">' + inner + "</a>" : inner;
  }
  return '<span class="chip pending">anchor pending</span>';
}

// Proof shown inside every expanded row, in all three sections.
// Certificate slot is always visible, with a placeholder when empty.
// Verification text is status only; the SHA-256 explanation lives once in the intro.
function proofBody(v, certPdf, certUrl) {
  const links = [];
  if (certPdf) links.push('<a href="' + esc(certPdf) + '" target="_blank" rel="noopener">View certificate</a>');
  if (certUrl) links.push('<a href="' + esc(certUrl) + '" target="_blank" rel="noopener">Verify with issuer</a>');
  const certRow = links.length
    ? '<p class="proof-links">' + links.join(" &middot; ") + "</p>"
    : '<p class="proof-links muted">Certificate: to be attached</p>';
  let verRow = "";
  if (isAnchored(v)) {
    const hashShort = esc(String(v.evidence_hash || "").slice(0, 16));
    const parts = [];
    if (hashShort) parts.push("SHA-256 " + hashShort + "...");
    if (v.bitcoin_txid && (v.block_explorer_url || true)) {
      const tx = v.block_explorer_url || ("https://mempool.space/tx/" + v.bitcoin_txid);
      parts.push('<a href="' + esc(tx) + '" target="_blank" rel="noopener">View transaction</a>');
    } else if (v.ots_proof) {
      parts.push('<a href="' + esc(v.ots_proof) + '" target="_blank" rel="noopener">OpenTimestamps proof</a>');
    }
    if (v.block_height) parts.push("block " + esc(v.block_height));
    verRow = '<p class="proof-ver">' + parts.join(" &middot; ") + "</p>";
  }
  return certRow + verRow;
}

function regRow(r) {
  const meta = [r.body, r.jurisdiction, r.since ? "since " + r.since : null, r.renewal ? "renews " + r.renewal : null].filter(Boolean).map(esc).join(" &middot; ");
  const head = (r.abbrev ? '<strong>' + esc(r.abbrev) + "</strong> " : "") + esc(r.designation);
  return '<details class="acc"><summary><span class="acc-head">' + head + "</span>" + chip(r.verification) + '</summary><div class="acc-body"><p class="acc-meta">' + meta + "</p>" + proofBody(r.verification, r.certificate_pdf, r.certificate_url) + "</div></details>";
}
function eduRow(e) {
  const meta = [e.institution, e.level, e.period || e.completed, e.field].filter(Boolean).map(esc).join(" &middot; ");
  return '<details class="acc"><summary><span class="acc-head">' + esc(e.title) + "</span>" + chip(e.verification) + '</summary><div class="acc-body"><p class="acc-meta">' + meta + "</p>" + proofBody(e.verification, e.certificate_pdf, e.certificate_url) + "</div></details>";
}
function cpdRow(c) {
  const meta = [c.format, c.provider, c.hours != null ? c.hours + " h" : null, c.completed].filter(Boolean).map(esc).join(" &middot; ");
  const dom = (c.gcpa_domain || []).map(esc);
  const cap = (c.gcpa_capability || []).map(esc);
  let tags = "";
  if (dom.length || cap.length) {
    tags = '<div class="tags">' + dom.map(function (d) { return '<span class="tag dom">' + d + "</span>"; }).join("") + cap.map(function (d) { return '<span class="tag">' + d + "</span>"; }).join("") + "</div>";
  }
  return '<details class="acc"><summary><span class="acc-head">' + esc(c.title) + "</span>" + chip(c.verification) + '</summary><div class="acc-body"><p class="acc-meta">' + meta + "</p>" + tags + proofBody(c.verification, c.certificate_pdf, c.certificate_url) + "</div></details>";
}

// Per-area hours: an activity's hours are split evenly across the areas it covers,
// so the area buckets sum to the period total with no double counting.
function cpdReport(cpd, lo, hi) {
  const buckets = {};
  let total = 0;
  cpd.forEach(function (c) {
    if (!inWindow(c.completed, lo, hi)) return;
    const h = Number(c.hours || 0);
    total += h;
    const caps = c.gcpa_capability || [];
    if (!caps.length) return;
    const share = h / caps.length;
    caps.forEach(function (cap) {
      const dom = CAP_DOMAIN[cap] || "technical";
      buckets[dom] = buckets[dom] || {};
      buckets[dom][cap] = (buckets[dom][cap] || 0) + share;
    });
  });
  const order = ["technical", "professional", "transdisciplinary"];
  let html = '<div class="report">';
  order.forEach(function (dom) {
    if (!buckets[dom]) return;
    const rows = Object.keys(buckets[dom]).map(function (k) { return [k, buckets[dom][k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    html += '<div class="report-dom"><h3>' + DOMAIN_LABEL[dom] + "</h3>";
    rows.forEach(function (row) { html += '<div class="report-row"><span>' + esc(row[0]) + "</span><span>" + round1(row[1]) + " h</span></div>"; });
    html += "</div>";
  });
  html += "</div>";
  return { html: html, total: round1(total) };
}
function windowSum(cpd, lo, hi) {
  return round1(cpd.reduce(function (a, c) { return a + (inWindow(c.completed, lo, hi) ? Number(c.hours || 0) : 0); }, 0));
}

function iconLink(kind, href, label) {
  if (!href) return "";
  return '<a class="icon-link" href="' + esc(href) + '" target="_blank" rel="noopener" aria-label="' + label + '" title="' + label + '">' + ICONS[kind] + "</a>";
}

async function render() {
  const app = document.getElementById("app");
  try {
    const [manifest, regs, edu, cpd] = await Promise.all([
      loadJSON("credu.json"), loadJSON("registrations.json"), loadJSON("education.json"), loadJSON("cpd.json")
    ]);
    const n = manifest.node || {};
    const contact = manifest.contact || {};
    const jur = [n.primary_jurisdiction].concat(n.additional_jurisdictions || []).filter(Boolean).join(", ");
    const templateUrl = manifest.credu_template_url || "https://github.com/credu-protocol/professional-graph-template";
    const avatar = n.avatar || "avatar.jpg";

    const contacts = [
      iconLink("github", contact.github, "GitHub"),
      iconLink("email", contact.email ? "mailto:" + contact.email : "", "Email"),
      iconLink("website", contact.website, "Website")
    ].join("");

    let html = "";
    html += '<header class="node-header">';
    html += '<div class="head-main">';
    html += '<h1 class="node-name">' + esc(n.practitioner_name) + "</h1>";
    html += '<p class="node-desig">MY PROFESSIONAL GRAPH</p>';
    html += '<div class="contacts">' + contacts + "</div>";
    html += '<a class="built-on" href="' + esc(templateUrl) + '" target="_blank" rel="noopener">Built on CREDU, make your own</a>';
    html += "</div>";
    html += '<div class="head-right">';
    html += '<img class="avatar" src="' + esc(avatar) + '" alt="' + esc(n.practitioner_name) + '" />';
    html += "</div>";
    html += "</header>";

    html += '<div class="read-note">';
    html += '<p>My professional graph is a verifiable, machine-readable record of my professional registrations, education and continuing professional development, open for discovery and procurement by AI agents and for inspection by professional bodies.</p>';
    html += '<p>This page is the human view. An AI agent reads the same record from <a href="credu.json">credu.json</a> and <a href="llms.txt">llms.txt</a>.</p>';
    html += '<p>Each record carries a SHA-256 hash of its supporting evidence, anchored to the Bitcoin blockchain. Anyone can recompute the hash and match it against the chain to confirm when the evidence was anchored and that it has not changed since, without relying on this site. Records marked pending are not yet anchored.</p>';
    html += "</div>";

    const regList = (regs.registrations || []).slice().sort(function (a, b) { return lastYear(b.since) - lastYear(a.since); });
    if (regList.length) {
      html += "<section><h2>Professional registrations and designations</h2>";
      html += '<p class="subtitle">Jurisdictions: ' + esc(jur) + "</p>";
      html += '<div class="acc-list">' + regList.map(regRow).join("") + "</div></section>";
    }

    const eduList = (edu.education || []).slice().sort(function (a, b) { return lastYear(b.completed) - lastYear(a.completed); });
    if (eduList.length) {
      html += "<section><h2>Education</h2>";
      html += '<div class="acc-list">' + eduList.map(eduRow).join("") + "</div></section>";
    }

    const cpdList = (cpd.cpd || []).slice().sort(function (a, b) { return String(b.completed).localeCompare(String(a.completed)); });
    if (cpdList.length) {
      const period = computePeriod(manifest.cpd_reporting, new Date());
      const rep = cpdReport(cpdList, period.start, period.endExcl);
      const rollTotal = windowSum(cpdList, period.rollStart, period.endExcl);
      html += "<section><h2>Continuing professional development</h2>";
      html += '<p class="summary"><strong>' + esc(rep.total) + "</strong> hours in " + esc(period.label) + ", <strong>" + esc(rollTotal) + "</strong> hours across the rolling " + esc(period.rollingYears) + " years, from " + esc(cpdList.length) + " recorded activities.</p>";
      html += '<div class="report-wrap"><p class="report-title">Hours by GCPA area in ' + esc(period.label) + ". Where an activity covers more than one area, its hours are split evenly across them, so the areas sum to the total.</p>" + rep.html + "</div>";
      html += '<details class="acc cpd-log"><summary><span class="acc-head">Activity log</span><span class="chip count">' + esc(cpdList.length) + " activities</span></summary>";
      html += '<div class="acc-body cpd-items">' + cpdList.map(cpdRow).join("") + "</div></details>";
      html += "</section>";
    }

    app.innerHTML = html;
  } catch (e) {
    app.innerHTML = '<p class="loading">Could not load the record. On GitHub Pages it works as is. Locally, serve over http: python -m http.server</p>';
    console.error(e);
  }
}
render();
