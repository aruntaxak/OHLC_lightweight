// Average True Range (own pane, Wilder smoothing).
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'ATR', name: 'ATR',
    params: [{ name: 'period', label: 'Period', def: 14, min: 1, max: 200, step: 1 }],
    defaults: { period: 14 },
    create(chart, bars, params) {
        const paneIdx = chart.panes().length;
        const s = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#787b86', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, paneIdx);
        const update = (b) => {
            const p = params.period, out = [], tr = [];
            for (let i = 0; i < b.length; i++) {
                if (i === 0) tr.push(b[i].high - b[i].low);
                else {
                    const pc = b[i - 1].close;
                    tr.push(Math.max(b[i].high - b[i].low, Math.abs(b[i].high - pc), Math.abs(b[i].low - pc)));
                }
            }
            let prev = 0;
            for (let i = 0; i < tr.length; i++) {
                if (i === p - 1) { let sm = 0; for (let j = 0; j < p; j++) sm += tr[j]; prev = sm / p; out.push({ time: b[i].time, value: prev }); }
                else if (i >= p) { prev = (prev * (p - 1) + tr[i]) / p; out.push({ time: b[i].time, value: prev }); }
            }
            s.setData(out);
        };
        update(bars);
        return { update, remove() { chart.removeSeries(s); } };
    },
});
