// OHLC Viewer - frontend (lightweight-charts v5 API)
//
// A "view" is one chart panel. Each view has its own candlesticks, timeframe,
// indicators, zoom and price margins. The app can show one view, or two side by
// side (Split) so you can compare timeframes at once. A sliding window of
// trading days is kept on screen, centred on a focused day; the window WIDTH
// scales with the timeframe so the on-screen bar count is stable across
// timeframes (1m ≈ 7 days, 5m ≈ 35 days, …). The default/reset zoom targets a
// CONSTANT CANDLE WIDTH in pixels, so the look is identical at any timeframe and
// in Split mode (where each pane is half width). All toolbar buttons act on the
// SELECTED view (click a chart to select it) — the TradingView-like single
// toolbar + split-pane model. With "Link" on, the two Split panes keep their
// centres aligned in time while panning (even at different timeframes).

const BASE_DAYS = 5;             // window width (in days) at the 1-minute base
const MARGIN = 40;               // bars from an edge that triggers a data fetch
const PRICE_MARGIN_FRAC = 0.02;  // top/bottom margin as a fraction of the visible price range (timeframe-independent)
const DEFAULT_CANDLE_PX = 7;     // target candle width (px) for default/reset zoom
const UP = '#26a69a', DOWN = '#ef5350';
const TF_OPTIONS = [1, 5, 15, 60, '1D'];
const TF_LABEL = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', '1D': '1D' };
const TF_MIN = { 1: 1, 5: 5, 15: 15, 60: 60, '1D': 390 };

// 390 trading minutes per day → an intraday `tf` window of BASE_DAYS*tf days
// keeps the on-screen bar count stable across timeframes. The 1D window shows
// up to 500 trading days of daily bars (or all available days if fewer).
function tfMinutes(tf) { return TF_MIN[tf] || 1; }
function tfDays(tf) {
    if (tf === '1D') return Math.min(500, Math.max(1, app.dates.length));
    return BASE_DAYS * tfMinutes(tf);
}
function tfText(tf) { return (tf === '1') ? '1m' : (tf === '1D' ? '1D' : tf + 'm'); }

