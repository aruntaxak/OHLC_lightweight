// Stochastic oscillator (own pane): %K and %D.
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'Stochastic', name: 'Stochastic',
    params: [
        { name: 'period', label: '%K Period', def: 14, min: 2, max: 100, step: 1 },
        { name: 'd', label: '%D Period', def: 3, min: 1, max: 50, step: 1 },
    ],
    defaults: { period: 14, d: 3 },
    create(chart, bars, params) {
        const paneIdx = chart.panes().length;
        const kLine = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#2962ff', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, paneIdx);
        const dLine = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#f0b90b', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, paneIdx);
        const update = (b) => {
            const p = params.period, d = params.d, kArr = [];
            for (let i = p - 1; i < b.length; i++) {
                let hh = -Infinity, ll = Infinity;
                for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, b[j].high); ll = Math.min(ll, b[j].low); }
                const c = b[i].close;
                kArr.push({ time: b[i].time, value: (hh === ll) ? 50 : ((c - ll) / (hh - ll)) * 100 });
            }
            const dOut = [];
            if (kArr.length >= d) {
                let sum = 0;
                for (let i = 0; i < kArr.length; i++) {
                    sum += kArr[i].value;
                    if (i >= d) sum -= kArr[i - d].value;
                    if (i >= d - 1) dOut.push({ time: kArr[i].time, value: sum / d });
                }
            }
            kLine.setData(kArr); dLine.setData(dOut);
        };
        update(bars);
        return { update, remove() { chart.removeSeries(dLine); chart.removeSeries(kLine); } };
    },
});
