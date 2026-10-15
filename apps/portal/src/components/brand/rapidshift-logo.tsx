import React from "react";

interface RapidShiftLogoProps {
  size?: number | "xs" | "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

export function RapidShiftLogo({
  size = "md",
  showWordmark = false,
  className = "",
  wordmarkClassName = "",
}: RapidShiftLogoProps) {
  const pixelSize =
    typeof size === "number"
      ? size
      : size === "xs"
      ? 20
      : size === "sm"
      ? 28
      : size === "md"
      ? 36
      : size === "lg"
      ? 48
      : 64;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Precision Geometric Technical Mark: The Hexagonal Phase-Shift Core */}
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
        aria-label="RapidShift Labs Mark"
      >
        <defs>
          {/* Upper Node Gradients - Electric Cobalt Spectrum */}
          <linearGradient id="rsl-top-roof" x1="15" y1="10" x2="85" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          <linearGradient id="rsl-left-wall" x1="15" y1="30" x2="33" y2="62" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e40af" />
          </linearGradient>

          <linearGradient id="rsl-shift-core" x1="50" y1="29" x2="68" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          {/* Lower Foundation Gradients - Precision Titanium / Slate Spectrum */}
          <linearGradient id="rsl-bottom-floor" x1="85" y1="90" x2="15" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          <linearGradient id="rsl-right-wall" x1="85" y1="70" x2="67" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>

          <linearGradient id="rsl-base-step" x1="50" y1="71" x2="32" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          {/* Cyan High-Energy Core Node */}
          <linearGradient id="rsl-data-core" x1="44" y1="44" x2="56" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>

        {/* 1. UPPER COBALT NODE (The 'R' Velocity Wing) */}
        {/* Top Chevron Roof */}
        <polygon
          points="50,10 85,30 68,40 50,29 32,40 15,30"
          fill="url(#rsl-top-roof)"
        />

        {/* Left Vertical Foundation Pillar */}
        <polygon
          points="15,30 32,40 32,62 15,52"
          fill="url(#rsl-left-wall)"
        />

        {/* Center Dynamic Shift Loop & Leg */}
        <polygon
          points="50,29 68,40 68,54 50,64 50,52 60,46 50,40"
          fill="url(#rsl-shift-core)"
        />

        {/* 2. LOWER TITANIUM FOUNDATION (The 'S' State Node) */}
        {/* Bottom Chevron Floor */}
        <polygon
          points="50,90 15,70 32,60 50,71 68,60 85,70"
          fill="url(#rsl-bottom-floor)"
        />

        {/* Right Vertical Stabilizer Pillar */}
        <polygon
          points="85,70 68,60 68,38 85,48"
          fill="url(#rsl-right-wall)"
        />

        {/* Center Foundation Anchor Step */}
        <polygon
          points="50,71 32,60 32,46 50,36 50,48 40,54 50,60"
          fill="url(#rsl-base-step)"
        />

        {/* 3. CENTRAL PHASE-SHIFT DATA CORE */}
        <polygon
          points="50,43 57,48 50,53 43,48"
          fill="url(#rsl-data-core)"
        />
      </svg>

      {/* Modern Technical Wordmark */}
      {showWordmark && (
        <div className={`flex flex-col ${wordmarkClassName}`}>
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-white">
              RapidShift
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 tracking-wider uppercase">
              Labs
            </span>
          </div>
          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wider uppercase mt-1">
            Control Panel
          </span>
        </div>
      )}
    </div>
  );
}

export default RapidShiftLogo;