const app = { dates: [], symbol: '', centerIdx: null, views: [], split: false, activeView: null, linked: false };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function setStatus(msg) { document.getElementById('status').textContent = msg || ''; }
function fmt(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '-';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchRange(from, to, tf) {
    const url = '/api/data?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) +
                '&tf=' + encodeURIComponent(tf);
    const json = await (await fetch(url)).json();
    return json.bars || [];
}

// Window of day-indices for a view, centred on app.centerIdx. Width scales with
// the view's timeframe; the window is shifted (kept at full width where
// possible) so it stays within the available trading days.
function viewWindow(v) {
    const last = app.dates.length - 1;
    const half = Math.floor(tfDays(v.timeframe) / 2);
    let from = app.centerIdx - half;
    let to = app.centerIdx + half;
    if (from < 0) { to -= from; from = 0; }
    if (to > last) { from -= (to - last); to = last; }
    from = Math.max(0, from);
    to = Math.min(last, to);
    return [from, to];
}

function viewTemplate() {
    return `
        <div class="cv-head">
            <span class="cv-tflabel"></span>
            <div class="cv-legend">
                <span class="up">O <b class="lo">-</b></span>
                <span>H <b class="lh">-</b></span>
                <span>L <b class="ll">-</b></span>
                <span class="down">C <b class="lc">-</b></span>
                <span class="lt">-</span>
            </div>
        </div>
        <div class="cv-chart"></div>`;
}

function createView(uid) {
    const root = document.createElement('div');
    root.className = 'chart-view';
    root.innerHTML = viewTemplate(uid);
    const chartEl = root.querySelector('.cv-chart');
    const v = {
        uid, root,
        chart: null, candle: null,
        bars: [], loadedFromIdx: null, loadedToIdx: null,
        timeframe: '1',
        indicatorHandles: [], enabled: {}, indicatorParams: {},
        applying: false, suppressExtend: false, userZoomed: false,
        tfLabel: root.querySelector('.cv-tflabel'),
    };
    v.tfLabel.textContent = TF_LABEL[v.timeframe];

    // ----- chart + candle -----
    const chart = LightweightCharts.createChart(chartEl, {
        autoSize: true,
        layout: { background: { color: '#ffffff' }, textColor: '#131722', attributionLogo: true },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: '#d1d4dc' },
        timeScale: { borderColor: '#d1d4dc', timeVisible: true, secondsVisible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    });
    const candle = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: 'rgba(0,0,0,0)', downColor: 'rgba(0,0,0,0)',
        borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN, borderVisible: true,
    });
    chart.__candle = candle;
    v.chart = chart; v.candle = candle;

    chart.subscribeCrosshairMove((param) => {
        updateLegend(v, param);
        // A programmatic crosshair (set from the other pane) already updated this
        // pane's legend above; don't bounce it back and create a loop.
        if (v._crossApply) { v._crossApply = false; return; }
        if (app.linked && app.views.length > 1) syncCrosshair(v, param);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        updatePriceMargins(v);
        if (v._linkApply) { v._linkApply = false; return; }
        if (!v.applying && !v.suppressExtend) maybeExtend(v);
        if (!v.applying) syncLink(v);
    });

    // Keep the candle WIDTH constant when this pane is resized (Split open/close,
    // window resize). Re-derive the visible span from the new pixel width while
    // preserving the centre — but only while the user hasn't manually zoomed.
    v._rzTimer = null;
    const ro = new ResizeObserver(() => {
        if (v._rzTimer) clearTimeout(v._rzTimer);
        v._rzTimer = setTimeout(() => {
            if (v.userZoomed || !v.bars.length) return;
            const el = v.root.querySelector('.cv-chart');
            if (!el || !el.clientWidth) return;
            reapplyDefaultZoom(v);
        }, 60);
    });
    ro.observe(v.root.querySelector('.cv-chart'));
    v._ro = ro;

    // Clicking a chart selects it; toolbar buttons then act on this view.
    root.addEventListener('mousedown', () => setActiveView(v));

    rebuildIndicators(v);
    return v;
}

// Update this pane's OHLC legend from a crosshair-move event.
function updateLegend(v, param) {
    const root = v.root;
    const t = root.querySelector('.lt');
    const o = root.querySelector('.lo'), h = root.querySelector('.lh');
    const l = root.querySelector('.ll'), c = root.querySelector('.lc');
    const bar = param.seriesData && param.seriesData.get(v.candle);
    if (bar && param.time !== undefined) {
        o.textContent = fmt(bar.open); h.textContent = fmt(bar.high);
        l.textContent = fmt(bar.low); c.textContent = fmt(bar.close);
        t.textContent = new Date(bar.time * 1000).toISOString().slice(0, 16).replace('T', ' ');
    } else {
        o.textContent = h.textContent = l.textContent = c.textContent = t.textContent = '-';
    }
}

// Mirror the crosshair (vertical time line + horizontal price line) onto the
// other pane(s) so a single pointer drives both — used in Split + Link mode.
function syncCrosshair(source, param) {
    const time = param.time;
    const bar = param.seriesData && param.seriesData.get(source.candle);
    let price = param.price;
    if (price === undefined && bar) price = bar.close;
    for (const o of app.views) {
        if (o === source) continue;
        if (time !== undefined && price !== undefined) {
            o._crossApply = true;
            try { o.chart.setCrosshairPosition(price, time, o.candle); } catch (e) {}
            setTimeout(() => { o._crossApply = false; }, 120);
        } else {
            clearCrosshair(o);
        }
    }
}

function clearCrosshair(v) {
    try { v.chart.clearCrosshairPosition(); } catch (e) {}
}

// ----- per-view data / zoom -----

function withSuppress(v, fn) {
    v.suppressExtend = true;
    fn();
    setTimeout(() => { v.suppressExtend = false; }, 150);
}

