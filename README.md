# OHLC Viewer (Taxak Capital)

A small, **standalone desktop candlestick viewer** for OHLC data stored in
**Parquet** files. It reads the file with [polars](https://pola.rs/), draws
true candlesticks with [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/)
(v5), and opens the chart in a native window via
[pywebview](https://github.com/r0x0r/pywebview).

## Features

- **Candlestick charts** (hollow candles, light theme) with a configurable
  **indicator** menu (SMA, EMA, Bollinger Bands, RSI, MACD, Stochastic, ATR, and a
  custom **Harmonic Patterns** scanner). Enable any number, none, or several; each
  has its own parameters. Oscillators (RSI/MACD/Stochastic/ATR) get their own panes.
- **Zoom / squeeze** — mouse wheel, the `+` / `−` buttons, or the `+` / `-` keys.
- **Drag / pan** — drag the chart or the time axis. Panning past the loaded edge
  automatically fetches and appends/prepends more trading days.
- **Date navigation** — pick a day in the date box, or use the **Prev / Next**
  buttons / **← / →** arrow keys. The viewer keeps a sliding window of
  **7 trading days** on screen (centred on the 4th day), so you never land on an
  empty (weekend / holiday) gap and indicator calculations always have enough data.
- **Reset zoom** — the **Reset** button or the `0` key returns to the default zoom:
  a comfortable window of bars centred on the loaded data (the same level used on
  first load), not a full fit. The `−` / `+` buttons and `−` / `+` keys zoom out/in.
- **Crosshair legend** — hover to read O/H/L/C and the timestamp.
- Works **fully offline** (the chart library is vendored locally).

## Indicators

Indicators live in the `indicators/` folder. Each file self-registers a definition
on the global `window.INDICATORS` array (loaded by `index.html`). Adding a new one
is just dropping a file there — no build step:

```js
window.INDICATORS = window.INDICATORS || [];
window.INDICATORS.push({
  id: 'MyInd', name: 'My Indicator',
  params: [{ name: 'period', label: 'Period', def: 20, min: 1, max: 500, step: 1 }],
  defaults: { period: 20 },
  create(chart, bars, params) {
    const s = chart.addSeries(LightweightCharts.LineSeries, { /* … */ });
    const update = (b) => s.setData(/* compute from b (OHLC bars) */ []);
    update(bars);
    return { update, remove() { chart.removeSeries(s); } };   // or markers via createSeriesMarkers
  },
});
```

Overlay indicators return series on the main pane; oscillator indicators call
`chart.panes().length` to claim their own pane. `bars` is an array of
`{ time, open, high, low, close }` (time = epoch seconds). Shared math helpers
(SMA, EMA, pivots, …) are in `indicators/util.js` (`window.INDU`).

The **Harmonic Patterns** entry is a deliberately custom example: it finds swing
pivots and flags Gartley / Butterfly / Bat / Crab setups — a good template for
your own pattern logic.

## Requirements

- Python 3.10+
- `polars` and `pywebview` (in the **system `python3`** — the current macOS
  build wraps this interpreter rather than bundling one):
  ```bash
  pip install polars pywebview
  ```
  (`pywebview` needs a system webview: on macOS this is built in; on Linux
  install `webkit2gtk`; on Windows use the Edge WebView2 runtime.)

## Usage

Open a file directly:

```bash
python ohlc_viewer.py /path/to/data.parquet
```

Or run it with no argument and use the file picker:

```bash
python ohlc_viewer.py
```

### Expected Parquet schema

The loader auto-detects columns. It supports either:

- A **`Date`** (e.g. `01-01-2008` or `2008-01-01`) **+ `Time`** (`09:54`) pair, **and**
  `Open` / `High` / `Low` / `Close` columns, **or**
- A single **`Datetime`** column plus `Open` / `High` / `Low` / `Close`.

Column names are matched case-insensitively (e.g. `open`, `OPEN`, `Close` all work).

## Keyboard & mouse shortcuts

| Action | Mouse | Button | Key |
|---|---|---|---|
| Zoom in / squeeze | Wheel up | `+` | `+` / `=` |
| Zoom out / expand | Wheel down | `−` | `-` / `_` |
| Reset zoom to default | — | `Reset` | `0` |
| Previous 7-day window | — | `Prev` | `←` |
| Next 7-day window | — | `Next` | `→` |
| Toggle indicators menu | — | `Indicators` | `i` |
| Pan | Drag chart / time axis | — | — |
| Read O/H/L/C | Hover crosshair | — | — |

## Data windowing note

Large files (e.g. years of 1-minute bars) are loaded entirely into memory once,
but only a **7-trading-day window** (centred on the 4th day) is sent to the chart
at a time — so loading is instant and the chart stays smooth. Panning past the
loaded edge automatically fetches more days. The date axis shows real market
timestamps
(Indian market hours display in IST wall-clock time via a UTC-label trick); the
overnight break between sessions appears as a normal intraday gap.

## macOS: "Open With" on .parquet

`build_macos.sh` wraps the app into an `.app` and registers it to open Parquet
files via Finder's **Open With**. No PyInstaller, no bundled interpreter — it
copies `ohlc_viewer.py` + the static assets (`index.html`, `app.js`, the
vendored chart lib, icon, `indicators/`) into
`/Applications/OHLC Viewer.app/Contents/Resources` and runs them with the
**system `python3`** (so `polars` / `pywebview` / `tkinter` must be installed
there). It patches `Info.plist` with a `.parquet` UTI and registers the
association with `lsregister`.

```bash
bash build_macos.sh
```

Result: `/Applications/OHLC Viewer.app`, self-contained except for the Python
libraries (runtime log at `/tmp/OHLC Viewer.log`). Supports right-click →
**Open With → OHLC Viewer**; the opened path arrives as the first argument.

## Project layout

| File | Purpose |
|---|---|
| `ohlc_viewer.py` | Python launcher: loads Parquet, serves data over a local HTTP API, opens the pywebview window. |
| `index.html` | Viewer page (light theme, toolbar, legend, indicators menu). |
| `app.js` | Frontend (lightweight-charts v5: candles, windowed navigation, pan-fetch, zoom, indicator manager). |
| `indicators/` | Indicator definitions (SMA, EMA, Bollinger, RSI, MACD, Stochastic, ATR, Harmonic) + `util.js` math helpers. |
| `lightweight-charts.standalone.production.js` | Vendored chart library (offline). |
| `taxak_capital.jpg` | App icon / favicon. |
| `build_macos.sh` | macOS `.app` packaging + `.parquet` UTI registration (**system python**). |

## License

Lightweight Charts™ is licensed under Apache-2.0; the viewer displays the
required TradingView attribution logo. The chart library is used here under
that license.
