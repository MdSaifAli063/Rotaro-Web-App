type Props = {
  className?: string;
  /** Background color of the rounded square. Defaults to navy. */
  bg?: string;
  /** Color of the "card" cells / pins. Defaults to white. */
  fg?: string;
  /** Opacity for the muted cells (top-right & bottom-left). */
  mutedOpacity?: number;
};

/**
 * Rotaro symbol-only mark: navy rounded square containing a 2x2 calendar grid
 * (two cells with checkmarks, two muted) and two binding pins at the top.
 * Stays crisp from 16px (favicon) up to large hero usage.
 */
export function RotaroMark({
  className,
  bg = "#1E2A45",
  fg = "#FFFFFF",
  mutedOpacity = 0.35,
}: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Binding pins */}
      <rect x="18" y="2" width="6" height="8" rx="2" fill={bg} />
      <rect x="40" y="2" width="6" height="8" rx="2" fill={bg} />
      {/* Rounded square base */}
      <rect x="6" y="8" width="52" height="52" rx="10" fill={bg} />
      {/* 2x2 grid cells */}
      {/* top-left (checked) */}
      <rect x="13" y="20" width="16" height="16" rx="3" fill={fg} />
      <path
        d="M17 28.5 L20.5 32 L26 25.5"
        fill="none"
        stroke={bg}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* top-right (muted) */}
      <rect x="35" y="20" width="16" height="16" rx="3" fill={fg} fillOpacity={mutedOpacity} />
      {/* bottom-left (muted) */}
      <rect x="13" y="42" width="16" height="16" rx="3" fill={fg} fillOpacity={mutedOpacity} />
      {/* bottom-right (checked) */}
      <rect x="35" y="42" width="16" height="16" rx="3" fill={fg} />
      <path
        d="M39 50.5 L42.5 54 L48 47.5"
        fill="none"
        stroke={bg}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
