/* ============================================================
 * components/cabinets-tool.js — أداة «كبائن التوزيع» في سطر أدوات الخريطة (تصميم محمد 19 نوفمبر)
 * ============================================================
 * - العضو يكتب رقم المحطة ← قائمة كبائنها بالتسلسل: «C / 39070 - 1 — المسافة 60م — انطلاق»، وكل كبينة علامة بنفسجية
 *   برقم تسلسلها على الخريطة؛ الضغط على السطر يقرّب الخريطة عليها، و«انطلاق» يبدأ الملاحة إليها.
 * - المسافة من موقع العضو الحالي (قرار محمد)؛ تعذّر الموقع ← من المحطة إن وُجدت في النسخة، وإلا بلا مسافة.
 * - من نسخة الجهاز فقط بلا طلب للخادم، فتعمل بدون إنترنت. لا كبائن ← رسالة واضحة.
 * - الألوان بتصميم محمد 4: شريط لوني بنفسجي على طرف كل سطر، والرقم بلون النوع.
 *
 * The «distribution cabinets» map tool: type a station number ← its cabinets by sequence with the distance from the
 * member (or the station) and a «go» button; purple numbered markers on the map. From the device copy only (offline).
 * ============================================================ */
(function (global) {
  'use strict';

  const Q = global.SecStationQuery, H = global.SecHtml, TI = global.SecTextInput;
  if (!Q || !H || !TI) throw new Error('cabinets-tool.js يحتاج station-query.js وhtml.js وtext-input.js قبله / needs station-query.js, html.js and text-input.js first');
  const COLOR = '#9B7BE8';
  const MSG = {
    TITLE: 'كبائن التوزيع — اكتب رقم المحطة',
    STATION_REQUIRED: 'اكتب رقم المحطة (أرقام فقط)',
    NO_COPY: 'نسخة المحطات لم تُحمَّل بعد — انتظر اكتمال التحميل',
    NONE: 'لا توجد كبائن مسجّلة للمحطة ',
    LOCATING: 'جاري تحديد موقعك لحساب المسافة…',
    FROM_ME: 'المسافة من موقعك',
    FROM_STATION: 'المسافة من المحطة (تعذّر تحديد موقعك)',
    NO_DISTANCE: 'تعذّر تحديد موقعك، والمحطة غير موجودة في النسخة',
    GO: 'انطلاق'
  };

  /* المسافة بصيغة قصيرة: أمتار تحت الكيلو — the distance, short: metres under a kilometre */
  function dist_(km) { return km < 1 ? Math.round(km * 1000) + 'م' : (Math.round(km * 10) / 10) + ' كم'; }
  /* «C / 39070 - 1» كما في تصميم محمد — as in Mohammed's design */
  function spaced_(id) { const p = Q.cabinetParts(id); return p ? 'C / ' + p.station + ' - ' + p.seq : String(id); }

  /**
   * mountMap(view, opts) — opts: { stations() → نسخة الجهاز أو null، onStart() (تمسح الصفحة أدوات أخرى)، isBlocked()،
   *   onNavigate(cabinet) (الملاحة)، locate() → Promise({lat,lng}) (اختياري؛ الافتراضي SecMyLocation) }
   * يُرجع { show(station)، clear()، list()، destroy() }
   */
  function mountMap(view, opts) {
    const o = opts || {};
    const map = view.map, L = global.L, doc = global.document;
    let markers = [], shown = [], seq = 0;
    view.tools.insertAdjacentHTML('beforeend', '<button type="button" class="toolbar-btn" data-cabinets="toggle" title="كبائن التوزيع لمحطة"><span class="tb-icon">▣</span><span class="tb-label">كبائن توزيع</span></button>');
    view.panels.insertAdjacentHTML('beforeend', '<div class="outage-panel cab-panel" data-role="cab-panel">' +
      '<div class="outage-panel-title">' + MSG.TITLE + '</div>' +
      '<input class="cab-input" data-role="cab-input" inputmode="numeric" placeholder="مثال: 39070" autocomplete="new-password" data-lpignore="true" data-form-type="other" autocorrect="off" autocapitalize="off" spellcheck="false">' +
      '<div class="outage-error" data-role="cab-error" role="alert"></div><button type="button" class="outage-submit-btn" data-act="cab-show">عرض الكبائن</button></div>');
    const panel = view.panels.querySelector('[data-role="cab-panel"]'), btn = view.tools.querySelector('[data-cabinets="toggle"]');
    const input = panel.querySelector('[data-role="cab-input"]'), err = panel.querySelector('[data-role="cab-error"]');
    TI.digits(input);

    function clear() {
      seq++;
      markers.forEach(function (m) { map.removeLayer(m); }); markers = []; shown = [];
      const card = view.panels.querySelector('[data-role="cab-list"]'); if (card) card.remove();
    }
    function icon_(n) {
      return L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="outage-letter cab-pin" style="background:' + COLOR + '">' + n + '</div>' });
    }

    /* قائمة الكبائن تحت الشريط — the cabinets list under the toolbar */
    function listCard_(station, rows, note) {
      const card = doc.createElement('div');
      card.className = 'cab-list'; card.dataset.role = 'cab-list';
      const head = doc.createElement('div'); head.className = 'cab-list-head';
      const t = doc.createElement('b'); t.textContent = 'كبائن المحطة ' + station + ' (' + rows.length + ')';
      const x = doc.createElement('button'); x.type = 'button'; x.className = 'outage-missing-x'; x.setAttribute('aria-label', 'إغلاق'); x.textContent = '✕';
      x.addEventListener('click', clear);
      head.append(t, x);
      card.appendChild(head);
      if (note) { const n = doc.createElement('div'); n.className = 'cab-note'; n.textContent = note; card.appendChild(n); }
      rows.forEach(function (r) {
        const row = doc.createElement('div'); row.className = 'cab-row'; row.dataset.id = r.s.id;
        const id = doc.createElement('bdi'); id.className = 'cab-id'; id.textContent = spaced_(r.s.id);
        const d = doc.createElement('span'); d.className = 'cab-dist'; d.textContent = r.km == null ? '—' : 'المسافة ' + dist_(r.km);
        const go = doc.createElement('button'); go.type = 'button'; go.className = 'cab-go'; go.textContent = MSG.GO;
        go.addEventListener('click', function (e) { e.stopPropagation(); if (o.onNavigate) o.onNavigate(r.s); });
        row.addEventListener('click', function () { if (view.centerOn) view.centerOn([r.s.lat, r.s.lng], 18); else map.setView([r.s.lat, r.s.lng], 18); });
        row.append(id, d, go);
        card.appendChild(row);
      });
      view.panels.appendChild(card);
    }

    async function show(rawStation) {
      const station = TI.normalizeCode(String(rawStation !== undefined ? rawStation : input.value)).replace(/[^0-9]/g, '');
      err.textContent = '';
      if (!station) { err.textContent = MSG.STATION_REQUIRED; return null; }
      if (o.isBlocked && o.isBlocked()) return null;
      const all = o.stations ? o.stations() : null;
      if (!all) { err.textContent = MSG.NO_COPY; return null; }
      const cabs = Q.cabinetsOf(all, station).filter(Q.hasCoordinates);
      if (!cabs.length) { err.textContent = MSG.NONE + station; return { station: station, cabinets: [] }; }
      clear();
      const my = seq;
      if (o.onStart) { try { o.onStart(); } catch (e) { /* لا شيء / nothing */ } }
      panel.classList.remove('show');
      // العلامات فورًا، والمسافة بعد تحديد الموقع — the markers at once, the distance once located
      const bounds = [];
      cabs.forEach(function (s) {
        const p = Q.cabinetParts(s.id), m = L.marker([Number(s.lat), Number(s.lng)], { icon: icon_(p.seq) });
        m.bindPopup('<div class="outage-popup"><b>' + H.esc(Q.kindLabel(s) + ' ' + s.id) + '</b>' + (s.region ? '<br>الحي: ' + H.esc(s.region) : '') + (s.feeder ? '<br>رقم الفيدر: ' + H.esc(s.feeder) : '') + '</div>');
        m.addTo(map); markers.push(m); bounds.push([Number(s.lat), Number(s.lng)]);
      });
      const fitOpts = Object.assign(view.fitPadding ? view.fitPadding(44) : { padding: [44, 44] }, { maxZoom: 17 }), fitPts = bounds.length > 1 ? bounds : [bounds[0], bounds[0]];
      if (view.fitSafe) view.fitSafe(fitPts, fitOpts); else map.fitBounds(fitPts, fitOpts);
      view.hint(MSG.LOCATING);
      let from = null, note = '';
      try { from = await (o.locate ? o.locate() : global.SecMyLocation.read()); note = MSG.FROM_ME; } catch (e) { from = null; }
      if (my !== seq) return null; // أُغلقت أو بحث آخر أثناء التحديد / closed or another search meanwhile
      if (!from) {
        const st = all.filter(function (s) { return s.type === 'توزيع' && String(s.id).trim() === station && Q.hasCoordinates(s); })[0];
        if (st) { from = { lat: Number(st.lat), lng: Number(st.lng) }; note = MSG.FROM_STATION; } else note = MSG.NO_DISTANCE;
      }
      view.hideHint();
      const rows = cabs.map(function (s) { return { s: s, km: from ? Q.distanceKm(from, { lat: Number(s.lat), lng: Number(s.lng) }) : null }; });
      shown = rows;
      listCard_(station, rows, note);
      return { station: station, cabinets: rows };
    }

    function onToolsClick_(e) { if (e.target.closest('[data-cabinets="toggle"]')) { e.stopPropagation(); panel.classList.toggle('show'); if (panel.classList.contains('show')) input.focus(); } }
    function onPanelClick_(e) { if (e.target.closest('[data-act="cab-show"]')) show(); }
    function onKey_(e) { if (e.key === 'Enter') show(); }
    function onDocClick_(e) { if (!btn.contains(e.target) && !panel.contains(e.target)) panel.classList.remove('show'); }
    view.tools.addEventListener('click', onToolsClick_);
    panel.addEventListener('click', onPanelClick_);
    input.addEventListener('keydown', onKey_);
    doc.addEventListener('click', onDocClick_);

    return {
      show: show, clear: clear,
      list: function () { return shown.map(function (r) { return { id: r.s.id, km: r.km }; }); },
      destroy: function () {
        clear();
        view.tools.removeEventListener('click', onToolsClick_); panel.removeEventListener('click', onPanelClick_);
        input.removeEventListener('keydown', onKey_); doc.removeEventListener('click', onDocClick_);
        btn.remove(); panel.remove();
      }
    };
  }

  global.SecCabinetsTool = { mountMap: mountMap, MSG: MSG, spaced: spaced_ };
})(typeof window !== 'undefined' ? window : globalThis);
