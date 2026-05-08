import { useTranslation } from "react-i18next";
import "./LanguageSwitcher.css";

/* Label standard (v2.6.x): text codes instead of flag glyphs.
   "ENG" for English, "RO" for Romanian. */
const OPTIONS = [
  { code: "en", short: "ENG", label: "English" },
  { code: "ro", short: "RO", label: "Română" },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const active = i18n.resolvedLanguage ?? i18n.language ?? "en";

  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          className={`lang-switch__btn${
            active.startsWith(opt.code) ? " lang-switch__btn--active" : ""
          }`}
          aria-label={opt.label}
          aria-pressed={active.startsWith(opt.code)}
          onClick={() => void i18n.changeLanguage(opt.code)}
        >
          <span className="lang-switch__code">{opt.short}</span>
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitcher;