function updatePriceMargins(v) {
    if (!v.bars.length || !v.candle) return;
    const r = v.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    const from = clamp(Math.floor(r.from), 0, v.bars.length - 1);
    const to = clamp(Math.ceil(r.to), 0, v.bars.length - 1);
    if (from > to) return;
    let minL = Infinity, maxH = -Infinity;
    for (let i = from; i <= to; i++) {
        const b = v.bars[i];
        if (b.low < minL) minL = b.low;
        if (b.high > maxH) maxH = b.high;
    }
    if (!isFinite(minL) || !isFinite(maxH) || maxH <= minL) return;
    const range = maxH - minL;
    const gap = range * PRICE_MARGIN_FRAC;
    const frac = gap / (range + 2 * gap);
    v.candle.priceScale().applyOptions({ scaleMargins: { top: frac, bottom: frac } });
}

// Default / Reset zoom: target a constant candle width in pixels (not a fixed
// fraction of the bar count). This keeps the candle WIDTH identical regardless
// of timeframe and regardless of split mode (where each pane is half width), so
// the initial load, Reset, and the two split panes all look the same.
// Logical index of the FOCUSED trading day (app.centerIdx) within this view's
// loaded bars. If the focused day is at an edge (e.g. the most recent day), the
// returned index sits at that edge so the visible range centres on it — with
// empty space beyond the data when there is no future/previous history. Falls
// back to the middle of the data when no focus is set.
function focusBarIndex(v) {
    const n = v.bars.length;
    if (!n) return 0;
    if (app.centerIdx == null || !app.dates[app.centerIdx]) return Math.floor((n - 1) / 2);
    const t = Date.parse(app.dates[app.centerIdx] + 'T12:00:00') / 1000;
    const idx = nearestIndex(v.bars, t);
    return idx == null ? Math.floor((n - 1) / 2) : idx;
}

function defaultZoom(v) {
    const ts = v.chart.timeScale();
    const n = v.bars.length;
    if (!n) return;
    let width = 800;
    const el = v.root.querySelector('.cv-chart');
    if (el && el.clientWidth) width = el.clientWidth - 60; // minus price-scale gutter
    const visible = Math.max(width / DEFAULT_CANDLE_PX, 7);
    const center = focusBarIndex(v);
    const half = Math.min(visible / 2, n / 2);
    ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    updatePriceMargins(v);
}

// Like defaultZoom, but preserves the CURRENT centre (time) instead of always
// recentring on the middle of the data. Used when the pane is resized so the
// candle WIDTH stays constant without yanking the user back to the centre.
function reapplyDefaultZoom(v) {
    const ts = v.chart.timeScale();
    const n = v.bars.length;
    if (!n) return;
    const r = ts.getVisibleLogicalRange();
    let centerIdx = Math.floor((n - 1) / 2);
    if (r) centerIdx = clamp(Math.round((r.from + r.to) / 2), 0, n - 1);
    const centerTime = v.bars[centerIdx] ? v.bars[centerIdx].time : null;
    let width = 800;
    const el = v.root.querySelector('.cv-chart');
    if (el && el.clientWidth) width = el.clientWidth - 60;
    const visible = Math.max(width / DEFAULT_CANDLE_PX, 7);
    const half = Math.min(visible / 2, n / 2);
    let idx = centerIdx;
    if (centerTime != null) {
        const ni = nearestIndex(v.bars, centerTime);
        if (ni != null) idx = ni;
    }
    ts.setVisibleLogicalRange({ from: idx - half, to: idx + half });
    updatePriceMargins(v);
}

// Find the logical index in `bars` whose time is closest to `time`.
function nearestIndex(bars, time) {
    const n = bars.length;
    if (!n) return null;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && (time - bars[lo - 1].time) < (bars[lo].time - time)) lo--;
    return lo;
}

// When "Link" is on and there are 2 panes, keep their CENTRES aligned in time.
// Each pane keeps its own zoom (bar span); only the centre time is synced, so it
// works even when the two panes use different timeframes.
function syncLink(source) {
    if (!app.linked || app.views.length < 2) return;
    const r = source.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    const cIdx = clamp(Math.round((r.from + r.to) / 2), 0, source.bars.length - 1);
    const b = source.bars[cIdx];
    if (!b) return;
    const centerTime = b.time;
    for (const o of app.views) {
        if (o === source || !o.bars.length) continue;
        const or = o.chart.timeScale().getVisibleLogicalRange();
        if (!or) continue;
        const half = (or.to - or.from) / 2;
        const idx = nearestIndex(o.bars, centerTime);
        if (idx == null) continue;
        o._linkApply = true;
        o.chart.timeScale().setVisibleLogicalRange({ from: idx - half, to: idx + half });
        setTimeout(() => { o._linkApply = false; }, 120);
    }
}

