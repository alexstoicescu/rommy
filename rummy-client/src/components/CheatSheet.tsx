import { Trans, useTranslation } from "react-i18next";
import "./CheatSheet.css";

interface Props {
  isModal?: boolean;
  onClose?: () => void;
}

const RICH = { strong: <strong />, em: <em />, code: <code /> };

export function CheatSheet({ isModal, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <aside
      className={`cheat-sheet${isModal ? " cheat-sheet--modal" : ""}`}
      aria-label={t("rules_header")}
    >
      {isModal && onClose && (
        <button
          className="cheat-sheet__close"
          onClick={onClose}
          aria-label={t("rules_close_aria")}
        >
          ×
        </button>
      )}

      <h3 className="cheat-sheet__title">{t("rules_header")}</h3>

      <section className="cheat-sheet__section">
        <h4>{t("rules_etalare_h")}</h4>
        <p>
          <Trans i18nKey="rules_etalare_lead" components={RICH} />
        </p>
        <ul>
          <li>
            <Trans i18nKey="rules_etalare_run" components={RICH} />
          </li>
          <li>
            <Trans i18nKey="rules_etalare_set" components={RICH} />
          </li>
        </ul>
      </section>

      <section className="cheat-sheet__section">
        <h4>{t("rules_points_h")}</h4>
        <ul>
          <li>
            <Trans i18nKey="rules_pt_2_9" components={RICH} />
          </li>
          <li>
            <Trans i18nKey="rules_pt_10_1" components={RICH} />
          </li>
          <li>
            <Trans i18nKey="rules_pt_one_run" components={RICH} />
          </li>
          <li>
            <Trans i18nKey="rules_pt_one_set" components={RICH} />
          </li>
          <li>{t("rules_pt_joker")}</li>
        </ul>
      </section>

      <section className="cheat-sheet__section">
        <h4>{t("rules_rupere_h")}</h4>
        <p>
          <Trans i18nKey="rules_rupere_text" components={RICH} />
        </p>
      </section>

      <section className="cheat-sheet__section">
        <h4>{t("rules_winning_h")}</h4>
        <p>{t("rules_winning_text")}</p>
      </section>
    </aside>
  );
}

export default CheatSheet;
