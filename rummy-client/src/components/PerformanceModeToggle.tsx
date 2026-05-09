// v3.4.0 — Performance Mode (Low-FX) toggle. Adds .app--low-fx which
// disables the heaviest visual effects:
//   - CRT scanline overlay (.app::after) hidden
//   - .aar backdrop-filter dropped (notable cost on older GPUs)
//   - All idle/pulse keyframes paused (brand neon, discard target,
//     discard ghost, new-meld pulse, etc.)
//   - .tile box-shadow simplified to a single drop layer
//
// Persists in localStorage. Sits beside Fit-to-Screen and High
// Visibility in the sidebar.

import { useTranslation } from "react-i18next";
import "./PerformanceModeToggle.css";

const STORAGE_KEY = "rommy.low_fx";

export function readPerformanceMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePerformanceMode(on: boolean): void {
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

export function PerformanceModeToggle({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const set = (next: boolean) => {
    if (next === enabled) return;
    writePerformanceMode(next);
    onChange(next);
  };
  return (
    <aside className="perf-toggle" aria-label={t("perf_label")}>
      <header className="perf-toggle__header">
        <span className="perf-toggle__prompt">$</span>
        <span className="perf-toggle__title">{t("perf_label")}</span>
      </header>
      <div className="perf-toggle__buttons" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          className={
            "perf-toggle__btn" + (!enabled ? " perf-toggle__btn--active" : "")
          }
          onClick={() => set(false)}
        >
          {t("perf_off")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          className={
            "perf-toggle__btn" + (enabled ? " perf-toggle__btn--active" : "")
          }
          onClick={() => set(true)}
        >
          {t("perf_on")}
        </button>
      </div>
    </aside>
  );
}

export default PerformanceModeToggle;
