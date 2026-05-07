import "./CheatSheet.css";

interface Props {
  isModal?: boolean;
  onClose?: () => void;
}

export function CheatSheet({ isModal, onClose }: Props) {
  return (
    <aside
      className={`cheat-sheet${isModal ? " cheat-sheet--modal" : ""}`}
      aria-label="Quick rules"
    >
      {isModal && onClose && (
        <button
          className="cheat-sheet__close"
          onClick={onClose}
          aria-label="Close rules"
        >
          ×
        </button>
      )}

      <h3 className="cheat-sheet__title">Quick Rules</h3>

      <section className="cheat-sheet__section">
        <h4>Etalare (Initial Meld)</h4>
        <p>
          Requires <strong>more than 45 points</strong> and at least one
          valid combination:
        </p>
        <ul>
          <li>
            <em>Run (Suită)</em> — 3+ tiles of the same color in
            consecutive order. e.g. <code>7-8-9</code> red.
          </li>
          <li>
            <em>Set (Formație)</em> — 3 or 4 tiles of the same value in
            different colors. e.g. <code>5-5-5</code>.
          </li>
        </ul>
      </section>

      <section className="cheat-sheet__section">
        <h4>Tile Points</h4>
        <ul>
          <li>
            <code>2-9</code> = 5 pts
          </li>
          <li>
            <code>10-1</code> = 10 pts
          </li>
          <li>
            <code>1</code> in a <code>1-2-3</code> run = 5 pts
          </li>
          <li>
            <code>1</code> in a formation of ones (e.g.{" "}
            <code>1-1-1</code>) = 25 pts
          </li>
          <li>Joly (Joker) = 50 pts</li>
        </ul>
      </section>

      <section className="cheat-sheet__section">
        <h4>Rupere (Pick from Discard)</h4>
        <p>
          You may pick the last discarded tile <strong>only if</strong> you
          immediately use it in a meld this turn.
        </p>
      </section>

      <section className="cheat-sheet__section">
        <h4>Winning</h4>
        <p>You must discard your final tile to the table to close the game.</p>
      </section>
    </aside>
  );
}

export default CheatSheet;
