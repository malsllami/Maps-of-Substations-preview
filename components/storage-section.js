/* ============================================================
 * components/storage-section.js — قسم «البيانات المؤقتة» في الرئيسية (تصميم محمد — 15 أكتوبر)
 * ============================================================
 * - رأس: العنوان وزر «مسح التخزين المؤقت».
 * - «الذاكرة المستخدمة»: المستخدم / المتاح، شريط، ونسبة مئوية.
 * - أربع خانات: حجم بيانات المحطات، عدد المحطات المحفوظة، آخر تحديث (الوقت + الميلادي)، والهجري مع المدة منذ التحديث.
 * - سطر حالة يظهر فقط إن لم تُحمَّل المحطات أو لم تُحفظ بالجهاز؛ وسطر «آخر مزامنة» (ميلادي + هجري) برقم النسخة.
 * حالة المحطات من services/stations-sync.js فقط (state/onChange/clear) — لا قراءة للمحطات هنا.
 * V2:
 * - إصلاح بند V1 رقم 5: المسح يُبقي الجلسة والجوال والثيم ونمط الخريطة ودوران الملاحة ومظهر لوحتها، وطابور الأخطاء
 *   غير المرسلة (حتى لا تضيع بلاغات الأعطال).
 * - المسح لا يمس إلا مفاتيح V2 (بادئة sec2-) — V1 على نفس النطاق لا يُلمس (V1 كان يمسح localStorage كله).
 * - خريطة جدة المحلية لا تُمسح هنا (كما في V1) — لها نافذة إدارتها.
 * - شريط الذاكرة من تقدير المتصفح الحقيقي (navigator.storage.estimate: المحطات وخريطة جدة وملفات الموقع) بدل عدّ
 *   localStorage وحده بسقف مفترض 50 MB؛ إن لم يتوفر التقدير ← طريقة V1 كما هي.
 * - التأكيد بنص V1 نفسه.
 *
 * The home page «cached data» section (Mohammed's design — 15 Oct): a header with the clear button, the usage bar with a
 * percentage, four cells (station data size, stored count, last update time + Gregorian date, Hijri date + age), a status
 * line only when not loaded / not persisted, and a «last sync» line (Gregorian + Hijri) with the version. Station state
 * from stations-sync only. V2: fixes V1 bug 5 (preferences kept), clears V2 keys only, the usage bar from the browser's
 * real estimate (V1's way as the fallback).
 * ============================================================ */