function zoom(v, factor) {
    v.userZoomed = true;
    const ts = v.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const center = (r.from + r.to) / 2;
    let half = (r.to - r.from) / 2 * factor;
    if (half < 0.5) half = 0.5;
    withSuppress(v, () => ts.setVisibleLogicalRange({ from: center - half, to: center + half }));
}

function resetZoom(v) { v.userZoomed = false; withSuppress(v, () => defaultZoom(v)); }

async function loadRange(v, fromIdx, toIdx, fit) {
    v.applying = true;
    const frm = app.dates[fromIdx], to = app.dates[toIdx];
    v.bars = await fetchRange(frm, to, v.timeframe);
    v.loadedFromIdx = fromIdx;
    v.loadedToIdx = toIdx;
    v.candle.setData(v.bars);
    updateIndicators(v);
    if (fit) { v.userZoomed = false; withSuppress(v, () => defaultZoom(v)); }
    updatePriceMargins(v);
    v.applying = false;
    updateStatus();
}

async function maybeExtend(v) {
    if (!v.bars.length || v.loadedFromIdx == null) return;
    const r = v.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    let left = 0, right = 0;
    if (r.from <= MARGIN && v.loadedFromIdx > 0) left = 1;
    if (r.to >= v.bars.length - MARGIN && v.loadedToIdx < app.dates.length - 1) right = 1;
    if (left || right) await extend(v, left, right);
}

async function extend(v, left, right) {
    v.applying = true;
    const prev = v.chart.timeScale().getVisibleLogicalRange();
    let prepended = 0;
    if (left > 0 && v.loadedFromIdx > 0) {
        const newFrom = v.loadedFromIdx - left;
        const seg = await fetchRange(app.dates[newFrom], app.dates[v.loadedFromIdx - 1], v.timeframe);
        v.bars = seg.concat(v.bars);
        prepended = seg.length;
        v.loadedFromIdx = newFrom;
    }
    if (right > 0 && v.loadedToIdx < app.dates.length - 1) {
        const newTo = v.loadedToIdx + right;
        const seg = await fetchRange(app.dates[v.loadedToIdx + 1], app.dates[newTo], v.timeframe);
        v.bars = v.bars.concat(seg);
        v.loadedToIdx = newTo;
    }
    v.candle.setData(v.bars);
    updateIndicators(v);
    if (prev) {
        withSuppress(v, () => v.chart.timeScale().setVisibleLogicalRange({
            from: prev.from + prepended, to: prev.to + prepended,
        }));
    }
    updatePriceMargins(v);
    v.applying = false;
    updateStatus();
}

// ----- indicators (per view) -----

function rebuildIndicators(v) {
    for (const h of v.indicatorHandles) h.remove();
    v.indicatorHandles = [];
    while (v.chart.panes().length > 1) {
        try { v.chart.removePane(v.chart.panes().length - 1); } catch (e) { break; }
    }
    for (const def of (window.INDICATORS || [])) {
        if (v.enabled[def.id]) {
            const params = Object.assign({}, def.defaults, v.indicatorParams[def.id]);
            try { v.indicatorHandles.push(def.create(v.chart, v.bars, params)); }
            catch (e) { console.error('indicator', def.id, e); }
        }
    }
}

function updateIndicators(v) {
    for (const h of v.indicatorHandles) {
        try { h.update(v.bars); } catch (e) { console.error(e); }
    }
}

