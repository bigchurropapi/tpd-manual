/* TPD Manual field reference — vanilla JS, hash routing */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const btnBack = $('#btn-back');
  const btnSearch = $('#btn-search');
  const btnTheme = $('#btn-theme');
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const TIER_LABEL = { high: 'High liability', medium: 'Know the gist', admin: 'Reference' };

  let DATA = null, BY_NUM = {}, ORDER = [];
  let state = { theme: null, fs: 1, stars: [], openChapters: {}, filter: null };

  // ---------- persistence (fails quietly in sandboxed iframes) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tpd.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tpd.' + k, JSON.stringify(v)); } catch { } }
  };
  state.theme = store.get('theme', null);
  state.fs = store.get('fs', 1);
  state.stars = store.get('stars', []);
  state.openChapters = store.get('openChapters', { '401': true, '402': true, '103': true });

  function applyTheme() {
    if (state.theme) document.documentElement.setAttribute('data-theme', state.theme);
    else document.documentElement.removeAttribute('data-theme');
  }
  function applyFs() { document.documentElement.style.setProperty('--fs', String(state.fs)); }
  applyTheme(); applyFs();

  btnTheme.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!state.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    state.theme = dark ? 'light' : 'dark';
    store.set('theme', state.theme); applyTheme();
  });
  btnBack.addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#/'; });
  btnSearch.addEventListener('click', () => { location.hash = '#/search'; });

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (vals[i] == null ? '' : vals[i]), '');
  const numSort = (a, b) => { const A = a.split('.').map(Number), B = b.split('.').map(Number); return A[0] - B[0] || A[1] - B[1]; };
  function isStar(n) { return state.stars.includes(n); }
  function toggleStar(n) {
    state.stars = isStar(n) ? state.stars.filter(x => x !== n) : [...state.stars, n];
    store.set('stars', state.stars);
  }
  function badge(d) {
    let s = h`<span class="badge ${d.tier}">${TIER_LABEL[d.tier]}</span>`;
    if (d.status && /2026/.test(d.status)) s += h` <span class="badge updated">${esc(d.status)}</span>`;
    return s;
  }
  // Light markdown-ish inline formatting for authored notes: **bold** and (ref 1.2)
  function fmt(s) {
    const R = '\\d{1,2}(?:\\.\\d{1,2}){0,3}[a-z]?(?:\\s+(?:note|exception))?';
    const re = new RegExp('\\s\\(((?:' + R + '|Policy|Definitions|[a-z])(?:(?:,\\s*|\\s+(?:to|and)\\s+)(?:' + R + '|Policy|Definitions|[a-z]))*)\\)$');
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(re, (m, r) => ' <span class="ref">' + (/^\d/.test(r) ? '§' : '') + r + '</span>');
  }

  // ---------- routing ----------
  function route() {
    const hash = location.hash || '#/';
    const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (parts[0] === 'd' && parts[1]) return renderDirective(parts[1], parts[3]);
    if (parts[0] === 'search') return renderSearch(parts.slice(1).join('/'));
    if (parts[0] === 'about') return renderAbout();
    return renderHome();
  }
  window.addEventListener('hashchange', route);

  function setChrome({ back, sub }) {
    btnBack.hidden = !back;
    $('#brand-sub').textContent = sub || (DATA.edition + ' edition');
  }

  // ---------- Home ----------
  function renderHome() {
    setChrome({ back: false });
    const stars = state.stars.filter(n => BY_NUM[n]).sort(numSort);
    const f = state.filter;
    let html = h`
      <div class="hero">
        <h1>Standard Operating Guidelines</h1>
        <p>${DATA.directives.length} directives · ${DATA.edition} edition · tap a chapter to open it</p>
      </div>
      ${searchBox('')}
      <div class="chips" role="tablist">
        <button class="chip ${f == null ? 'on' : ''}" data-filter="">All</button>
        <button class="chip ${f === 'high' ? 'on' : ''}" data-filter="high"><span class="dot" style="color:var(--high)"></span>High liability</button>
        <button class="chip ${f === 'medium' ? 'on' : ''}" data-filter="medium"><span class="dot" style="color:var(--medium)"></span>Know the gist</button>
        <button class="chip ${f === 'take' ? 'on' : ''}" data-filter="take">Has Quick Take</button>
        <button class="chip ${f === 'updated' ? 'on' : ''}" data-filter="updated">Updated 2026</button>
        <button class="chip ${f === 'stars' ? 'on' : ''}" data-filter="stars">★ Starred${stars.length ? ' (' + stars.length + ')' : ''}</button>
      </div>`;

    const pass = d => !f || (f === 'high' && d.tier === 'high') || (f === 'medium' && d.tier === 'medium') ||
      (f === 'take' && d.take) || (f === 'updated' && /2026/.test(d.status || '')) || (f === 'stars' && isStar(d.num));

    if (f) {
      const list = DATA.directives.filter(pass);
      html += list.length
        ? h`<div class="card">${list.map(rowHtml).join('')}</div>`
        : h`<div class="empty">${f === 'stars' ? 'Nothing starred yet. Open a directive and tap ★ to keep it here.' : 'Nothing here yet.'}</div>`;
    } else {
      for (const p of DATA.parts) {
        html += h`<section class="part"><div class="part-title"><span class="roman">${ROMAN[+p.id - 1]}</span><h2>${esc(p.name)}</h2></div>`;
        for (const c of p.chapters) {
          const list = DATA.directives.filter(d => d.chapter_num === c);
          const open = !!state.openChapters[c];
          html += h`<div class="chapter card ${open ? 'open' : ''}" data-ch="${c}">
            <button class="chapter-head" aria-expanded="${open}">
              <span class="num">${c}</span><span>${esc(DATA.chapters[c])}</span><span class="count">${list.length}</span>
              <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="chapter-body">${list.map(rowHtml).join('')}</div></div>`;
        }
        html += '</section>';
      }
    }
    html += h`<p class="footer-note">Built from the Toledo Police Department manual, ${DATA.edition} edition. The manual itself is the authority; this is a reading aid. <a href="#/about">About this reference</a></p>`;
    view.innerHTML = html;
    bindSearchBox();
    view.querySelectorAll('.chip[data-filter]').forEach(b => b.addEventListener('click', () => {
      state.filter = b.dataset.filter || null; renderHome();
    }));
    view.querySelectorAll('.chapter-head').forEach(b => b.addEventListener('click', () => {
      const ch = b.parentElement; const c = ch.dataset.ch;
      ch.classList.toggle('open'); state.openChapters[c] = ch.classList.contains('open');
      b.setAttribute('aria-expanded', ch.classList.contains('open')); store.set('openChapters', state.openChapters);
    }));
  }

  function rowHtml(d) {
    return h`<a class="row" href="#/d/${d.num}">
      <span class="flag ${d.tier}" title="${TIER_LABEL[d.tier]}"></span>
      <span class="rnum">${d.num}</span>
      <span class="rtitle">${esc(d.title)}<small>${d.take ? 'Quick Take · ' : ''}${d.status ? esc(d.status) : (d.revised ? 'Revised ' + esc(d.revised.replace(/^(\w+) \d+, /, '$1 ')) : '')}</small></span>
      ${isStar(d.num) ? '<span class="star-mini">★</span>' : ''}
    </a>`;
  }

  function searchBox(q) {
    return h`<form class="search-wrap" id="search-form" role="search">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <input class="search-input" id="q" type="search" placeholder="Search the manual…" value="${esc(q)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Search the manual">
      <button class="search-clear" type="button" id="q-clear" aria-label="Clear" ${q ? '' : 'hidden'}>✕</button>
    </form>`;
  }
  function bindSearchBox(live) {
    const form = $('#search-form'), q = $('#q'), clr = $('#q-clear');
    if (!form) return;
    form.addEventListener('submit', e => { e.preventDefault(); q.blur(); location.hash = '#/search/' + encodeURIComponent(q.value.trim()); });
    clr.addEventListener('click', () => { q.value = ''; q.focus(); clr.hidden = true; if (live) live(''); });
    q.addEventListener('input', () => { clr.hidden = !q.value; if (live) live(q.value); });
  }

  // ---------- Search ----------
  let searchTimer = null;
  function renderSearch(q) {
    setChrome({ back: true, sub: 'Search' });
    view.innerHTML = h`${searchBox(q)}<div id="results"></div>`;
    bindSearchBox(val => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { doSearch(val); history.replaceState(null, '', '#/search/' + encodeURIComponent(val.trim())); }, 160); });
    const input = $('#q');
    if (!q) setTimeout(() => input.focus(), 50);
    doSearch(q);
  }

  function tokenize(q) { return q.toLowerCase().split(/\s+/).filter(t => t.length > 1); }

  function doSearch(q) {
    const box = $('#results'); if (!box) return;
    q = (q || '').trim();
    if (q.length < 2) { box.innerHTML = h`<div class="empty">Type a word, a phrase, or a directive number like <b>401.1</b>.<br><br>Try: <a href="#/search/body%20camera">body camera</a> · <a href="#/search/pursuit%20terminate">pursuit terminate</a> · <a href="#/search/strip%20search">strip search</a> · <a href="#/search/juvenile%20miranda">juvenile miranda</a></div>`; return; }
    const toks = tokenize(q);
    const phrase = q.toLowerCase();
    const groups = [];
    // direct directive number
    if (/^\d{3}(\.\d{1,2})?$/.test(q)) {
      const hits = DATA.directives.filter(d => d.num === q || d.num.startsWith(q + '.') || d.chapter_num === q);
      if (hits.length) groups.push({ d: null, titleHits: hits, blocks: [], score: 1e9 });
    }
    for (const d of DATA.directives) {
      const title = d.title.toLowerCase();
      let score = 0; const blocks = [];
      const titleMatch = toks.every(t => title.includes(t));
      if (titleMatch) score += 1000;
      for (const b of d.blocks) {
        if (b.type === 'section' || b.type === 'continuum') continue;
        const txt = ((b.term ? b.term + ' – ' : '') + b.text).toLowerCase();
        if (txt.includes(phrase)) { blocks.push({ b, s: 10 }); score += 10; }
        else if (toks.length > 1 && toks.every(t => txt.includes(t))) { blocks.push({ b, s: 3 }); score += 3; }
      }
      if (d.take) {
        const tk = JSON.stringify(d.take).toLowerCase();
        if (toks.every(t => tk.includes(t))) score += 50;
      }
      if (score) groups.push({ d, blocks: blocks.sort((a, b) => b.s - a.s).slice(0, 4), score, titleMatch });
    }
    groups.sort((a, b) => b.score - a.score);
    if (!groups.length) { box.innerHTML = h`<div class="empty">No matches for “${esc(q)}”.<br><span class="small">Try fewer or different words.</span></div>`; return; }
    const total = groups.reduce((n, g) => n + (g.d ? Math.max(1, g.blocks.length) : g.titleHits.length), 0);
    let html = h`<p class="results-meta">${groups.filter(g => g.d).length} directive${groups.length === 1 ? '' : 's'} · ${total} place${total === 1 ? '' : 's'}</p>`;
    for (const g of groups.slice(0, 40)) {
      if (!g.d) { html += h`<div class="card res-group">${g.titleHits.map(rowHtml).join('')}</div>`; continue; }
      const d = g.d;
      html += h`<div class="card res-group">
        <a class="res" href="#/d/${d.num}"><div class="rt"><span class="rnum">${d.num}</span><span>${hl(d.title, toks)}</span><span class="where">${d.take && !g.blocks.length ? 'Quick Take' : d.chapter}</span></div>
        ${g.blocks.length === 0 ? h`<div class="snip">${esc(firstPara(d))}</div>` : ''}</a>
        ${g.blocks.map(({ b }) => h`<a class="res" href="#/d/${d.num}/b/${b.id}">
          <div class="rt"><span class="where">${b.label ? '§ ' + esc(b.label) : (b.term ? 'Definition' : 'Text')}</span></div>
          <div class="snip">${snippet((b.term ? b.term + ' – ' : '') + b.text, toks, phrase)}</div></a>`).join('')}
      </div>`;
    }
    if (groups.length > 40) html += h`<p class="results-meta">Showing the top 40 directives. Narrow the search to see more.</p>`;
    box.innerHTML = html;
  }
  function firstPara(d) { const b = d.blocks.find(x => x.type === 'para'); return b ? b.text.slice(0, 220) : ''; }
  function hl(text, toks) {
    let s = esc(text);
    for (const t of [...toks].sort((a, b) => b.length - a.length)) {
      s = s.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    }
    return s;
  }
  function snippet(text, toks, phrase) {
    const lo = text.toLowerCase();
    let i = lo.indexOf(phrase); if (i < 0) i = Math.min(...toks.map(t => lo.indexOf(t)).filter(x => x >= 0));
    if (!isFinite(i)) i = 0;
    const start = Math.max(0, i - 90); const end = Math.min(text.length, i + 200);
    return (start > 0 ? '…' : '') + hl(text.slice(start, end), toks) + (end < text.length ? '…' : '');
  }

  // ---------- Directive ----------
  function renderDirective(num, blockId) {
    const d = BY_NUM[num];
    if (!d) { view.innerHTML = h`<div class="empty">No directive numbered ${esc(num)}.<br><a href="#/">Back to the index</a></div>`; setChrome({ back: true }); return; }
    setChrome({ back: true, sub: d.num + ' · ' + d.chapter });
    const i = ORDER.indexOf(d.num); const prev = ORDER[i - 1] && BY_NUM[ORDER[i - 1]]; const next = ORDER[i + 1] && BY_NUM[ORDER[i + 1]];

    // headings for jump bar: sections + level-1 headings
    const jumps = [];
    d.blocks.forEach(b => {
      if (b.type === 'section') jumps.push({ id: b.id, label: b.text });
      else if (b.type === 'item' && b.heading && b.level === 1) jumps.push({ id: b.id, label: b.label + ' ' + titleCase(b.text) });
    });

    let html = h`<div class="card d-head">
      <div class="d-crumb"><a href="#/">${esc(d.part)}</a><span class="sep">›</span><span>${d.chapter_num} ${esc(d.chapter)}</span></div>
      <div class="d-title"><span class="dnum">${d.num}</span><h1>${esc(d.title)}</h1></div>
      <div class="d-meta">${badge(d)}</div>
      <div class="d-meta">${d.effective ? h`<span>Effective <b>${esc(d.effective)}</b></span>` : ''}${d.revised ? h`<span>Revised <b>${esc(d.revised)}</b></span>` : ''}${d.rescinds ? h`<span>Rescinds <b>${esc(d.rescinds)}</b></span>` : ''}<span>PDF page <b>${d.pdf_page}</b></span></div>
      <div class="d-tools">
        <button class="tool-btn ${isStar(d.num) ? 'on' : ''}" id="btn-star">${isStar(d.num) ? '★ Starred' : '☆ Star'}</button>
        <span class="tool-group" aria-label="Text size"><button id="fs-down" aria-label="Smaller text">A−</button><button id="fs-up" aria-label="Larger text">A+</button></span>
        <button class="tool-btn" id="btn-collapse">Collapse all</button>
      </div></div>`;

    if (d.take) html += takeHtml(d);
    if (jumps.length > 1) html += h`<nav class="jump"><div class="chips">${jumps.map(j => h`<a class="chip" href="#/d/${d.num}/b/${j.id}" data-jump="${j.id}">${esc(j.label)}</a>`).join('')}</div></nav>`;

    html += '<article class="card d-body">';
    let secOpen = false, secIndex = 0;
    for (const b of d.blocks) {
      if (b.type === 'section') {
        if (secOpen) html += '</section>';
        html += h`<section class="sec" id="b${b.id}"><h2 class="sec-title"><span class="roman">${ROMAN[secIndex++] || ''}</span>${esc(b.text)}</h2>`;
        secOpen = true; continue;
      }
      if (b.type === 'continuum') { html += continuumHtml(b); continue; }
      const cls = ['blk', b.type, b.level ? 'l' + Math.min(b.level, 6) : 'l0', b.heading ? 'heading' : '', b.emph ? 'emph' : ''].join(' ');
      const label = b.label ? h`<span class="lbl">${esc(b.label)}</span>` : '';
      const text = b.term ? h`<span class="term">${esc(b.term)}</span> – ${esc(b.text)}` : (b.heading ? esc(titleCase(b.text)) : esc(b.text));
      html += h`<p class="${cls}" id="b${b.id}" data-id="${b.id}">${label}<span class="txt">${text}</span></p>`;
    }
    if (secOpen) html += '</section>';
    html += '</article>';

    html += h`<div class="pn">
      ${prev ? h`<a class="card prev" href="#/d/${prev.num}"><small>‹ Previous</small><span>${prev.num} ${esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? h`<a class="card next" href="#/d/${next.num}"><small>Next ›</small><span>${next.num} ${esc(next.title)}</span></a>` : ''}
    </div>
    <p class="footer-note">Text reproduced from the ${DATA.edition} manual (PDF page ${d.pdf_page}). Tap any paragraph to copy a link to it.</p>`;

    view.innerHTML = html;

    $('#btn-star').addEventListener('click', e => { toggleStar(d.num); e.target.classList.toggle('on'); e.target.textContent = isStar(d.num) ? '★ Starred' : '☆ Star'; });
    $('#fs-down').addEventListener('click', () => { state.fs = Math.max(.85, +(state.fs - .08).toFixed(2)); store.set('fs', state.fs); applyFs(); });
    $('#fs-up').addEventListener('click', () => { state.fs = Math.min(1.5, +(state.fs + .08).toFixed(2)); store.set('fs', state.fs); applyFs(); });
    const collapse = $('#btn-collapse');
    collapse.addEventListener('click', () => {
      const body = view.querySelector('.d-body'); const on = body.classList.toggle('collapsed');
      collapse.textContent = on ? 'Expand all' : 'Collapse all';
      body.querySelectorAll('.blk').forEach(p => { if (!(p.classList.contains('heading') && p.classList.contains('l1'))) p.hidden = on; });
    });
    view.querySelectorAll('.blk').forEach(p => p.addEventListener('click', () => {
      const url = location.href.split('#')[0] + '#/d/' + d.num + '/b/' + p.dataset.id;
      history.replaceState(null, '', '#/d/' + d.num + '/b/' + p.dataset.id);
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => { });
      view.querySelectorAll('.blk.target').forEach(x => x.classList.remove('target')); p.classList.add('target');
    }));
    view.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const t = $('#b' + a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', a.getAttribute('href'));
    }));

    if (blockId != null) {
      const t = $('#b' + blockId);
      if (t) { requestAnimationFrame(() => { t.scrollIntoView({ block: 'center' }); t.classList.add('target'); }); }
    }
  }

  function titleCase(s) {
    const small = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'from']);
    const keep = /^(ORC|TMC|TPD|TASER|OVI|LPR|UAS|DFR|UTV|ATV|SWAT|CALEA|LCCS|NOBS|EIS|CAD|MDC|BWC|DUI|DNA|ID|IAB|SOP|FOP|TOT|CIT|EMS|BAC|K-?9|II|III|IV|LGBTQ\+?|NCIC|LEADS|OHLEG|FBI|ATF|DEA|USC|DA-LE|RTCC|PIO|EAP|CPR|AED|HIPAA|FMLA|NIBRS|UCR|TFRD|DV|SRT|VIN|GPS|PDF|TV|CCW|CPO|TPO|LEO|CBD|THC|NARCAN|MDT|DOB|SSN|AWOL|EEO|EEOP|ADA|PTSD|SOG|SOGs|FTO|OPOTA|OPOTC|BMV|RMS|JDC|BCI|OSP|SO|US|USA|CDL|HAZMAT)$/i;
    return s.toLowerCase().split(' ').map((w, i) => {
      const bare = w.replace(/[^a-z0-9+\-]/gi, '');
      if (keep.test(bare)) return w.toUpperCase();
      if (i > 0 && small.has(w)) return w;
      return w.replace(/(^|[\/(\-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
    }).join(' ');
  }

  function takeHtml(d) {
    const t = d.take;
    const list = (arr, cls, title) => arr && arr.length ? h`<h3 class="${cls}">${title}</h3><ul>${arr.map(x => h`<li>${fmt(x)}</li>`).join('')}</ul>` : '';
    return h`<section class="card take">
      <div class="take-head"><h2>Quick Take</h2><span class="badge admin">Plain language</span></div>
      ${(t.summary || []).map(p => h`<p>${fmt(p)}</p>`).join('')}
      ${list(t.must, 'must', 'You must')}
      ${list(t.never, 'never', 'Never')}
      ${list(t.notes, 'notes', 'On the street')}
      <p class="disclaimer">Quick Takes paraphrase the directive. The full text below is what controls; section numbers point you to it.</p>
    </section>`;
  }

  function continuumHtml(b) {
    return h`<div class="continuum" id="b${b.id}">
      <div class="ch"><span>Subject’s actions</span><span>Officer’s responses</span></div>
      ${b.rows.map(r => h`<div class="cr"><span class="bar" style="background:${r.color}"></span>
        <ul class="act">${r.actions.map(a => h`<li>${esc(a)}</li>`).join('')}</ul>
        <ul class="resp">${r.responses.map(a => h`<li>${esc(a)}</li>`).join('')}</ul></div>`).join('')}
    </div>`;
  }

  // ---------- About ----------
  function renderAbout() {
    setChrome({ back: true, sub: 'About' });
    const takes = DATA.directives.filter(d => d.take).length;
    view.innerHTML = h`<div class="card d-head about">
      <h1 class="d-title" style="font-family:var(--font-display);font-size:var(--text-xl);margin:0 0 var(--space-3)">About this reference</h1>
      <p>This is the Toledo Police Department manual (Standard Operating Guidelines, ${DATA.edition} edition) reorganized for reading on a phone. Every directive is here in full, split into its original sections and numbered paragraphs, with the department's own emphasized rules highlighted.</p>
      <p>${takes} directives also have a <b>Quick Take</b>: a plain-language summary with the must and must-not rules pulled out and section references pointing back to the controlling text. More are added over time.</p>
      <h2>Flags</h2>
      <div class="legend">
        <div><span class="flag high"></span><span><b>High liability.</b> Split-second or lawsuit-prone policies. Know these cold.</span></div>
        <div><span class="flag medium"></span><span><b>Know the gist.</b> Comes up on patrol; know the shape of it and where to find the details.</span></div>
        <div><span class="flag admin"></span><span><b>Reference.</b> Administrative material. Look it up when you need it.</span></div>
      </div>
      <h2>Using it</h2>
      <p>Search covers every paragraph, definition, and Quick Take. Tap a paragraph to copy a link straight to it. Star directives you want to come back to. Chapter open/closed state, text size, stars and dark mode are remembered on this device.</p>
      <p><b>Add to your home screen:</b> in Safari tap Share, then “Add to Home Screen.” In Chrome tap the menu, then “Add to Home screen.” It will open full-screen like an app.</p>
      <p class="muted small">Flags and Quick Takes are editorial aids, not department guidance. The manual text itself is the authority.</p>
    </div>`;
  }

  // ---------- boot ----------
  fetch('data.json').then(r => r.json()).then(data => {
    DATA = data;
    DATA.directives.sort((a, b) => numSort(a.num, b.num));
    DATA.directives.forEach(d => { BY_NUM[d.num] = d; });
    ORDER = DATA.directives.map(d => d.num);
    $('#loading').classList.add('hide');
    route();
  }).catch(err => {
    $('#loading').innerHTML = '<div class="loading-card"><p>Could not load the manual data.<br><small>' + esc(err.message) + '</small></p></div>';
  });
})();
