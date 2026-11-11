// RSI (own pane, Wilder smoothing). Values 0-100.
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'RSI', name: 'RSI',
    params: [{ name: 'period', label: 'Period', def: 14, min: 2, max: 100, step: 1 }],
    defaults: { period: 14 },
    create(chart, bars, params) {
        const paneIdx = chart.panes().length;
        const s = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#9b59b6', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, paneIdx);
        const update = (b) => {
            const p = params.period, out = [];
            const changes = [];
            for (let i = 1; i < b.length; i++) changes.push(b[i].close - b[i - 1].close);
            if (changes.length < p) { s.setData(out); return; }
            let gain = 0, loss = 0;
            for (let i = 0; i < p; i++) { gain += Math.max(changes[i], 0); loss += Math.max(-changes[i], 0); }
            gain /= p; loss /= p;
            out.push({ time: b[p].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
            for (let i = p; i < changes.length; i++) {
                gain = (gain * (p - 1) + Math.max(changes[i], 0)) / p;
                loss = (loss * (p - 1) + Math.max(-changes[i], 0)) / p;
                out.push({ time: b[i + 1].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
            }
            s.setData(out);
        };
        update(bars);
        return { update, remove() { chart.removeSeries(s); } };
    },
});
