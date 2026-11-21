/* ============================================================
 * components/recent-tool.js — زر «آخر المحطات» في شريط أدوات الخريطة (طلب محمد 21 نوفمبر، النموذج 1)
 * ============================================================
 * - أول زر في الشريط بدل شريحة «نهاري/ليلي» (زر الطبقات الجانبي يؤدي دورها).
 * - الضغط ← قائمة تحت الشريط مثل «كبائن التوزيع»: سطر لكل محطة فتحها العضو خلال آخر 72 ساعة، الأحدث أولًا، بشريط
 *   بلون نوعها ورقمها ونوعها و«منذ كم» والمسافة من موقعه و«انطلاق». الضغط على السطر يفتح المحطة.
 * - ما مضى عليه 72 ساعة يختفي من هذه القائمة وحدها؛ السجل نفسه محفوظ للأبد في بطاقة «محطاتك الأخيرة» بشاشة «البيانات».
 * - من الجهاز فقط بلا طلب للخادم، فتعمل بدون إنترنت.
 *
 * The «recent stations» map tool: the first toolbar button (replacing the day/night chip). A cabinets-style list of the
 * stations opened in the last 72 hours, newest first, with the kind's color, «how long ago», the distance from the member
 * and «go»; a tap opens the station. Older ones leave this list only — the log itself is kept forever on the data screen.
 * ============================================================ */
