# AGENTS.md — OHLC Viewer (Taxak Capital)

Project memory: architecture decisions and tech stack. Keep this file in sync with
real changes; do not let it drift from the code.

## What this project is

A **standalone desktop candlestick viewer** for OHLC data stored in **Parquet**
files. No server, no cloud, no accounts — a single user opens a local file and
charts it offline.

## Tech stack

- **Language**: Python 3.10+ (launcher/backend) + vanilla JavaScript (frontend).
  No TypeScript, no frontend build step, no bundler.
- **Data**: [polars](https://pola.rs/) for reading/parsing/resampling Parquet.
- **UI shell**: [pywebview](https://github.com/r0x0r/pywebview) native window
  (system webview). tkinter is used *only* for the macOS file picker / Open-With
  event capture.
- **Charting**: [TradingView Lightweight Charts™ v5](https://www.tradingview.com/lightweight-charts/),
  **vendored locally** as `lightweight-charts.standalone.production.js` so the app
  works fully offline (Apache-2.0, requires the attribution logo — keep it on).
- **Packaging (macOS)**: `build_macos.sh` wraps the app into `/Applications/OHLC Viewer.app`.
  Uses the **system `python3`** (no PyInstaller, no bundled interpreter); it copies
  the Python script + static assets into the bundle and registers a `.parquet` UTI.
  (`build_macos_pyinstaller.sh` was a legacy alternative and has been removed.)

## Architecture decisions

1. **Local HTTP bridge, not direct file access.** `ohlc_viewer.py` loads the
   Parquet once, starts a `ThreadingHTTPServer` on `127.0.0.1` (ephemeral port),
   and the pywebview window loads `index.html` from `http://127.0.0.1:<port>/`.
   The browser talks to the backend only via two JSON endpoints:
   - `GET /api/meta` → `{ symbol, dates[], minDate, maxDate, totalBars }`
   - `GET /api/data?from=&to=&tf=` → `{ bars: [{time, open, high, low, close}] }`
   (`time` is epoch **seconds**.) This keeps heavy data work in Python and the
   frontend dumb/portable.

2. **Windowed data loading.** The whole file is parsed into memory once, but only
   a **sliding window of trading days** is sent to the chart at a time. Window
   width scales with timeframe (`BASE_DAYS=5` days × minutes at the 1m base; `1D`
   shows up to 500 daily bars). Panning past a loaded edge auto-fetches more days
   (`maybeExtend`). Keeps load instant and the chart smooth for years of 1m data.

3. **Resampling lives in Python, not JS.** Timeframe aggregation (1/5/15/60 min,
   1D) is done with polars `group_by` + `first/max/min/last` over `_ts` buckets on
   the backend. The frontend only asks for a timeframe via the `tf` query param.

4. **Plugin-style indicators, no build.** Every file in `indicators/` self-registers
   a definition on the global `window.INDICATORS` array (loaded by `index.html`).
   Adding an indicator = drop a file. Shared math helpers (SMA/EMA/pivots) live in
   `indicators/util.js` as `window.INDU`. Overlays draw on the main pane;
   oscillators (RSI/MACD/Stochastic/ATR) claim their own pane via `chart.panes()`.
   Indicators include: SMA, EMA, Bollinger, RSI, MACD, Stochastic, ATR, Harmonic
   Patterns (Gartley/Butterfly/Bat/Crab pivot scanner), and Kalman filter.

5. **Single toolbar + multi-pane model.** `app.js` supports one or two side-by-side
   "views" (Split). Toolbar/indicator menu always act on the **selected** view
   (click a pane to select). "Link" keeps the two panes' centres aligned in time
   during panning, even at different timeframes. Default/Reset zoom targets a
   **constant candle width in pixels** (`DEFAULT_CANDLE_PX=7`) so the look is
   identical across timeframes and in Split (each pane is half width).

6. **Column auto-detection.** The loader matches OHLC/date columns case-insensitively
   and supports either `Date`+`Time` strings (multiple formats) or a single
   `Datetime` column. Don't assume fixed column names.

## Project layout

| File | Purpose |
|---|---|
| `ohlc_viewer.py` | Python launcher: loads Parquet, serves local HTTP API, opens pywebview window. |
| `index.html` | Viewer page (light theme, toolbar, legend, indicators menu). |
| `app.js` | Frontend: lightweight-charts v5, windowed nav, pan-fetch, zoom, indicator manager, Split/Link. |
| `indicators/` | Indicator definitions + `util.js` math helpers (self-registering plugins). |
| `lightweight-charts.standalone.production.js` | Vendored chart library (offline). |
| `taxak_capital.jpg` | App icon / favicon. |
| `build_macos.sh` | macOS `.app` packaging + `.parquet` UTI registration (system python). |

## Conventions / gotchas

- Frontend is **plain JS via globals** (`window.INDICATORS`, `window.INDU`,
  `LightweightCharts`), not modules — do not introduce a build step or imports
  without reworking `index.html`.
- Keep the TradingView attribution logo enabled (license requirement).
- Indian market hours display in IST via a UTC-label trick; the overnight session
  break shows as a normal intraday gap.
- New indicators must expose `{ id, name, params[], defaults, create(chart, bars, params) }`
  returning `{ update(bars), remove() }`.
- Backend endpoints must stay JSON and use epoch-**seconds** `time`.
