import type { ChartLandmarkViewModel, ChartPointViewModel, ChartViewModel } from "../view-model.js";

interface PlotTransform {
  readonly x: (value: number) => number;
  readonly y: (value: number) => number;
  readonly xScale: number;
  readonly yScale: number;
}

function transformFor(points: readonly ChartPointViewModel[], landmarks: readonly ChartLandmarkViewModel[]): PlotTransform {
  const xs = [...points.map((point) => point.xNm), ...landmarks.map((item) => item.xNm), -250, 250];
  const ys = [...points.map((point) => point.yNm), ...landmarks.map((item) => item.yNm), -250, 250];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(500, maxX - minX);
  const rangeY = Math.max(500, maxY - minY);
  return {
    x: (value) => 70 + ((value - minX) / rangeX) * 660,
    y: (value) => 440 - ((value - minY) / rangeY) * 380,
    xScale: 660 / rangeX,
    yScale: 380 / rangeY,
  };
}

function pointsAttribute(points: readonly ChartPointViewModel[], transform: PlotTransform): string {
  return points.map((point) => `${transform.x(point.xNm).toFixed(1)},${transform.y(point.yNm).toFixed(1)}`).join(" ");
}

export function ActiveChart({ chart }: { readonly chart: ChartViewModel }) {
  const transform = transformFor(chart.estimatedTrack, chart.knownLandmarks);
  const estimateX = transform.x(chart.estimatedPosition.xNm);
  const estimateY = transform.y(chart.estimatedPosition.yNm);
  return (
    <section class="chart-shell" aria-labelledby="chart-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Chart room</p>
          <h2 id="chart-title">Estimated Atlantic position</h2>
        </div>
        <p class="uncertainty-readout">
          Uncertainty ellipse: ±{chart.uncertaintyEastWestNm.toFixed(1)} nm east–west,
          ±{chart.uncertaintyNorthSouthNm.toFixed(1)} nm north–south
        </p>
      </div>
      <svg class="chart" viewBox="0 0 800 500" role="img" aria-labelledby="active-chart-svg-title active-chart-svg-desc">
        <title id="active-chart-svg-title">Accessible estimated-position chart</title>
        <desc id="active-chart-svg-desc">
          The dotted track is the crew's estimate. The hatched ellipse is uncertainty, not a coastline.
          Known chart symbols have visible labels and can receive keyboard focus.
        </desc>
        <defs>
          <pattern id="uncertainty-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" class="hatch-line" />
          </pattern>
          <marker id="heading-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" class="heading-arrow" />
          </marker>
        </defs>
        <rect x="40" y="30" width="720" height="430" rx="18" class="chart-water" />
        {[100, 200, 300, 400, 500, 600, 700].map((x) => <line key={`gx-${x}`} x1={x} y1="45" x2={x} y2="445" class="chart-grid" />)}
        {[100, 180, 260, 340, 420].map((y) => <line key={`gy-${y}`} x1="55" y1={y} x2="745" y2={y} class="chart-grid" />)}
        <polyline points={pointsAttribute(chart.estimatedTrack, transform)} class="estimated-track" aria-label="Estimated track history" />
        <ellipse
          cx={estimateX}
          cy={estimateY}
          rx={Math.max(5, chart.uncertaintyEastWestNm * transform.xScale)}
          ry={Math.max(5, chart.uncertaintyNorthSouthNm * transform.yScale)}
          class="uncertainty-ellipse"
          aria-label={`Uncertainty ellipse, plus or minus ${chart.uncertaintyEastWestNm.toFixed(1)} nautical miles east west and ${chart.uncertaintyNorthSouthNm.toFixed(1)} nautical miles north south`}
        />
        <line x1={estimateX} y1={estimateY} x2={estimateX + 54} y2={estimateY - 28} class="heading-line" marker-end="url(#heading-arrow)" />
        <g tabIndex={0} role="img" aria-label={`Estimated position, heading ${chart.heading}`}>
          <circle cx={estimateX} cy={estimateY} r="8" class="estimated-position" />
          <text x={estimateX + 12} y={estimateY - 10} class="chart-label">Estimate · {chart.heading}</text>
        </g>
        {chart.knownLandmarks.map((landmark) => {
          const x = transform.x(landmark.xNm);
          const y = transform.y(landmark.yNm);
          const alignLeft = x > 590;
          return (
            <g
              key={landmark.id}
              tabIndex={0}
              role="img"
              aria-label={`${landmark.label}, ${landmark.status}, confidence ${landmark.confidence} percent`}
            >
              <rect x={x - 7} y={y - 7} width="14" height="14" class="landmark-symbol" />
              <text x={x + (alignLeft ? -12 : 12)} y={y + 4} text-anchor={alignLeft ? "end" : "start"} class="chart-label">
                {landmark.label} · {landmark.confidence}%
              </text>
            </g>
          );
        })}
      </svg>
      <div class="chart-legend" aria-label="Chart legend">
        <span><i class="legend-line estimated" /> Estimated track</span>
        <span><i class="legend-area" /> Hatched uncertainty</span>
        <span><i class="legend-square" /> Known landmark with confidence label</span>
      </div>
      <dl class="chart-notes">
        <div><dt>Estimated coordinates</dt><dd>{chart.estimatedPosition.xNm.toFixed(1)} nm E/W, {chart.estimatedPosition.yNm.toFixed(1)} nm N/S</dd></div>
        <div><dt>Observed wind</dt><dd>{chart.observedWind}</dd></div>
        <div><dt>Planned heading</dt><dd>{chart.heading}</dd></div>
      </dl>
      {chart.knownCurrentStatements.length > 0 && (
        <div class="known-currents">
          <h3>Charted current knowledge</h3>
          {chart.knownCurrentStatements.map((statement) => <p key={statement}>{statement}</p>)}
        </div>
      )}
    </section>
  );
}

export function AfterActionChart({ estimated, actual }: {
  readonly estimated: readonly ChartPointViewModel[];
  readonly actual: readonly ChartPointViewModel[];
}) {
  const transform = transformFor([...estimated, ...actual], []);
  return (
    <section class="chart-shell report-chart" aria-labelledby="report-chart-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Finalized truth comparison</p>
          <h2 id="report-chart-title">Estimated and actual tracks</h2>
        </div>
      </div>
      <svg class="chart" viewBox="0 0 800 500" role="img" aria-labelledby="report-svg-title report-svg-desc">
        <title id="report-svg-title">Finalized estimated and actual route comparison</title>
        <desc id="report-svg-desc">The dotted line is the estimated route. The solid double-marked line is the actual route, revealed only in this finalized report.</desc>
        <rect x="40" y="30" width="720" height="430" rx="18" class="chart-water" />
        <polyline points={pointsAttribute(estimated, transform)} class="estimated-track" />
        <polyline points={pointsAttribute(actual, transform)} class="actual-track" />
        {actual.filter((_, index) => index % Math.max(1, Math.floor(actual.length / 12)) === 0).map((point) => (
          <circle key={`${point.day}-${point.xNm}-${point.yNm}`} cx={transform.x(point.xNm)} cy={transform.y(point.yNm)} r="4" class="actual-marker" />
        ))}
      </svg>
      <div class="chart-legend" aria-label="Finalized chart legend">
        <span><i class="legend-line estimated" /> Estimated track, dotted</span>
        <span><i class="legend-line actual" /> Actual track, solid with round markers</span>
      </div>
    </section>
  );
}
