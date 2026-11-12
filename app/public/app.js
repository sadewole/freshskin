// FreshSkin shell. Vanilla ES modules: no build step, so what runs is what a reviewer reads.
// Every DOM write goes through textContent or createElement, never innerHTML, so product data
// from the catalogue cannot inject markup.

const state = {
  me: null,
  kind: 'cream',
  maxPrice: null,
  families: [],
  saved: new Map(),
};

const $ = (selector) => document.querySelector(selector);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
};

async function api(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    ...options,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? 'Request failed');
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

// ---------------------------------------------------------------- session

async function ensureSession() {
  try {
    state.me = (await api('/me')).data;
  } catch (error) {
    if (error.status !== 401) throw error;
    await api('/auth/anonymous', { method: 'POST' });
    state.me = (await api('/me')).data;
  }
}

function renderConsentGate() {
  const required = ['terms', 'privacy', 'image_processing'];
  const missing = required.some((kind) => state.me.consents[kind] !== true);
  $('#consent-panel').hidden = !missing;
  if (!missing) return;

  for (const input of document.querySelectorAll('[data-consent]')) {
    input.checked = state.me.consents[input.dataset.consent] === true;
  }
}

async function saveConsents() {
  const button = $('#consent-save');
  button.disabled = true;
  try {
    for (const input of document.querySelectorAll('[data-consent]')) {
      const kind = input.dataset.consent;
      if (state.me.consents[kind] === input.checked) continue;
      await api('/consents', {
        method: 'POST',
        body: JSON.stringify({ kind, granted: input.checked, policy_version: '2026-11-01' }),
      });
    }
    await ensureSession();
    renderConsentGate();
    renderProfile();
  } catch (error) {
    button.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Continue';
  }
}

// ---------------------------------------------------------------- views

function showView(name) {
  for (const view of document.querySelectorAll('.view')) {
    view.hidden = view.id !== `view-${name}`;
  }
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-current', tab.dataset.view === name ? 'page' : 'false');
  }
  if (name === 'home') loadRecommendations();
  if (name === 'saved') loadSaved();
  if (name === 'profile') renderProfile();
}

function card(item, kind) {
  const product = item.product;
  const breakdown = Object.entries(item.breakdown ?? {})
    .map(([key, value]) => `${key.replace(/_/g, ' ')} ${Math.round(Number(value) * 100)}`)
    .join(' · ');

  const save = el('button', { class: 'secondary small', text: 'Save' });
  save.addEventListener('click', async () => {
    save.disabled = true;
    await api('/saved-items', {
      method: 'POST',
      body: JSON.stringify({ product_id: product.id, list: 'wishlist' }),
    });
    save.textContent = 'Saved';
  });

  return el(
    'article',
    { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: product.name }),
      el('span', { class: 'score', text: String(item.score) }),
    ),
    el('p', { class: 'muted small', text: `${product.brand} · ${kind} · ₦${product.price_ngn ?? '—'}` }),
    el('p', { text: item.reason }),
    el('details', {},
      el('summary', { class: 'muted small', text: 'How this was calculated' }),
      el('p', { class: 'muted small', text: breakdown }),
    ),
    el('div', { class: 'row' },
      save,
      el('button', {
        class: 'ghost small',
        text: kind === 'perfume' ? 'Similar scents' : 'Report',
        onclick: kind === 'perfume' ? () => loadSimilar(product.id) : null,
      }),
    ),
  );
}

async function loadRecommendations() {
  const results = $('#results');
  results.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));

  const query = new URLSearchParams();
  if (state.maxPrice !== null) query.set('max_price', String(state.maxPrice));

  try {
    const payload = await api(`/recommendations/${state.kind === 'cream' ? 'creams' : 'perfumes'}?${query}`);
    const items = payload.data.items;
    results.replaceChildren();

    if (items.length === 0) {
      results.append(el('p', { class: 'muted', text: 'Nothing matched those filters. Try raising the price.' }));
    }

    for (const item of items) results.append(card(item, state.kind));

    const excluded = payload.data.excluded ?? [];
    if (excluded.length > 0) {
      const list = el('details', { class: 'panel' },
        el('summary', { text: `Hidden for your safety (${excluded.length})` }),
        ...excluded.map((entry) =>
          el('p', { class: 'muted small', text: `${entry.name}: ${entry.reason}` }),
        ),
      );
      results.append(list);
    }

    const quizButton = el('button', { class: 'ghost small', text: 'Not seeing what you like? Answer the scent quiz' });
    quizButton.addEventListener('click', () => {
      $('#quiz').hidden = false;
      quizButton.remove();
    });
    if (state.kind === 'perfume' && state.me?.has_fragrance_profile !== true) results.append(quizButton);
  } catch (error) {
    results.replaceChildren(el('p', { class: 'error', text: error.message }));
  }
}

async function loadSimilar(productId) {
  const results = $('#results');
  results.replaceChildren(el('p', { class: 'muted', text: 'Finding scents in the same family…' }));
  try {
    const payload = await api(`/recommendations/similar?product_id=${encodeURIComponent(productId)}`);
    results.replaceChildren(
      el('h2', { text: `Like ${payload.data.anchor.name}` }),
      ...payload.data.results.map((entry) =>
        el('article', { class: 'card' },
          el('h3', { text: entry.name }),
          el('p', { class: 'muted small', text: `${entry.label.replace(/_/g, ' ')} · ₦${entry.price_ngn ?? '—'}` }),
          el('p', { class: 'small', text: `Shared notes: ${entry.shared_notes.join(', ') || 'none'}` }),
        ),
      ),
    );
  } catch (error) {
    results.replaceChildren(el('p', { class: 'error', text: error.message }));
  }
}

