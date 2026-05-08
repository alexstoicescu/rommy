import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVolume, setVolume } from "../audio";
import "./VolumeSlider.css";

export function VolumeSlider() {
  const { t } = useTranslation();
  const [volume, setVol] = useState(() => getVolume());

  useEffect(() => {
    setVolume(volume);
  }, [volume]);

  const pct = Math.round(volume * 100);

  return (
    <aside className="volume-slider" aria-label={t("volume_label")}>
      <header className="volume-slider__header">
        <span className="volume-slider__prompt">$</span>
        <span className="volume-slider__title">{t("volume_label")}</span>
        <span className="volume-slider__value">{pct}%</span>
      </header>
      <input
        className="volume-slider__input"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => setVol(Number(e.currentTarget.value) / 100)}
        style={{ ["--fill" as string]: `${pct}%` }}
        aria-label={t("volume_label")}
      />
    </aside>
  );
}

export default VolumeSlider;
