/** Geometric equilibrium mark — personal + shared funds in balance. */
export function WazenMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="WAZEN"
    >
      <path
        d="M 8 36 C 8 20, 20 10, 32 10 C 38 10, 42 14, 42 20 C 42 28, 30 36, 18 36 Z"
        fill="#0F172A"
      />
      <path
        d="M 40 12 C 40 28, 28 38, 16 38 C 10 38, 6 34, 6 28 C 6 20, 18 12, 30 12 Z"
        fill="#10B981"
        fillOpacity={0.92}
      />
      <circle cx="24" cy="24" r="4.5" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="2.5" fill="#0F172A" />
    </svg>
  );
}

export function WazenMarkFramed({ size = 48, className }: { size?: number; className?: string }) {
  const radius = Math.round(size * 0.25);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="WAZEN"
    >
      <rect width="48" height="48" rx={radius > 16 ? 16 : radius} fill="#F6F9FC" />
      <path
        d="M 8 36 C 8 20, 20 10, 32 10 C 38 10, 42 14, 42 20 C 42 28, 30 36, 18 36 Z"
        fill="#0F172A"
      />
      <path
        d="M 40 12 C 40 28, 28 38, 16 38 C 10 38, 6 34, 6 28 C 6 20, 18 12, 30 12 Z"
        fill="#10B981"
        fillOpacity={0.92}
      />
      <circle cx="24" cy="24" r="4.5" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="2.5" fill="#0F172A" />
    </svg>
  );
}
