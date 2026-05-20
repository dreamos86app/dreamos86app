/** DreamOS86 setup mark — orbit + cube, not a generic sparkle. */
export function DreamOsSetupIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="13" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
      <path
        d="M24 8v6M24 34v6M8 24h6M34 24h6"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="17"
        y="17"
        width="14"
        height="14"
        rx="3"
        className="fill-accent/20 stroke-accent"
        strokeWidth="1.75"
      />
      <path d="M21 24h6M24 21v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
    </svg>
  );
}
