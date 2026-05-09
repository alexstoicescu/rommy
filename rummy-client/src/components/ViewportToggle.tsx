// v3.1.0 — Fit-to-Screen toggle. Sits in the sidebar next to volume +
// language. State persists in localStorage; the selected mode is
// surfaced as a class on .app (`app--fixed-size` when fixed) so the
// CSS-token cascade in App.css can swap tile / padding metrics
// without React re-rendering the whole tree.
//
// "Responsive" (default) lets the @media (max-height: 900px) breakpoint
// do its work. "Fixed Size" pins the v2.9.x metrics regardless of
// viewport — useful for users with external monitors who want the
// larger tile face and accept an internal meld-zone scrollbar instead.

import { useTranslation } from "react-i18next";
import "./ViewportToggle.css";

export type ViewportMode = "responsive" | "fixed";

const STORAGE_KEY = "rommy.viewport_mode";

export function readViewportMode(): ViewportMode {
  if (typeof window === "undefined") return "responsive";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "fixed" ? "fixed" : "responsive";
  } catch {
    return "responsive";
  }
}

function writeViewportMode(mode: ViewportMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* localStorage unavailable — silently fall back to in-memory only */
  }
}

interface Props {
  mode: ViewportMode;
  onChange: (mode: ViewportMode) => void;
}

export function ViewportToggle({ mode, onChange }: Props) {
  const { t } = useTranslation();
  const set = (next: ViewportMode) => {
    if (next === mode) return;
    writeViewportMode(next);
    onChange(next);
  };
  return (
    <aside className="viewport-toggle" aria-label={t("viewport_label")}>
      <header className="viewport-toggle__header">
        <span className="viewport-toggle__prompt">$</span>
        <span className="viewport-toggle__title">{t("viewport_label")}</span>
      </header>
      <div className="viewport-toggle__buttons" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "responsive"}
          className={
            "viewport-toggle__btn" +
            (mode === "responsive" ? " viewport-toggle__btn--active" : "")
          }
          onClick={() => set("responsive")}
        >
          {t("viewport_responsive")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "fixed"}
          className={
            "viewport-toggle__btn" +
            (mode === "fixed" ? " viewport-toggle__btn--active" : "")
          }
          onClick={() => set("fixed")}
        >
          {t("viewport_fixed")}
        </button>
      </div>
    </aside>
  );
}

export default ViewportToggle;