// Indicator menu lives in the top toolbar and always reflects the ACTIVE view.
function buildIndicatorMenu() {
    const menu = document.getElementById('indMenu');
    const v = app.activeView;
    if (!v) return;
    menu.innerHTML = '';
    for (const def of (window.INDICATORS || [])) {
        const row = document.createElement('div');
        row.className = 'ind-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!v.enabled[def.id];
        cb.onchange = () => {
            if (cb.checked) {
                v.enabled[def.id] = true;
                v.indicatorParams[def.id] = Object.assign({}, def.defaults);
            } else {
                delete v.enabled[def.id];
            }
            rebuildIndicators(v);
        };

        const lbl = document.createElement('label');
        lbl.textContent = def.name;
        lbl.title = def.id;

        row.appendChild(cb);
        row.appendChild(lbl);

        if (def.params && def.params.length) {
            const pwrap = document.createElement('span');
            pwrap.className = 'ind-params';
            for (const p of def.params) {
                const cur = (v.indicatorParams[def.id] || def.defaults)[p.name];
                const pl = document.createElement('span');
                pl.className = 'pl';
                pl.textContent = p.label + ':';
                const pi = document.createElement('input');
                pi.type = 'number';
                pi.value = cur;
                pi.min = p.min; pi.max = p.max; pi.step = p.step || 1;
                pi.onchange = () => {
                    v.indicatorParams[def.id] = v.indicatorParams[def.id] || Object.assign({}, def.defaults);
                    v.indicatorParams[def.id][p.name] = Number(pi.value);
                    if (v.enabled[def.id]) rebuildIndicators(v);
                };
                pwrap.appendChild(pl);
                pwrap.appendChild(pi);
            }
            row.appendChild(pwrap);
        }
        menu.appendChild(row);
    }
}

// ----- active view / selection -----

function setActiveView(v) {
    if (!v) return;
    app.activeView = v;
    for (const o of app.views) o.root.classList.toggle('active-view', o === v);
    const tfSel = document.getElementById('tfSelect');
    if (tfSel) tfSel.value = v.timeframe;
    buildIndicatorMenu();
}

// ----- global navigation / window -----

async function loadAllViews(fit) {
    for (const v of app.views) {
        const [from, to] = viewWindow(v);
        await loadRange(v, from, to, fit);
    }
    const di = document.getElementById('dateInput');
    if (app.centerIdx != null) di.value = app.dates[app.centerIdx];
}

function gotoOffset(delta) {
    if (app.centerIdx == null) return;
    const ni = clamp(app.centerIdx + delta, 0, app.dates.length - 1);
    if (ni === app.centerIdx) return;
    app.centerIdx = ni;
    loadAllViews(false);
}

function updateStatus() {
    if (!app.dates.length) { setStatus('No OHLC data found in this file.'); return; }
    const v = app.activeView || app.views[0];
    if (!v || v.loadedFromIdx == null) return;
    const frm = app.dates[v.loadedFromIdx], to = app.dates[v.loadedToIdx];
    const days = v.loadedToIdx - v.loadedFromIdx + 1;
    let extra = '';
    if (app.split && app.views.length > 1) extra = '  •  selected: pane ' + (app.views.indexOf(v) + 1);
    setStatus(app.symbol + '  •  ' + frm + ' → ' + to + '  •  ' +
              days + ' day' + (days > 1 ? 's' : '') + '  •  ' + v.bars.length + ' bars @ ' +
              tfText(v.timeframe) + extra);
}

function setSplit(on) {
    app.split = on;
    const container = document.getElementById('views');
    // Keep (or create) exactly one or two views.
    while (app.views.length > (on ? 2 : 1)) {
        const v = app.views.pop();
        if (v._ro) v._ro.disconnect();
        v.root.remove();
        if (app.activeView === v) app.activeView = app.views[0] || null;
    }
    while (app.views.length < (on ? 2 : 1)) {
        const v = createView('v' + app.views.length);
        container.appendChild(v.root);
        app.views.push(v);
        if (app.centerIdx != null) {
            const [from, to] = viewWindow(v);
            loadRange(v, from, to, true);
        }
    }
    // Pane widths changed → re-apply default zoom so candle width stays constant.
    for (const v of app.views) { withSuppress(v, () => defaultZoom(v)); updatePriceMargins(v); }
    // Leaving Split: drop any mirrored crosshair on the remaining pane.
    if (!on) for (const v of app.views) clearCrosshair(v);
    if (!app.activeView || !app.views.includes(app.activeView)) setActiveView(app.views[0]);
}

