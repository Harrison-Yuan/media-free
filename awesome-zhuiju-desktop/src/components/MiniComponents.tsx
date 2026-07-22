export function PulseDots() {
  return (
    <span className="dot-pulse inline-flex items-center gap-1">
      <span /><span /><span />
    </span>
  );
}

export function ShortcutHint({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
      <kbd style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 10,
        color: "var(--text-tertiary)",
        fontFamily: "inherit",
      }}>
        {keys}
      </kbd>
    </div>
  );
}