(function (global) {
  'use strict';

  const CONFIG = global.SEC2_CONFIG, Q = global.SecStationQuery, D = global.SecDates, R = global.SecRecentStations;
  if (!CONFIG || !Q || !D || !R) throw new Error('recent-tool.js يحتاج الإعدادات وstation-query.js وdates.js وrecent-stations.js قبله / needs config, station-query.js, dates.js and recent-stations.js first');
  const MAX_AGE_MS = CONFIG.TIMING.RECENT_MAP_MS;
  const MSG = {
    TITLE: 'آخر المحطات — آخر 72 ساعة',
    EMPTY: 'لا محطات فتحتها خلال آخر 72 ساعة',
    LOCATING: 'جاري تحديد موقعك لحساب المسافة…',
    FROM_ME: 'المسافة من موقعك',
    NO_DISTANCE: 'تعذّر تحديد موقعك — بلا مسافة',
    GO: 'انطلاق'
  };

  function dist_(km) { return km < 1 ? Math.round(km * 1000) + 'م' : (Math.round(km * 10) / 10) + ' كم'; }

  /**
   * mountMap(view, opts) — opts: { onStart() (تمسح الصفحة أدوات أخرى)، isBlocked()، onSelect(station)، onNavigate(station)،
   *   locate() → Promise({lat,lng}) (اختياري؛ الافتراضي SecMyLocation) }
   * يُرجع { show()، clear()، list()، destroy() }
   */
  function mountMap(view, opts) {
    const o = opts || {}, doc = global.document;
    let shown = [], seq = 0;
    view.tools.insertAdjacentHTML('afterbegin', '<button type="button" class="toolbar-btn" data-recent="toggle" title="المحطات التي فتحتها خلال آخر 72 ساعة"><span class="tb-icon">🕐</span><span class="tb-label">آخر المحطات</span></button>');
    const btn = view.tools.querySelector('[data-recent="toggle"]');

    function card_() { return view.panels.querySelector('[data-role="recent-list"]'); }
    function clear() { seq++; shown = []; const c = card_(); if (c) c.remove(); btn.classList.remove('active'); }

    /* سطر محطة: الشريط بلون نوعها، والرقم، والنوع و«منذ كم»، والمسافة، و«انطلاق» — a station row */
    function row_(r) {
      const row = doc.createElement('div'); row.className = 'cab-row recent-row k-' + Q.kindOf(r.s); row.dataset.id = r.s.id;
      const main = doc.createElement('div'); main.className = 'recent-row-main';
      const id = doc.createElement('bdi'); id.className = 'cab-id recent-id'; id.textContent = r.s.id;
      const sub = doc.createElement('span'); sub.className = 'recent-sub';
      sub.textContent = Q.kindLabel(r.s) + ' · ' + D.relativeTime(new Date(r.s.visitedAt)).replace(/^قبل /, 'منذ ');
      main.append(id, sub);
      const d = doc.createElement('span'); d.className = 'cab-dist'; d.dataset.role = 'dist'; d.textContent = r.km == null ? '' : dist_(r.km);
      const go = doc.createElement('button'); go.type = 'button'; go.className = 'cab-go recent-go'; go.textContent = MSG.GO;
      go.addEventListener('click', function (e) { e.stopPropagation(); if (o.onNavigate) o.onNavigate(r.s); });
      row.addEventListener('click', function () { clear(); if (o.onSelect) o.onSelect(r.s); });
      row.append(main, d, go);
      return row;
    }
    function render_(note) {
      const old = card_(); if (old) old.remove();
      const card = doc.createElement('div'); card.className = 'cab-list recent-list'; card.dataset.role = 'recent-list';
      const head = doc.createElement('div'); head.className = 'cab-list-head recent-list-head';
      const t = doc.createElement('b'); t.textContent = MSG.TITLE + ' (' + shown.length + ')';
      const x = doc.createElement('button'); x.type = 'button'; x.className = 'outage-missing-x'; x.setAttribute('aria-label', 'إغلاق'); x.textContent = '✕';
      x.addEventListener('click', clear);
      head.append(t, x); card.appendChild(head);
      if (!shown.length) { const e = doc.createElement('div'); e.className = 'cab-note'; e.textContent = MSG.EMPTY; card.appendChild(e); }
      else {
        if (note) { const n = doc.createElement('div'); n.className = 'cab-note'; n.textContent = note; card.appendChild(n); }
        shown.forEach(function (r) { card.appendChild(row_(r)); });
      }
      view.panels.appendChild(card);
    }

    async function show() {
      if (o.isBlocked && o.isBlocked()) return null;
      clear();
      const my = seq;
      if (o.onStart) { try { o.onStart(); } catch (e) { /* لا شيء / nothing */ } }
      btn.classList.add('active');
      // أحدث بيانات كل محطة من نسخة الجهاز — each station's latest data from the device copy
      shown = R.list(Date.now(), MAX_AGE_MS).map(function (e) { return { s: Object.assign({}, R.fresh(e), { visitedAt: e.visitedAt }), km: null }; });
      const located = shown.filter(function (r) { return Q.hasCoordinates(r.s); });
      render_(located.length ? MSG.LOCATING : '');
      if (!located.length) return { stations: shown };
      let from = null;
      try { from = await (o.locate ? o.locate() : global.SecMyLocation.read()); } catch (e) { from = null; }
      if (my !== seq) return null; // أُغلقت أثناء التحديد / closed meanwhile
      shown.forEach(function (r) { if (from && Q.hasCoordinates(r.s)) r.km = Q.distanceKm(from, { lat: Number(r.s.lat), lng: Number(r.s.lng) }); });
      render_(from ? MSG.FROM_ME : MSG.NO_DISTANCE);
      return { stations: shown };
    }

    function onToolsClick_(e) { if (e.target.closest('[data-recent="toggle"]')) { e.stopPropagation(); if (card_()) clear(); else show(); } }
    view.tools.addEventListener('click', onToolsClick_);

    return {
      show: show, clear: clear,
      list: function () { return shown.map(function (r) { return { id: r.s.id, kind: Q.kindOf(r.s), km: r.km, visitedAt: r.s.visitedAt }; }); },
      destroy: function () { clear(); view.tools.removeEventListener('click', onToolsClick_); btn.remove(); }
    };
  }

  global.SecRecentTool = { mountMap: mountMap, MSG: MSG };
})(typeof window !== 'undefined' ? window : globalThis);
