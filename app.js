// CREDU node renderer. No build step, no dependencies.
// Reads the JSON record files and renders the human view.
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

// Compute the reporting window from credu.json cpd_reporting config.
// Returns { start, endExcl, rollStart, label } as ISO date strings (start inclusive, end exclusive).
function computePeriod(cfg, ref) {
  cfg = cfg || {};
  const p = cfg.primary_period || { type: "calendar" };
  const rollingYears = cfg.rolling_years || 3;
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1; // 1-12
  if (p.type === "financial-year") {
    const sm = p.start_month || 7;
    const fyStart = (m >= sm) ? y : y - 1;
    const start = fyStart + "-" + pad(sm) + "-01";
    const endExcl = (fyStart + 1) + "-" + pad(sm) + "-01";
    const rollStart = (fyStart - (rollingYears - 1)) + "-" + pad(sm) + "-01";
    const label = "FY" + fyStart + "-" + pad((fyStart + 1) % 100);
    return { start: start, endExcl: endExcl, rollStart: rollStart, label: label, rollingYears: rollingYears };
  }
  if (p.type === "custom" && p.start && p.end_exclusive) {
    return { start: p.start, endExcl: p.end_exclusive, rollStart: p.rolling_start || p.start, label: p.label || "period", rollingYears: rollingYears };
  }
  // calendar
  const start = y + "-01-01";
  const endExcl = (y + 1) + "-01-01";
  const rollStart = (y - (rollingYears - 1)) + "-01-01";
  return { start: start, endExcl: endExcl, rollStart: rollStart, label: String(y), rollingYears: rollingYears };
}

function inWindow(d, lo, hi) { d = String(d || ""); return d >= lo && d < hi; }

function badge(v) {
  if (v && v.status === "anchored" && v.bitcoin_txid) {
    const url = v.block_explorer_url || ("https://mempool.space/tx/" + v.bitcoin_txid);
    let row = '<span class="badge ok">Anchored on Bitcoin</span>';
    if (v.evidence_hash) row += ' <span class="hash">SHA-256 ' + esc(String(v.evidence_hash).slice(0, 10)) + "...</span>";
    return '<div class="verify">' + row + ' <a class="verify-btn" href="' + esc(url) + '" target="_blank" rel="noopener">Verify on Bitcoin</a></div>';
  }
  return '<div class="verify"><span class="badge pending">Anchor pending</span></div>';
}

function regCard(r) {
  const meta = [r.abbrev, r.body, r.jurisdiction, r.since ? "since " + r.since : null, r.status, r.renewal ? "renews " + r.renewal : null]
    .filter(Boolean).map(esc).join(" &middot; ");
  return '<div class="card"><p class="card-title">' + esc(r.designation) + "</p><p class=\"card-meta\">" + meta + "</p>" + badge(r.verification) + "</div>";
}
function eduCard(e) {
  const meta = [e.level, e.institution, e.field, e.completed, e.hours != null ? e.hours + " hours" : null]
    .filter(Boolean).map(esc).join(" &middot; ");
  return '<div class="card"><p class="card-title">' + esc(e.title) + "</p><p class=\"card-meta\">" + meta + "</p>" + badge(e.verification) + "</div>";
}
function cpdCard(c) {
  const meta = [c.format, c.provider, c.hours != null ? c.hours + " hours" : null, c.completed]
    .filter(Boolean).map(esc).join(" &middot; ");
  const dom = (c.gcpa_domain || []).map(esc);
  const cap = (c.gcpa_capability || []).map(esc);
  let chips = "";
  if (dom.length || cap.length) {
    chips = '<div class="tags">' +
      dom.map(function (d) { return '<span class="tag dom">' + d + "</span>"; }).join("") +
      cap.map(function (d) { return '<span class="tag">' + d + "</span>"; }).join("") + "</div>";
  }
  return '<div class="card"><p class="card-title">' + esc(c.title) + "</p><p class=\"card-meta\">" + meta + "</p>" + chips + badge(c.verification) + "</div>";
}