// ----- init -----

async function init() {
    const meta = await (await fetch('/api/meta')).json();
    app.dates = meta.dates || [];
    app.symbol = meta.symbol || 'OHLC';
    document.getElementById('symbol').textContent = app.symbol;

    const di = document.getElementById('dateInput');
    if (meta.minDate) di.min = meta.minDate;
    if (meta.maxDate) di.max = meta.maxDate;

    if (!app.dates.length) { updateStatus(); return; }

    // Top toolbar timeframe selector.
    const tfSel = document.getElementById('tfSelect');
    tfSel.innerHTML = TF_OPTIONS.map((t) => `<option value="${t}">${TF_LABEL[t]}</option>`).join('');

    // First (and only) view.
    const v0 = createView('v0');
    document.getElementById('views').appendChild(v0.root);
    app.views.push(v0);
    setActiveView(v0);

    di.addEventListener('change', () => {
        const val = di.value;
        if (val && app.dates.includes(val)) {
            app.centerIdx = app.dates.indexOf(val);
            loadAllViews(true);
        } else if (val) setStatus('No data for ' + val + ' (pick a highlighted trading day)');
    });

    // Toolbar controls act on the SELECTED view.
    tfSel.addEventListener('change', async () => {
        const v = app.activeView; if (!v) return;
        v.timeframe = tfSel.value;
        if (v.tfLabel) v.tfLabel.textContent = TF_LABEL[v.timeframe];
        const [from, to] = viewWindow(v);
        await loadRange(v, from, to, true);
    });
    document.getElementById('zoomInBtn').addEventListener('click', () => { if (app.activeView) zoom(app.activeView, 0.8); });
    document.getElementById('zoomOutBtn').addEventListener('click', () => { if (app.activeView) zoom(app.activeView, 1.25); });
    document.getElementById('resetBtn').addEventListener('click', () => { if (app.activeView) resetZoom(app.activeView); });

    const indBtn = document.getElementById('indBtn');
    const indMenu = document.getElementById('indMenu');
    indBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        buildIndicatorMenu();
        indMenu.classList.toggle('hidden');
    });

    document.getElementById('prevBtn').addEventListener('click', () => gotoOffset(-1));
    document.getElementById('nextBtn').addEventListener('click', () => gotoOffset(1));
    document.getElementById('splitBtn').addEventListener('click', () => setSplit(!app.split));

    const linkBtn = document.getElementById('linkBtn');
    linkBtn.addEventListener('click', () => {
        app.linked = !app.linked;
        linkBtn.classList.toggle('active', app.linked);
        if (app.linked && app.views.length < 2) {
            setStatus('Link only applies in Split mode (2 panes). Toggle Split first.');
        } else {
            // Re-sync immediately from the active pane.
            if (app.linked && app.activeView) syncLink(app.activeView);
            // Turning Link off: drop any mirrored crosshair on the other pane.
            if (!app.linked) for (const v of app.views) clearCrosshair(v);
            updateStatus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!indMenu.classList.contains('hidden') &&
            !indMenu.contains(e.target) && !indBtn.contains(e.target)) {
            indMenu.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'INPUT') return;
        if (e.key === 'ArrowLeft') gotoOffset(-1);
        else if (e.key === 'ArrowRight') gotoOffset(1);
        else if (e.key === '+' || e.key === '=') { if (app.activeView) zoom(app.activeView, 0.8); }
        else if (e.key === '-' || e.key === '_') { if (app.activeView) zoom(app.activeView, 1.25); }
        else if (e.key === '0') { if (app.activeView) resetZoom(app.activeView); }
    });

    // Most recent day; the window is centred on it (shifted to fit the data).
    app.centerIdx = app.dates.length - 1;
    await loadAllViews(true);
    // Re-apply default zoom + margin once autoSize has settled.
    setTimeout(() => { for (const v of app.views) { withSuppress(v, () => defaultZoom(v)); updatePriceMargins(v); } }, 80);
}

window.addEventListener('DOMContentLoaded', init);
