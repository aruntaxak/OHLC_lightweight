// Bollinger Bands (overlay on the main pane): middle, upper, lower.
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'Bollinger', name: 'Bollinger Bands',
    params: [
        { name: 'period', label: 'Period', def: 20, min: 2, max: 200, step: 1 },
        { name: 'dev', label: 'StdDev', def: 2, min: 0.5, max: 5, step: 0.1 },
    ],
    defaults: { period: 20, dev: 2 },
    create(chart, bars, params) {
        const mid = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#2962ff', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const up = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#787b86', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const low = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#787b86', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const update = (b) => {
            const p = params.period, sd = params.dev;
            const midA = window.INDU.sma(b, p);
            const outU = [], outL = [];
            let j = 0;
            for (let i = p - 1; i < b.length; i++) {
                let sq = 0;
                for (let k = i - p + 1; k <= i; k++) { const d = b[k].close - midA[j].value; sq += d * d; }
                const s = Math.sqrt(sq / p);
                outU.push({ time: b[i].time, value: midA[j].value + sd * s });
                outL.push({ time: b[i].time, value: midA[j].value - sd * s });
                j++;
            }
            mid.setData(midA); up.setData(outU); low.setData(outL);
        };
        update(bars);
        return {
            update,
            remove() { chart.removeSeries(up); chart.removeSeries(mid); chart.removeSeries(low); },
        };
    },
});