function cpdReport(cpd, lo, hi) {
  const buckets = {};
  let total = 0;
  cpd.forEach(function (c) {
    if (!inWindow(c.completed, lo, hi)) return;
    const h = Number(c.hours || 0);
    total += h;
    (c.gcpa_capability || []).forEach(function (cap) {
      const dom = CAP_DOMAIN[cap] || "technical";
      buckets[dom] = buckets[dom] || {};
      buckets[dom][cap] = (buckets[dom][cap] || 0) + h;
    });
  });
  const order = ["technical", "professional", "transdisciplinary"];
  let html = '<div class="report">';
  order.forEach(function (dom) {
    if (!buckets[dom]) return;
    const rows = Object.keys(buckets[dom]).map(function (k) { return [k, buckets[dom][k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    html += '<div class="report-dom"><h3>' + DOMAIN_LABEL[dom] + "</h3>";
    rows.forEach(function (row) { html += '<div class="report-row"><span>' + esc(row[0]) + "</span><span>" + (Math.round(row[1] * 10) / 10) + " h</span></div>"; });
    html += "</div>";
  });
  html += "</div>";
  return { html: html, total: Math.round(total * 10) / 10 };
}
function windowSum(cpd, lo, hi) {
  return Math.round(cpd.reduce(function (a, c) { return a + (inWindow(c.completed, lo, hi) ? Number(c.hours || 0) : 0); }, 0) * 10) / 10;
}

async function render() {
  const app = document.getElementById("app");
  try {
    const [manifest, regs, edu, cpd] = await Promise.all([
      loadJSON("credu.json"), loadJSON("registrations.json"), loadJSON("education.json"), loadJSON("cpd.json")
    ]);
    const n = manifest.node || {};
    const jur = [n.primary_jurisdiction].concat(n.additional_jurisdictions || []).filter(Boolean).join(", ");
    const links = manifest.links || {};
    const linkBits = Object.keys(links).map(function (k) {
      return '<a href="' + esc(links[k]) + '" target="_blank" rel="noopener">' + esc(k.replace(/_/g, " ")) + "</a>";
    }).join(" &middot; ");

    let html = "";
    html += '<header class="node-header">';
    html += '<h1 class="node-name">' + esc(n.practitioner_name) + "</h1>";
    html += '<p class="node-desig">' + esc((n.professional_designations || []).join(", ")) + "</p>";
    html += '<p class="node-meta">Jurisdictions: ' + esc(jur) + (linkBits ? " &nbsp;&middot;&nbsp; " + linkBits : "") + "</p>";
    html += "</header>";

    html += '<div class="read-note">This page is the human view. An AI agent reads the same record from ' +
      '<a href="credu.json">credu.json</a> and <a href="llms.txt">llms.txt</a>. ' +
      "Each item can be verified on Bitcoin without trusting this site.</div>";

    const regList = regs.registrations || [];
    if (regList.length) html += "<section><h2>Professional registrations and designations</h2>" + regList.map(regCard).join("") + "</section>";

    const eduList = edu.education || [];
    if (eduList.length) html += "<section><h2>Education</h2>" + eduList.map(eduCard).join("") + "</section>";

    const cpdList = cpd.cpd || [];
    if (cpdList.length) {
      const period = computePeriod(manifest.cpd_reporting, new Date());
      const rep = cpdReport(cpdList, period.start, period.endExcl);
      const rollTotal = windowSum(cpdList, period.rollStart, period.endExcl);
      html += "<section><h2>Continuing professional development</h2>";
      html += '<p class="summary"><strong>' + esc(rep.total) + "</strong> hours in " + esc(period.label) +
        ", <strong>" + esc(rollTotal) + "</strong> hours across the rolling " + esc(period.rollingYears) + " years, from " +
        esc(cpdList.length) + " recorded activities.</p>";
      html += '<div class="report-wrap"><p class="report-title">Hours by GCPA area in ' + esc(period.label) + ", an activity counts in each area it covers</p>" + rep.html + "</div>";
      html += '<h3 class="cpd-log-title">Activity log</h3>' + cpdList.map(cpdCard).join("");
      html += "</section>";
    }
    app.innerHTML = html;
  } catch (e) {
    app.innerHTML = '<p class="loading">Could not load the record. On GitHub Pages it works as is. Locally, serve over http: python -m http.server</p>';
    console.error(e);
  }
}
render();
