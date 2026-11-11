// Shared math helpers for indicators. Attached to window.INDU.
// Bars are [{ time, open, high, low, close }]; outputs are [{ time, value }].
window.INDU = window.INDU || {};

(function (U) {
    // Simple moving average over close, emitted from index p-1 onward.
    U.sma = function (bars, p) {
        const out = [];
        if (bars.length < p) return out;
        let sum = 0;
        for (let i = 0; i < bars.length; i++) {
            sum += bars[i].close;
            if (i >= p) sum -= bars[i - p].close;
            if (i >= p - 1) out.push({ time: bars[i].time, value: sum / p });
        }
        return out;
    };

    // Full-length EMA aligned to bars (null for the first p-1 elements).
    U.emaFull = function (bars, p) {
        const out = new Array(bars.length).fill(null);
        if (bars.length < p) return out;
        let sum = 0;
        for (let i = 0; i < p; i++) sum += bars[i].close;
        let prev = sum / p;
        out[p - 1] = prev;
        const k = 2 / (p + 1);
        for (let i = p; i < bars.length; i++) {
            prev = bars[i].close * k + prev * (1 - k);
            out[i] = prev;
        }
        return out;
    };

    // EMA over an array of { time, value } (used for signal lines / smoothing).
    // Returns an array aligned to `vals` (null for the first p-1 elements).
    U.emaOnValues = function (vals, p) {
        const out = new Array(vals.length).fill(null);
        if (vals.length < p) return out;
        let sum = 0;
        for (let i = 0; i < p; i++) sum += vals[i].value;
        let prev = sum / p;
        out[p - 1] = prev;
        const k = 2 / (p + 1);
        for (let i = p; i < vals.length; i++) {
            prev = vals[i].value * k + prev * (1 - k);
            out[i] = prev;
        }
        return out;
    };

    U.inRange = function (x, lo, hi) { return x >= lo && x <= hi; };

    // Find swing highs/lows: a point that is strictly extreme over `left`
    // bars on each side. Returns points sorted by index, each { i, price, time, type }.
    U.pivots = function (bars, left) {
        const pts = [];
        for (let i = left; i < bars.length - left; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= left; j++) {
                if (bars[i - j].high >= bars[i].high) isH = false;
                if (bars[i + j].high >= bars[i].high) isH = false;
                if (bars[i - j].low <= bars[i].low) isL = false;
                if (bars[i + j].low <= bars[i].low) isL = false;
            }
            if (isH) pts.push({ i, price: bars[i].high, time: bars[i].time, type: 'H' });
            if (isL) pts.push({ i, price: bars[i].low, time: bars[i].time, type: 'L' });
        }
        return pts.sort(function (a, b) { return a.i - b.i; });
    };

    U.alt = function (a, b, c, d) {
        return (a.type !== b.type) && (b.type !== c.type) && (c.type !== d.type);
    };
})(window.INDU);
