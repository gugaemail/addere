interface LogoProps {
  size?: number
  showWordmark?: boolean
  wordmarkClass?: string
}

export function Logo({ size = 28, showWordmark = false, wordmarkClass }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
        {/* A stroke */}
        <path
          d="M10 22.5L16 9.5L22 22.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* crossbar */}
        <path
          d="M12.5 19h7"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* connectivity dot — integração */}
        <circle cx="23.5" cy="9" r="2.5" fill="#a5b4fc" />
      </svg>
      {showWordmark && (
        <span className={wordmarkClass}>Addere</span>
      )}
    </span>
  )
}
