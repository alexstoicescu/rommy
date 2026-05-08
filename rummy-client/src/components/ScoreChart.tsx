import type { MatchTapePlayer } from "../replay/types";
import type { ScorePoint } from "../replay/analytics";
import "./ScoreChart.css";

interface Props {
  series: ScorePoint[];
  players: MatchTapePlayer[];
  themes: readonly string[];
}

const W = 480;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/**
 * Lightweight SVG line chart — no chart library, no canvas. One
 * polyline per player, drawn over a faint cyan grid. The chart is
 * driven directly off the analytics ScorePoint stream so it never
 * holds its own derived state and unmounts cleanly.
 */
export function ScoreChart({ series, players, themes }: Props) {
  if (series.length === 0) {
    return <div className="score-chart score-chart--empty" />;
  }
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const tStart = series[0].ts;
  const tEnd = series[series.length - 1].ts;
  const tSpan = Math.max(1, tEnd - tStart);

  let maxScore = 0;
  let minScore = 0;
  for (const point of series) {
    for (const sid of Object.keys(point.scores)) {
      const v = point.scores[sid];
      if (v > maxScore) maxScore = v;
      if (v < minScore) minScore = v;
    }
  }
  const sSpan = Math.max(10, maxScore - minScore);

  const x = (t: number) => PAD.left + ((t - tStart) / tSpan) * innerW;
  const y = (s: number) =>
    PAD.top + (1 - (s - minScore) / sSpan) * innerH;

  // Y-axis tick marks at quartiles of the score range.
  const ticks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    ticks.push(minScore + (sSpan * i) / 4);
  }

  return (
    <svg
      className="score-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Score over time"
    >
      {/* grid */}
      {ticks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i} className="score-chart__grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy} />
            <text x={PAD.left - 6} y={yy + 3} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        );
      })}

      {/* axis */}
      <line
        className="score-chart__axis"
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={H - PAD.bottom}
      />
      <line
        className="score-chart__axis"
        x1={PAD.left}
        y1={H - PAD.bottom}
        x2={W - PAD.right}
        y2={H - PAD.bottom}
      />

      {/* series lines */}
      {players.map((p) => {
        const color = themes[p.colorIndex % themes.length];
        const points = series
          .map((point) => `${x(point.ts)},${y(point.scores[p.sessionId] ?? 0)}`)
          .join(" ");
        return (
          <g key={p.sessionId}>
            <polyline
              className="score-chart__line"
              points={points}
              stroke={color}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          </g>
        );
      })}

      {/* legend */}
      <g className="score-chart__legend">
        {players.map((p, i) => {
          const color = themes[p.colorIndex % themes.length];
          const lx = PAD.left + 6 + i * 110;
          const ly = PAD.top + 4;
          return (
            <g key={p.sessionId} transform={`translate(${lx}, ${ly})`}>
              <rect width={10} height={10} fill={color} rx={2} />
              <text x={14} y={9}>{p.name}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default ScoreChart;
