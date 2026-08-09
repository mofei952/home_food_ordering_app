interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: string;
  disabled?: boolean;
}

export function Chip({ selected, onClick, children, disabled }: ChipProps) {
  if (onClick) {
    return (
      <button
        type="button"
        className={selected ? "chip is-selected" : "chip"}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={selected ? "chip is-selected" : "chip"}>{children}</span>
  );
}