// ---------------------------------------------------------------- scan

async function runScan() {
  const text = $('#label-text').value.trim();
  const status = $('#scan-status');
  const out = $('#scan-result');

  if (text.length < 5) {
    status.textContent = 'Paste the ingredient list first.';
    return;
  }

  status.textContent = 'Reading label…';
  out.replaceChildren();

  try {
    const created = await api('/scans', {
      method: 'POST',
      body: JSON.stringify({ kind: 'ingredient_label' }),
    });

    let payload;
    try {
      payload = await api(`/dev/scans/${created.scanId ?? created.data?.scanId ?? created.scan_id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ raw_text: text }),
      });
    } catch (error) {
      if (error.status === 404) {
        status.textContent = 'The OCR worker is not connected yet, so this scan stays queued.';
        return;
      }
      throw error;
    }

    const data = payload.data;
    status.textContent = '';
    out.append(
      el('article', { class: `verdict ${data.verdict ?? 'unknown'}` },
        el('h3', { text: data.verdict ? data.verdict.toUpperCase() : 'Could not read' }),
        el('p', { text: data.summary }),
        el('p', { class: 'muted small', text: `${Math.round(data.match_rate * 100)}% of the label recognised` }),
        ...data.findings.map((finding) =>
          el('p', { class: 'finding' },
            el('strong', { text: finding.label }),
            ` — ${finding.reason}`,
          ),
        ),
      ),
    );
  } catch (error) {
    status.textContent = error.message;
  }
}

// ---------------------------------------------------------------- saved

async function loadSaved() {
  const list = $('#saved-list');
  list.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  try {
    const payload = await api('/saved-items');
    if (payload.data.items.length === 0) {
      list.replaceChildren(el('p', { class: 'muted', text: 'Nothing saved yet.' }));
      return;
    }
    state.saved = new Map(payload.data.items.map((item) => [item.product_id, item]));
    list.replaceChildren(
      ...payload.data.items.map((item) => {
        const remove = el('button', { class: 'ghost small', text: 'Remove' });
        remove.addEventListener('click', async () => {
          await api(`/saved-items?product_id=${item.product_id}&list=${item.list}`, { method: 'DELETE' });
          loadSaved();
        });
        return el('article', { class: 'card' },
          el('h3', { text: item.name }),
          el('p', { class: 'muted small', text: `${item.brand} · ${item.list} · ₦${item.price_ngn ?? '—'}` }),
          remove,
        );
      }),
    );
  } catch (error) {
    list.replaceChildren(el('p', { class: 'error', text: error.message }));
  }
}

// ---------------------------------------------------------------- profile

function renderProfile() {
  const summary = $('#profile-summary');
  const consents = $('#profile-consents');
  if (summary === null || consents === null) return;

  summary.replaceChildren(
    el('p', { class: 'muted small', text: `Session ${state.me.user_id ?? ''}` }),
    el('p', { class: 'muted small', text: `Scent quiz: ${state.me.has_fragrance_profile ? 'complete' : 'not taken'}` }),
  );

  consents.replaceChildren(
    ...Object.entries(state.me.consents).map(([kind, granted]) =>
      el('label', { class: 'check' },
        el('input', { type: 'checkbox', 'data-consent-toggle': kind, ...(granted ? { checked: 'checked' } : {}) }),
        el('span', { text: kind.replace(/_/g, ' ') }),
      ),
    ),
  );

  for (const input of consents.querySelectorAll('[data-consent-toggle]')) {
    input.addEventListener('change', async () => {
      await api('/consents', {
        method: 'POST',
        body: JSON.stringify({
          kind: input.dataset.consentToggle,
          granted: input.checked,
          policy_version: '2026-11-01',
        }),
      });
      await ensureSession();
      renderConsentGate();
      renderProfile();
    });
  }
}

// ---------------------------------------------------------------- boot

function renderQuizFamilies() {
  for (const target of ['#families-liked', '#families-disliked']) {
    const container = $(target);
    container.replaceChildren(
      ...state.families.map((family) => {
        const button = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', text: family });
        button.addEventListener('click', () => {
          button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        });
        return button;
      }),
    );
  }
}

async function saveQuiz() {
  const selected = (selector) =>
    [...document.querySelectorAll(`${selector} .chip[aria-pressed="true"]`)].map((chip) => chip.textContent);

  await api('/fragrance-profile', {
    method: 'PUT',
    body: JSON.stringify({
      families_liked: selected('#families-liked'),
      families_disliked: selected('#families-disliked'),
      strength: $('#strength').value,
      occasions: ['daily'],
    }),
  });
  await ensureSession();
  $('#quiz').hidden = true;
  loadRecommendations();
}

async function boot() {
  await ensureSession();

  const meta = await api('/meta');
  state.families = meta.data.families;
  renderQuizFamilies();

  renderConsentGate();
  renderProfile();
  await loadRecommendations();

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }

  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', () => {
      state.kind = seg.dataset.kind;
      for (const other of document.querySelectorAll('.seg')) {
        other.setAttribute('aria-pressed', other === seg ? 'true' : 'false');
      }
      $('#quiz').hidden = true;
      loadRecommendations();
    });
  }

  $('#max-price').addEventListener('change', (event) => {
    const value = Number(event.target.value);
    state.maxPrice = Number.isFinite(value) && value > 0 ? value : null;
    loadRecommendations();
  });

  $('#consent-save').addEventListener('click', saveConsents);
  $('#quiz-save').addEventListener('click', saveQuiz);
  $('#scan-run').addEventListener('click', runScan);
  $('#logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.reload();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}

boot().catch((error) => {
  document.querySelector('main').prepend(
    el('p', { class: 'error', text: `Could not start: ${error.message}` }),
  );
});
