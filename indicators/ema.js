// Exponential moving averages (overlay on the main pane). Three separate,
// user-configurable EMAs — none are enabled by default; tick them in the
// Indicators menu and adjust each Period.
window.INDICATORS = window.INDICATORS || [];

function addEMA(id, name, period, color) {
    window.INDICATORS.push({
        id: id, name: name,
        params: [{ name: 'period', label: 'Period', def: period, min: 1, max: 500, step: 1 }],
        defaults: { period: period },
        create(chart, bars, params) {
            const s = chart.addSeries(LightweightCharts.LineSeries, {
                color: color, lineWidth: 1,
                priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            });
            const update = (b) => {
                const ef = window.INDU.emaFull(b, params.period);
                const out = [];
                for (let i = 0; i < ef.length; i++) if (ef[i] !== null) out.push({ time: b[i].time, value: ef[i] });
                s.setData(out);
            };
            update(bars);
            return { update, remove() { chart.removeSeries(s); } };
        },
    });
}

addEMA('EMA 10', 'EMA', 10, '#26a69a');
addEMA('EMA 50', 'EMA', 50, '#ef5350');
addEMA('EMA 200', 'EMA', 200, '#f0b90b');
