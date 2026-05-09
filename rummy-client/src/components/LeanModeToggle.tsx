// v3.5.0 Lean Circuitry — LEAN MODE toggle. Sits beneath the
// VolumeSlider in the sidebar. When ON:
//   - .app--lean-mode is applied (strips shadows, blurs, patterns,
//     backdrop-filters; replaces with 1px borders; dims the neon).
//   - DiscardPile virtualizes (window-based rendering with a 2-tile
//     buffer; out-of-window slots render as zero-cost placeholders).
//   - Idle animations pause.
//
// State persists to localStorage. Distinct from Performance Mode
// (v3.4.0): low-fx targets compositor cost, lean-mode targets DOM
// node count + GPU memory on 8 GB RAM laptops.

import { useTranslation } from "react-i18next";
import "./LeanModeToggle.css";

const STORAGE_KEY = "rommy.lean_mode";

export function readLeanMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLeanMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* localStorage unavailable — silent fallback */
  }
}

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function LeanModeToggle({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const set = (next: boolean) => {
    if (next === enabled) return;
    writeLeanMode(next);
    onChange(next);
  };
  return (
    <aside className="lean-toggle" aria-label={t("lean_label")}>
      <header className="lean-toggle__header">
        <span className="lean-toggle__prompt">$</span>
        <span className="lean-toggle__title">{t("lean_label")}</span>
        <span className="lean-toggle__subtext" aria-hidden="true">
          {t("lean_subtext")}
        </span>
      </header>
      <div className="lean-toggle__buttons" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          className={
            "lean-toggle__btn" + (!enabled ? " lean-toggle__btn--active" : "")
          }
          onClick={() => set(false)}
        >
          {t("lean_off")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          className={
            "lean-toggle__btn" + (enabled ? " lean-toggle__btn--active" : "")
          }
          onClick={() => set(true)}
        >
          {t("lean_on")}
        </button>
      </div>
    </aside>
  );
}

export default LeanModeToggle;
