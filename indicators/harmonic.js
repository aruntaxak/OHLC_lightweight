// Harmonic patterns (custom indicator). Draws the X-A-B-C-D geometry as lines:
// X->A->B->C as a solid orange polyline, and the projected C->D completion leg as
// a dashed line. The marker at C shows the pattern name and its arrow points the
// expected direction (up = bullish, down = bearish). The 4th line is projected as
// an equal ABCD leg (CD = AB in price and time), so it always continues in the
// same direction as A->B — i.e. it agrees with the arrow and forms a coherent
// X-A-B-C-D shape (up arrow => line rises into D, down arrow => line falls into
// D). Heuristic swing-pivot + ratio scanner: Gartley / Butterfly / Bat / Crab.
// Tune the bands in detectHarmonic().
window.INDICATORS = window.INDICATORS || [];

const HARMONIC_MAX = 15;           // cap drawn patterns to keep the chart clean

function detectHarmonic(bars) {
    const piv = window.INDU.pivots(bars, 5);
    const patterns = [];
    for (let i = 0; i + 3 < piv.length; i++) {
        const X = piv[i], A = piv[i + 1], B = piv[i + 2], C = piv[i + 3];
        if (!window.INDU.alt(X, A, B, C)) continue;
        const XA = Math.abs(A.price - X.price);
        if (XA === 0) continue;
        const AB = Math.abs(B.price - A.price);
        const BC = Math.abs(C.price - B.price);
        if (AB === 0 || BC === 0) continue;
        const abxa = AB / XA, bcab = BC / AB;
        // XA down (A below X) => bullish pattern; XA up => bearish.
        const bullish = (A.price - X.price) < 0;
        let pat = null;
        if (window.INDU.inRange(abxa, 0.545, 0.625) && window.INDU.inRange(bcab, 0.30, 0.55)) pat = 'Gartley';
        else if (window.INDU.inRange(abxa, 0.745, 0.795) && window.INDU.inRange(bcab, 0.30, 0.55)) pat = 'Butterfly';
        else if (window.INDU.inRange(abxa, 0.350, 0.500) && window.INDU.inRange(bcab, 0.30, 0.55)) pat = 'Bat';
        else if (window.INDU.inRange(abxa, 0.500, 0.700) && window.INDU.inRange(bcab, 0.75, 0.95)) pat = 'Crab';
        if (pat) patterns.push({ X, A, B, C, pat, bullish });
    }
    return patterns.slice(-HARMONIC_MAX);
}

window.INDICATORS.push({
    id: 'Harmonic', name: 'Harmonic Patterns',
    params: [], defaults: {},
    create(chart, bars) {
        const candle = chart.__candle;
        const markerPrim = LightweightCharts.createSeriesMarkers(candle, []);
        let lineSeries = [], projSeries = [];

        function clearLines() {
            for (const s of lineSeries.concat(projSeries)) { try { chart.removeSeries(s); } catch (e) {} }
            lineSeries = []; projSeries = [];
        }

        function update(b) {
            const patterns = detectHarmonic(b);
            // Name + direction at the last confirmed pivot (C).
            markerPrim.setMarkers(patterns.map((p) => ({
                time: p.C.time,
                position: p.bullish ? 'belowBar' : 'aboveBar',
                shape: p.bullish ? 'arrowUp' : 'arrowDown',
                color: '#ff9800',
                text: p.pat,
                size: 1,
            })));
            clearLines();
            for (const p of patterns) {
                const solid = chart.addSeries(LightweightCharts.LineSeries, {
                    color: '#ff9800', lineWidth: 1,
                    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                });
                solid.setData([
                    { time: p.X.time, value: p.X.price },
                    { time: p.A.time, value: p.A.price },
                    { time: p.B.time, value: p.B.price },
                    { time: p.C.time, value: p.C.price },
                ]);
                lineSeries.push(solid);

                // Projected D: extend the C->D leg as an equal ABCD (CD = AB in
                // both price and time). Because A->B is up for a bullish pattern
                // and down for a bearish one, this makes the 4th line agree with
                // the arrow (up arrow => line rises into D, down arrow => line
                // falls into D) and completes a coherent X-A-B-C-D shape.
                const ab = p.B.price - p.A.price;
                const dPrice = p.C.price + ab;
                const dTime = p.C.time + (p.C.time - p.B.time);
                const proj = chart.addSeries(LightweightCharts.LineSeries, {
                    color: '#ff9800', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed,
                    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                });
                proj.setData([
                    { time: p.C.time, value: p.C.price },
                    { time: dTime, value: dPrice },
                ]);
                projSeries.push(proj);
            }
        }

        update(bars);
        return {
            update,
            remove() {
                try { candle.detachPrimitive(markerPrim); } catch (e) {}
                clearLines();
            },
        };
    },
});
