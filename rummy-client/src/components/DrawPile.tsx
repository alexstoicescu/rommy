import "./DrawPile.css";

interface Props {
  onClick?: () => void;
  empty?: boolean;
  disabled?: boolean;
  count?: number;
}

export function DrawPile({ onClick, empty, disabled, count }: Props) {
  const inactive = empty || disabled;
  const cls = [
    "draw-pile",
    empty ? "draw-pile--empty" : "",
    disabled ? "draw-pile--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="draw-pile-wrap">
      <div
        className={cls}
        aria-label="Draw pile"
        aria-disabled={inactive ? "true" : undefined}
        onClick={inactive ? undefined : onClick}
      />
      {typeof count === "number" && (
        <span className="draw-pile__badge">{count} left</span>
      )}
    </div>
  );
}

export default DrawPile;
