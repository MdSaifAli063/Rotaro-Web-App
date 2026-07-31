type Props = {
  className?: string;
  variant?: "default" | "inverse";
};

type BrandProps = Props & {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
  subtitleClassName?: string;
  textClassName?: string;
};

const brandSizes = {
  sm: { mark: "size-7", text: "text-lg", subtitle: "pl-9" },
  md: { mark: "size-8", text: "text-xl", subtitle: "pl-10" },
  lg: { mark: "size-10", text: "text-[2rem]", subtitle: "pl-12" },
} as const;

/** Rotaro's symbol mark, kept inline so it stays crisp at every interface size. */
export function RotaroMark({ className, variant = "default" }: Props) {
  const barColor = variant === "inverse" ? "#FFFFFF" : "#071C3D";

  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="47" cy="11" r="7" fill="#176BFF" />
      <rect x="7" y="35" width="12" height="24" rx="5" fill={barColor} />
      <rect x="24" y="22" width="12" height="37" rx="5" fill={barColor} />
      <rect x="41" y="22" width="12" height="37" rx="5" fill={barColor} />
    </svg>
  );
}

/** The canonical Rotaro symbol and wordmark lockup used throughout the product. */
export function RotaroBrand({
  className,
  variant = "default",
  size = "md",
  subtitle,
  subtitleClassName,
  textClassName,
}: BrandProps) {
  const styles = brandSizes[size];
  const textColor = variant === "inverse" ? "text-white" : "text-[var(--navy)]";

  return (
    <span className={`inline-flex min-w-0 flex-col ${className ?? ""}`}>
      <span className="inline-flex min-w-0 items-end gap-2">
        <RotaroMark className={`${styles.mark} shrink-0`} variant={variant} />
        <span
          className={`truncate font-bold leading-none tracking-tight ${textColor} ${
            textClassName ?? ""
          } ${styles.text}`}
        >
          Rotaro
        </span>
      </span>
      {subtitle ? (
        <span
          className={`mt-1 truncate text-xs capitalize ${styles.subtitle} ${
            subtitleClassName ?? ""
          }`}
        >
          {subtitle}
        </span>
      ) : null}
    </span>
  );
}
