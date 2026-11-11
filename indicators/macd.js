// MACD (own pane): MACD line, signal line, histogram.
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'MACD', name: 'MACD',
    params: [
        { name: 'fast', label: 'Fast', def: 12, min: 2, max: 100, step: 1 },
        { name: 'slow', label: 'Slow', def: 26, min: 3, max: 200, step: 1 },
        { name: 'signal', label: 'Signal', def: 9, min: 2, max: 100, step: 1 },
    ],
    defaults: { fast: 12, slow: 26, signal: 9 },
    create(chart, bars, params) {
        const paneIdx = chart.panes().length;
        const macdLine = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#2962ff', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, paneIdx);
        const signal = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#f0b90b', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, paneIdx);
        const hist = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceLineVisible: false, lastValueVisible: false,
        }, paneIdx);
        const update = (b) => {
            const ef = window.INDU.emaFull(b, params.fast);
            const es = window.INDU.emaFull(b, params.slow);
            const start = Math.max(params.fast, params.slow) - 1;
            const macdVals = [];
            for (let i = start; i < b.length; i++) macdVals.push({ time: b[i].time, value: ef[i] - es[i] });
            const sig = window.INDU.emaOnValues(macdVals, params.signal);
            const outM = [], outS = [], outH = [];
            for (let i = 0; i < macdVals.length; i++) {
                outM.push(macdVals[i]);
                if (sig[i] !== null) {
                    const v = macdVals[i].value - sig[i];
                    outS.push({ time: macdVals[i].time, value: sig[i] });
                    outH.push({ time: macdVals[i].time, value: v, color: v >= 0 ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' });
                }
            }
            macdLine.setData(outM); signal.setData(outS); hist.setData(outH);
        };
        update(bars);
        return {
            update,
            remove() { chart.removeSeries(hist); chart.removeSeries(signal); chart.removeSeries(macdLine); },
        };
    },
});
