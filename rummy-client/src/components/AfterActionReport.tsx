import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { MatchTape } from "../replay/types";
import { analyzeTape } from "../replay/analytics";
import { ScoreChart } from "./ScoreChart";
import { TileComponent } from "./TileComponent";
import "./AfterActionReport.css";

interface Props {
  tape: MatchTape;
  themes: readonly string[];
  /** Epoch-ms when the next deal fires. */
  nextDealAt: number;
  ready: boolean;
  readyCount: number;
  readyTotal: number;
  onReady: () => void;
  onWatchReplay: () => void;
  onPlayAgain: () => void;
}

export function AfterActionReport({
  tape,
  themes,
  nextDealAt,
  ready,
  readyCount,
  readyTotal,
  onReady,
  onWatchReplay,
  onPlayAgain,
}: Props) {
  const { t } = useTranslation();
  const analytics = useMemo(() => analyzeTape(tape), [tape]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((nextDealAt - now) / 1000));

  const mvpColor =
    themes[analytics.mvp.colorIndex % themes.length] ?? "#ffe066";

  const matchType = tape.matchType ?? "ranked";
  const isSocial = matchType === "social";

  return (
    <div
      className={`aar aar--${matchType}`}
      role="dialog"
      aria-modal="true"
    >
      {isSocial && (
        <div className="aar__watermark" aria-hidden="true">
          {t("aar_watermark_social")}
        </div>
      )}
      <div className="aar__shell">
        <header className="aar__title-row">
          <span className="aar__prompt">$</span>
          <h2 className="aar__title">{t("aar_title")}</h2>
          <span
            className={`aar__match-type aar__match-type--${matchType}`}
            title={
              isSocial ? t("aar_social_tooltip") : t("aar_ranked_tooltip")
            }
          >
            {t(isSocial ? "aar_match_type_social" : "aar_match_type_ranked")}
          </span>
          <span className="aar__countdown">
            {t("game_over_next_round_in", { seconds: secondsLeft })}
          </span>
        </header>

        <div className="aar__bento">
          {/* MVP */}
          <section
            className="aar__card aar__card--mvp"
            style={{ ["--card-accent" as string]: mvpColor }}
          >
            <div className="aar__card-label">{t("aar_mvp")}</div>
            <div className="aar__card-name">{analytics.mvp.name}</div>
            <div className="aar__card-stat">
              {t("aar_mvp_score", { score: analytics.mvp.score })}
            </div>
            {(() => {
              const sid = analytics.mvp.sessionId;
              const delta = tape.eloDeltas[sid] ?? 0;
              const after = tape.eloAfter[sid];
              const affected = tape.eloAffected?.[sid] ?? delta !== 0;
              if (!affected) {
                return (
                  <div className="aar__elo-badge aar__elo-badge--null">
                    <span className="aar__elo-label">{t("aar_elo")}</span>
                    <span className="aar__elo-null">
                      {t("aar_elo_unaffected")}
                    </span>
                  </div>
                );
              }
              const cls =
                delta > 0
                  ? "aar__elo-badge aar__elo-badge--up"
                  : delta < 0
                    ? "aar__elo-badge aar__elo-badge--down"
                    : "aar__elo-badge aar__elo-badge--null";
              const sign = delta > 0 ? "+" : "";
              return (
                <div className={cls}>
                  <span className="aar__elo-label">{t("aar_elo")}</span>
                  <span className="aar__elo-delta">
                    {sign}
                    {delta}
                  </span>
                  {after != null && (
                    <span className="aar__elo-after">→ {after}</span>
                  )}
                </div>
              );
            })()}
            <div className="aar__card-foot">
              <span>{t("game_over_closing")}</span>
              <TileComponent tile={tape.closingTile} />
            </div>
          </section>

          {/* Score chart */}
          <section className="aar__card aar__card--chart">
            <div className="aar__card-label">{t("aar_score_chart")}</div>
            <div className="aar__chart-wrap">
              <ScoreChart
                series={analytics.scoreSeries}
                players={tape.players}
                themes={themes}
              />
            </div>
          </section>

          {/* Fortune Factor */}
          <section className="aar__card aar__card--fortune">
            <div className="aar__card-label">{t("aar_fortune")}</div>
            <table className="aar__table">
              <thead>
                <tr>
                  <th>{t("aar_col_player")}</th>
                  <th>{t("aar_col_drawn")}</th>
                  <th>{t("aar_col_melded")}</th>
                  <th>{t("aar_col_factor")}</th>
                  <th>{t("aar_col_elo")}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.fortune.map((row) => {
                  const c = themes[row.colorIndex % themes.length];
                  const delta = tape.eloDeltas[row.sessionId] ?? 0;
                  const affected =
                    tape.eloAffected?.[row.sessionId] ?? delta !== 0;
                  const dCls = !affected
                    ? "aar__delta aar__delta--null"
                    : delta > 0
                      ? "aar__delta aar__delta--up"
                      : delta < 0
                        ? "aar__delta aar__delta--down"
                        : "aar__delta aar__delta--null";
                  const sign = delta > 0 ? "+" : "";
                  return (
                    <tr key={row.sessionId}>
                      <td style={{ color: c }}>{row.name}</td>
                      <td>{row.drawn}</td>
                      <td>{row.melded}</td>
                      <td className="aar__table-value">{row.factor}%</td>
                      <td>
                        {!affected ? (
                          <span
                            className={dCls}
                            title={t("aar_elo_unaffected_tooltip")}
                          >
                            —
                          </span>
                        ) : (
                          <span className={dCls}>
                            {sign}
                            {delta}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Stats: washer + pivot */}
          <section className="aar__card aar__card--stats">
            <div className="aar__card-label">{t("aar_match_stats")}</div>
            <dl className="aar__statlist">
              <dt>{t("aar_most_active_washer")}</dt>
              <dd>
                {analytics.mostActiveWasher
                  ? `${analytics.mostActiveWasher.name} · ${analytics.mostActiveWasher.contribution}px`
                  : "—"}
              </dd>
              <dt>{t("aar_pivot")}</dt>
              <dd>
                {analytics.pivot
                  ? t("aar_pivot_value", {
                      name: analytics.pivot.leaderName,
                      index: analytics.pivot.eventIndex + 1,
                    })
                  : "—"}
              </dd>
            </dl>
          </section>

          {/* Highlights */}
          <section className="aar__card aar__card--highlights">
            <div className="aar__card-label">{t("aar_highlights")}</div>
            {analytics.highlights.length === 0 ? (
              <div className="aar__empty">{t("aar_no_highlights")}</div>
            ) : (
              <ul className="aar__highlights">
                {analytics.highlights.map((h, i) => (
                  <li key={i}>
                    <Trans
                      i18nKey={h.key}
                      values={h.vars}
                      components={{ strong: <strong /> }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="aar__footer">
          <div className="aar__ready-cluster">
            <button
              className={`aar__btn aar__btn--ready${ready ? " aar__btn--ready-done" : ""}`}
              onClick={onReady}
              disabled={ready}
            >
              {ready ? t("ready_btn_done") : t("ready_btn")}
            </button>
            <span className="aar__ready-status">
              {t("ready_status", { count: readyCount, total: readyTotal })}
            </span>
          </div>
          <div className="aar__btn-row">
            <button
              className="aar__btn aar__btn--replay"
              onClick={onWatchReplay}
              disabled={tape.events.length === 0}
            >
              ▶ {t("aar_watch_replay")}
            </button>
            <button
              className="aar__btn aar__btn--play-again"
              onClick={onPlayAgain}
            >
              {t("game_over_replay")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default AfterActionReport;
