// Kalman filter (overlay on the main pane). A scalar random-walk Kalman
// smoother on closing price: it predicts a gently drifting state and corrects
// it with each new bar, so the line tracks the trend while rejecting noise.
// `Process` (Q) is the model uncertainty — higher = more responsive / noisier;
// `Noise` (R) is the measurement uncertainty — higher = smoother.
window.INDICATORS = window.INDICATORS || [];

window.INDICATORS.push({
    id: 'Kalman', name: 'Kalman Filter',
    params: [
        { name: 'Q', label: 'Process', def: 0.01, min: 0, max: 1, step: 0.001 },
        { name: 'R', label: 'Noise', def: 1, min: 0.01, max: 100, step: 0.1 },
    ],
    defaults: { Q: 0.01, R: 1 },
    create(chart, bars, params) {
        const s = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#9b59b6', lineWidth: 2,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const update = (b) => {
            const out = [];
            const Q = params.Q, R = params.R;
            if (b.length) {
                let x = b[0].close;
                let P = 1;
                for (let i = 0; i < b.length; i++) {
                    const z = b[i].close;
                    // predict
                    P = P + Q;
                    // update
                    const K = P / (P + R);
                    x = x + K * (z - x);
                    P = (1 - K) * P;
                    out.push({ time: b[i].time, value: x });
                }
            }
            s.setData(out);
        };
        update(bars);
        return { update, remove() { chart.removeSeries(s); } };
    },
});