(function (global) {
  'use strict';

  const CONFIG = global.SEC2_CONFIG, D = global.SecDates;
  if (!CONFIG || !D) throw new Error('storage-section.js يحتاج الإعدادات وdates.js قبله / needs the config and dates.js first');
  const K = CONFIG.STORAGE_KEYS, PREFIX = CONFIG.STORAGE_PREFIX;
  const ASSUMED_CAP_MB = 50; // سقف V1 المفترض — للاحتياط فقط / V1's assumed cap — fallback only
  const AGE_REFRESH_MS = 30 * 1000;
  const GREGORY_NUMERIC = 'ar-SA-u-ca-gregory-nu-latn';
  /* ما يبقى بعد المسح — What survives a clear.
     علامة «البداية النظيفة» تبقى: بدونها تُعاد البداية النظيفة فتمسح الجلسة وتُخرج المستخدم (خلل اكتُشف 16 أكتوبر)
     The fresh-start marker stays: without it the fresh start reruns, clearing the session and logging the user out */
  const KEEP = [K.SESSION, K.PHONE, K.REMEMBER_PHONE, K.THEME, K.MAP_MODE, K.NAV_GLASS, K.NAV_ROTATE, K.MAP_STATUS_HIDDEN, K.MAP_TOOLS_HIDDEN, K.MAP_TOOLS_FOLDED, K.SEARCH_KEYBOARD, K.VERSION_SINCE, K.PENDING_ERRORS, K.FRESH_START, K.DEVICE_ID, K.UPDATE_LOGOUT_DONE];
  const MSG = {
    TITLE: 'البيانات المؤقتة',
    CLEAR: 'مسح التخزين المؤقت',
    // (21 أكتوبر) ليست ذاكرة الجوال: تقدير المتصفح لكل ما يحفظه الموقع، والحد الأعلى هو ما يسمح به المتصفح للموقع
    // Not the phone's memory: the browser's estimate of everything the site stores; the cap is what the browser allows it
    USED: 'مساحة الموقع على هذا الجهاز',
    USED_NOTE: 'تقدير المتصفح لكل ما يحفظه الموقع (ملفات الموقع للعمل بدون إنترنت، ونسخة المحطات، وخريطة جدة). المسح لا يحذف ملفات الموقع، وقد يتأخر المتصفح في تحديث الرقم.',
    SIZE: 'حجم بيانات المحطات',
    COUNT: 'عدد المحطات المحفوظة',
    UPDATED: 'آخر تحديث',
    HIJRI: 'التاريخ الهجري',
    CONFIRM: 'مسح البيانات المؤقتة المحفوظة بجهازك (المحطات الأخيرة وغيرها)؟ لن يمسّ هذا جلستك الحالية ولا بيانات الشيت.',
    NOT_LOADED: 'بيانات المحطات لم تُحمَّل بعد',
    IN_MEMORY: 'بيانات المحطات بالذاكرة فقط، لم تُحفظ بالجهاز',
    LATEST: 'آخر مزامنة: ',
    VERSION: ' · النسخة ',
    // (19 نوفمبر، ترتيب محمد) — Mohammed's order
    REFRESH: 'تحديث',
    GREGORIAN: 'التاريخ الميلادي', TIME: 'الوقت', VERSION_NO: 'رقم النسخة'
  };

  // أيقونات خطية بسيطة — simple line icons
  const SVG = function (body) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>'; };
  const ICONS = {
    db: SVG('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    file: SVG('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'),
    clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    calendar: SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')
  };
  // (19 نوفمبر، ترتيب محمد) صف لكل نوع: حجم بياناته | عدده — a row per kind: its data size | its count
  const KINDS = [['dist', 'حجم بيانات المحطات', 'عدد محطات التوزيع المحفوظة'], ['switch', 'حجم بيانات السكاكين', 'عدد السكاكين الهوائية'],
    ['cabinet', 'حجم بيانات كبائن التوزيع', 'عدد كبائن التوزيع'], ['sub', 'حجم بيانات محطات التحويل', 'عدد محطات التحويل']];
  /* الحجم: كيلوبايت تحت الميغا — the size: kilobytes under a megabyte */
  function size_(bytes) { return bytes < 1024 * 1024 ? Math.max(bytes > 0 ? 1 : 0, Math.round(bytes / 1024)) + ' KB' : mb_(bytes) + ' MB'; }

  function mb_(bytes) { return (bytes / (1024 * 1024)).toFixed(2); }
  function gb_(bytes) { return bytes >= 1024 * 1024 * 1024 ? (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : Math.round(bytes / (1024 * 1024)) + ' MB'; }

  /* تقدير V1: كل localStorage بالـUTF-16 — V1's estimate: all localStorage as UTF-16 */
  function localStorageBytes_() {
    let total = 0;
    try {
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i), value = global.localStorage.getItem(key) || '';
        total += (key.length + value.length) * 2;
      }
    } catch (e) { /* محظور / blocked */ }
    return total;
  }
  async function usage_() {
    const st = global.navigator.storage;
    if (st && st.estimate) {
      try {
        const e = await st.estimate();
        if (e && e.quota > 0) return { used: e.usage || 0, cap: e.quota, real: true };
      } catch (err) { /* إلى طريقة V1 / to V1's way */ }
    }
    return { used: localStorageBytes_(), cap: ASSUMED_CAP_MB * 1024 * 1024, real: false };
  }

  /* مسح مفاتيح V2 المؤقتة فقط — Clear V2's temporary keys only */
  function clearKeys_() {
    const remove = [];
    try {
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0 && KEEP.indexOf(k) === -1) remove.push(k);
      }
      remove.forEach(function (k) { global.localStorage.removeItem(k); });
    } catch (e) { /* محظور / blocked */ }
    return remove;
  }
  function savedAt_() {
    try { const m = JSON.parse(global.localStorage.getItem(K.STATIONS_META) || 'null'); return m && m.savedAt ? Number(m.savedAt) || Date.parse(m.savedAt) || null : null; } catch (e) { return null; }
  }

  function html_() {
    return '<div class="storage-row" data-role="storage-row">' +
      '<div class="storage-head"><div class="storage-title"><span class="storage-title-icon">' + ICONS.db + '</span>' + MSG.TITLE + '</div></div>' +
      '<div class="storage-sync" data-role="sync"></div>' + // حالة النسخة: محدّثة أو نسخة جديدة / the copy status
      '<div class="storage-actions"><button type="button" class="storage-clear-btn" data-act="clear"><span class="storage-clear-icon">' + ICONS.trash + '</span>' + MSG.CLEAR + '</button>' +
        '<button type="button" class="storage-refresh-btn" data-act="refresh">⟳ ' + MSG.REFRESH + '</button></div>' +
      '<div class="storage-usage"><div class="storage-usage-top"><span>' + MSG.USED + '</span><bdi class="storage-usage-val" data-role="usage">—</bdi></div>' +
        '<div class="storage-bar-wrap"><div class="storage-bar-track"><div class="storage-bar-fill" data-role="fill"></div></div><bdi class="storage-percent" data-role="percent">—</bdi></div>' +
        '<div class="storage-usage-note" data-role="usage-note" hidden>' + MSG.USED_NOTE + '</div></div>' +
      '<div class="storage-kinds">' + KINDS.map(function (k) {
        return '<div class="storage-kind is-' + k[0] + '"><div class="sk-cell"><span class="sk-label">' + k[1] + '</span><bdi class="sk-val" data-role="size-' + k[0] + '">—</bdi></div>' +
          '<div class="sk-cell"><span class="sk-label">' + k[2] + '</span><bdi class="sk-val" data-role="count-' + k[0] + '">—</bdi>' +
          (k[0] === 'switch' ? '<small class="sk-sub" data-role="switch-split"></small>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="storage-updated"><div class="su-title">' + ICONS.clock + MSG.UPDATED + '</div>' +
        '<div class="su-row su-full"><span class="sk-label">' + MSG.GREGORIAN + '</span><bdi class="sk-val" data-role="greg">—</bdi></div>' +
        '<div class="su-row"><div class="sk-cell"><span class="sk-label">' + MSG.HIJRI + '</span><bdi class="sk-val" data-role="hijri">—</bdi><small class="sk-sub" data-role="age"></small></div>' +
          '<div class="sk-cell"><span class="sk-label">' + MSG.TIME + '</span><bdi class="sk-val" data-role="time">—</bdi></div></div>' +
        '<div class="su-row su-full"><span class="sk-label">' + MSG.VERSION_NO + '</span><bdi class="sk-val mono" data-role="version">—</bdi></div></div>' +
      '<div class="stations-cache-info" data-role="info" hidden></div></div>';
  }

  /**
   * mount(container, opts) — opts: { confirm(text) → bool (افتراضيًا confirm المتصفح)، onCleared() }
   * يُرجع { render() → Promise، clear() → Promise<bool>، destroy() }
   */
  function mount(container, opts) {
    const o = opts || {}, SYNC = global.SecStationsSync;
    container.insertAdjacentHTML('beforeend', html_());
    const row = container.querySelector('[data-role="storage-row"]');
    const fill = row.querySelector('[data-role="fill"]'), usage = row.querySelector('[data-role="usage"]'), percentEl = row.querySelector('[data-role="percent"]');
    const info = row.querySelector('[data-role="info"]');
    // (19 نوفمبر) سطر حالة النسخة داخل البطاقة (محدّثة / نسخة جديدة) — the copy-status line inside the card
    if (o.syncLine) row.querySelector('[data-role="sync"]').appendChild(o.syncLine);
    const cell = function (role) { return row.querySelector('[data-role="' + role + '"]'); };
    let alive = true, seq = 0, unsub = null, lastAt = null;
    /* الهجري و«منذ …» (تتجدد كل 30 ث) — the Hijri date and «since …» (refreshed every 30 s) */
    function paintAge_() {
      if (!lastAt) return;
      const age = cell('age'); if (age) age.textContent = '(' + D.relativeTime(lastAt).replace(/^قبل /, 'منذ ') + ')';
    }
    function set_(role, text) { const el = cell(role); if (el) el.textContent = text; }

    function renderStations_() {
      const s = SYNC ? SYNC.state() : { loaded: false };
      lastAt = null;
      ['greg', 'hijri', 'age', 'time', 'version', 'switch-split'].concat(KINDS.map(function (k) { return 'size-' + k[0]; }), KINDS.map(function (k) { return 'count-' + k[0]; })).forEach(function (r) { set_(r, r === 'age' || r === 'switch-split' ? '' : '—'); });
      if (!s.loaded || !s.count) { info.textContent = MSG.NOT_LOADED; info.hidden = false; return; }
      // كل نوع: عدده وحجمه (نصيبه من حجم النسخة المحفوظة بنسبة بياناته) — each kind: its count and size (its share of the saved copy)
      const Q = global.SecStationQuery, list = SYNC.stations ? SYNC.stations() : [], count = {}, bytes = {}, split = { BS: 0, LBS: 0 };
      let all = 0;
      KINDS.forEach(function (k) { count[k[0]] = 0; bytes[k[0]] = 0; });
      list.forEach(function (st) {
        const k = Q ? Q.kindOf(st) : (st.type === 'تحويل' ? 'sub' : 'dist'), b = JSON.stringify([st.id, st.type, st.feeder, st.region, st.lat, st.lng]).length;
        count[k] = (count[k] || 0) + 1; bytes[k] = (bytes[k] || 0) + b; all += b;
        if (k === 'switch') { const p = Q.switchParts(st.id); if (p && split[p.prefix] != null) split[p.prefix]++; }
      });
      const total = s.persisted ? (s.sizeBytes || 0) : 0;
      KINDS.forEach(function (k) {
        set_('count-' + k[0], String(count[k[0]] || 0));
        set_('size-' + k[0], total && all ? size_(total * bytes[k[0]] / all) : '—');
      });
      set_('switch-split', 'عادية BS ' + split.BS + ' | سمارت LBS ' + split.LBS);
      if (s.persisted) { info.textContent = ''; info.hidden = true; } else { info.textContent = MSG.IN_MEMORY; info.hidden = false; }
      const at = s.syncedAt || savedAt_();
      if (s.version != null) set_('version', String(s.version));
      if (!at) return;
      lastAt = new Date(at);
      set_('greg', lastAt.toLocaleDateString(GREGORY_NUMERIC, { day: 'numeric', month: 'long', year: 'numeric' }) + ' م');
      set_('hijri', D.hijri(lastAt));
      set_('time', D.time(lastAt));
      paintAge_();
    }
    async function render() {
      const my = ++seq;
      renderStations_();
      const u = await usage_();
      if (!alive || my !== seq) return;
      const ratio = Math.min(100, u.used / u.cap * 100);
      usage.textContent = mb_(u.used) + ' MB / ' + (u.real ? gb_(u.cap) : ASSUMED_CAP_MB + ' MB');
      fill.style.width = Math.round(ratio) + '%';
      percentEl.textContent = ratio.toFixed(2) + '%';
      row.querySelector('[data-role="usage-note"]').hidden = !u.real; // التوضيح للتقدير الحقيقي فقط / the note for the real estimate only
    }
    async function clear() {
      const ask = o.confirm || function (t) { return global.confirm(t); };
      if (!ask(MSG.CONFIRM)) return false;
      clearKeys_();
      if (global.SecRecentStations) global.SecRecentStations.clear(); // لتحديث لوحتها المفتوحة / to refresh its open panel
      if (SYNC) { try { await SYNC.clear(); } catch (e) { /* تبقى الصفحة تعمل / the page keeps working */ } }
      await render();
      if (o.onCleared) { try { o.onCleared(); } catch (e) { /* لا شيء / nothing */ } }
      return true;
    }
    function onClick_(e) {
      if (e.target.closest('[data-act="clear"]')) clear();
      else if (e.target.closest('[data-act="refresh"]') && o.onRefresh) o.onRefresh(); // (19 نوفمبر) تحديث النسخة / update the copy
    }

    row.addEventListener('click', onClick_);
    const ageTimer = global.setInterval(paintAge_, AGE_REFRESH_MS);
    if (SYNC) unsub = SYNC.onChange(function () { render(); });
    render();

    return {
      render: render, clear: clear,
      destroy: function () {
        alive = false;
        global.clearInterval(ageTimer);
        row.removeEventListener('click', onClick_);
        if (typeof unsub === 'function') unsub();
        row.remove();
      }
    };
  }

  global.SecStorageSection = { mount: mount, KEEP: KEEP, MSG: MSG };
})(typeof window !== 'undefined' ? window : globalThis);
