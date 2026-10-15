import React from "react";

export type IosSpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | number;

export interface IosSpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: IosSpinnerSize;
  variant?: "smooth" | "stepped";
  className?: string;
  label?: string;
  showLabel?: boolean;
}

const SIZE_MAP: Record<string, { className: string; px: number }> = {
  xs: { className: "w-3 h-3", px: 12 },
  sm: { className: "w-3.5 h-3.5", px: 14 },
  md: { className: "w-4 h-4", px: 16 },
  lg: { className: "w-5 h-5", px: 20 },
  xl: { className: "w-6 h-6", px: 24 },
  "2xl": { className: "w-8 h-8", px: 32 },
  "3xl": { className: "w-12 h-12", px: 48 },
};

/**
 * Authentic Apple iOS Activity Indicator (UIActivityIndicatorView style).
 * 12 radial rounded capsules with clockwise stepped/smooth opacity fade trail.
 */
export function IosSpinner({
  size = "md",
  variant = "smooth",
  className = "",
  label,
  showLabel = false,
  style,
  ...props
}: IosSpinnerProps) {
  const sizeConfig = typeof size === "number" ? null : SIZE_MAP[size] || SIZE_MAP.md;
  const dimension = typeof size === "number" ? size : sizeConfig?.px ?? 16;
  const sizeClass = sizeConfig ? sizeConfig.className : "";

  const duration = 1.0; // 1 second full cycle
  const timing = variant === "stepped" ? "steps(12, start)" : "linear";

  const spinnerSvg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={label || "Loading"}
      className={`inline-block shrink-0 align-middle ${sizeClass} ${className}`.trim()}
      style={{
        width: typeof size === "number" ? `${dimension}px` : undefined,
        height: typeof size === "number" ? `${dimension}px` : undefined,
        ...style,
      }}
      {...props}
    >
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30;
        // Negative animation delay creates the clockwise light-sweep effect
        const delay = -((12 - i) * duration) / 12;
        return (
          <rect
            key={i}
            x="11"
            y="1.5"
            width="2"
            height="5.5"
            rx="1"
            ry="1"
            fill="currentColor"
            className="ios-spoke"
            style={{
              transform: `rotate(${angle}deg)`,
              animationDelay: `${delay.toFixed(4)}s`,
            }}
          />
        );
      })}
    </svg>
  );

  if (showLabel && label) {
    return (
      <span className="inline-flex items-center gap-2 font-medium">
        {spinnerSvg}
        <span>{label}</span>
      </span>
    );
  }

  return spinnerSvg;
}

/**
 * Full page or large container loading state with the iOS spinner.
 */
export function IosPageLoader({
  message = "Loading...",
  subtext,
  className = "",
  size = "2xl",
}: {
  message?: string;
  subtext?: string;
  className?: string;
  size?: IosSpinnerSize;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[280px] w-full p-8 text-center animate-in fade-in duration-200 ${className}`.trim()}
    >
      <div className="relative flex items-center justify-center p-4 rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm backdrop-blur-md">
        <IosSpinner size={size} className="text-zinc-600 dark:text-zinc-300" />
      </div>
      {message && (
        <p className="mt-4 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {message}
        </p>
      )}
      {subtext && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
          {subtext}
        </p>
      )}
    </div>
  );
}

/**
 * Centered modal/card backdrop loading overlay.
 */
export function IosLoadingOverlay({
  visible = true,
  message,
  className = "",
}: {
  visible?: boolean;
  message?: string;
  className?: string;
}) {
  if (!visible) return null;

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center rounded-inherit backdrop-blur-xs bg-black/15 dark:bg-black/35 transition-all duration-200 ${className}`.trim()}
    >
      <div className="flex flex-col items-center gap-3 p-4 px-6 rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 shadow-xl backdrop-blur-md">
        <IosSpinner size="xl" className="text-zinc-700 dark:text-zinc-200" />
        {message && (
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline loader for tables, rows, badges, or small cards.
 */
export function IosInlineLoader({
  label = "Loading...",
  className = "",
  size = "sm",
}: {
  label?: string;
  className?: string;
  size?: IosSpinnerSize;
}) {
  return (
    <div className={`inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 ${className}`.trim()}>
      <IosSpinner size={size} className="text-zinc-500 dark:text-zinc-400" />
      {label && <span>{label}</span>}
    </div>
  );
}
