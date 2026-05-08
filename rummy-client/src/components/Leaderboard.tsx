import { useTranslation } from "react-i18next";
import "./Leaderboard.css";

interface Row {
  sessionId: string;
  name: string;
  isBot: boolean;
  colorIndex: number;
  connectionStatus: "active" | "disconnected";
  score: number;
  /** Persistent Syndicate Ledger ELO. 1200 default for new / bots. */
  eloScore: number;
  isLocal: boolean;
}

interface Props {
  rows: Row[];
  themes: readonly string[];
}

export function Leaderboard({ rows, themes }: Props) {
  const { t } = useTranslation();
  // Sort by score descending; ties keep insertion order.
  const sorted = [...rows].sort((a, b) => b.score - a.score);

  return (
    <aside className="leaderboard" aria-label={t("leaderboard_title")}>
      <header className="leaderboard__header">
        <span className="leaderboard__prompt">$</span>
        <span className="leaderboard__title">{t("leaderboard_title")}</span>
      </header>
      <ol className="leaderboard__rows">
        {sorted.map((r, i) => {
          const color = themes[r.colorIndex % themes.length];
          return (
            <li
              key={r.sessionId}
              className={`leaderboard__row${r.isLocal ? " leaderboard__row--self" : ""}${r.connectionStatus === "disconnected" ? " leaderboard__row--offline" : ""}`}
              style={{ ["--row-color" as string]: color }}
            >
              <span className="leaderboard__rank">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="leaderboard__name" title={r.name}>
                {r.name}
                {r.isBot && <span className="leaderboard__tag"> [BOT]</span>}
                {!r.isBot && (
                  <span className="leaderboard__elo" title={t("leaderboard_elo_tooltip")}>
                    ⚡{r.eloScore}
                  </span>
                )}
              </span>
              <span className="leaderboard__score">{r.score}</span>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="leaderboard__empty">{t("leaderboard_empty")}</li>
        )}
      </ol>
    </aside>
  );
}

export default Leaderboard;
