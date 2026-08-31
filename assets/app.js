/* ────────────────────────────────────────────────────────────────
   Interview Prep Notes — client-side router + note loader
   Single page, hash-based navigation. Each note lives in notes/<id>.html
   and is fetched on demand, then cached in memory.
   ──────────────────────────────────────────────────────────────── */

const DEFAULT_NOTE = 'home';
const content = document.getElementById('content');
const cache = new Map();

/* Collapsible sidebar groups */
function toggleGroup(id) {
  const items = document.getElementById(id);
  const arrow = document.getElementById('arr-' + id);
  if (items) items.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
}

/* Mobile sidebar */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

/* Fetch a note fragment, caching the result */
async function fetchNote(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch(`notes/${id}.html`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Note "${id}" not found (${res.status})`);
  const html = await res.text();
  cache.set(id, html);
  return html;
}

/* Highlight the active nav link and open its parent group */
function setActiveNav(id) {
  document.querySelectorAll('.nav-item, .nav-sub').forEach(n => n.classList.remove('active'));
  const link = document.querySelector(`[data-note="${id}"]`);
  if (!link) return;
  link.classList.add('active');
  const group = link.closest('.nav-group-items');
  if (group && !group.classList.contains('open')) {
    group.classList.add('open');
    const arrow = document.getElementById('arr-' + group.id);
    if (arrow) arrow.classList.add('open');
  }
}

/* Load and render a note by id */
async function loadNote(id) {
  try {
    const html = await fetchNote(id);
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML =
      `<div class="section-header"><h1>⚠️ Not found</h1>` +
      `<p>${err.message}</p></div>`;
  }
  setActiveNav(id);
  window.scrollTo(0, 0);
  if (window.innerWidth <= 768) closeSidebar();
}

/* Route from the URL hash (e.g. #java-topics) */
function router() {
  const id = location.hash.slice(1) || DEFAULT_NOTE;
  loadNote(id);
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
