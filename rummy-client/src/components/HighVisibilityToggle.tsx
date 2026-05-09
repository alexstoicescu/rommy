// v3.2.0 — High Visibility Mode toggle. Sits beside the Fit-to-Screen
// toggle in the sidebar. When ON, .app gets the .app--high-vis class
// which (a) bumps tile font-weight from 700 to 900 and (b) doubles
// the blur radii on the suit rim + outer halo. State persists in
// localStorage.
//
// Kept as its own component (rather than folded into ViewportToggle)
// because the two settings are orthogonal — a user might want fixed
// tile sizes AND high-visibility, or either alone.

import { useTranslation } from "react-i18next";
import "./HighVisibilityToggle.css";

const STORAGE_KEY = "rommy.high_vis";

export function readHighVisibility(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHighVisibility(on: boolean): void {
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

export function HighVisibilityToggle({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const set = (next: boolean) => {
    if (next === enabled) return;
    writeHighVisibility(next);
    onChange(next);
  };
  return (
    <aside className="hv-toggle" aria-label={t("high_vis_label")}>
      <header className="hv-toggle__header">
        <span className="hv-toggle__prompt">$</span>
        <span className="hv-toggle__title">{t("high_vis_label")}</span>
      </header>
      <div className="hv-toggle__buttons" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          className={
            "hv-toggle__btn" + (!enabled ? " hv-toggle__btn--active" : "")
          }
          onClick={() => set(false)}
        >
          {t("high_vis_off")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          className={
            "hv-toggle__btn" + (enabled ? " hv-toggle__btn--active" : "")
          }
          onClick={() => set(true)}
        >
          {t("high_vis_on")}
        </button>
      </div>
    </aside>
  );
}

export default HighVisibilityToggle;
