interface LogoProps {
  size?: number
  showWordmark?: boolean
  wordmarkClass?: string
}

export function Logo({ size = 28, showWordmark = false, wordmarkClass }: LogoProps) {
  const id = 'addere-logo-grad'
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Addere"
      >
        <defs>
          <linearGradient id={id} x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#29BEFF" />
            <stop offset="50%"  stopColor="#1B4FA8" />
            <stop offset="100%" stopColor="#0D2045" />
          </linearGradient>
          <clipPath id="addere-logo-clip">
            <rect x="33" y="5"  width="34" height="90" rx="17" />
            <rect x="5"  y="33" width="90" height="34" rx="17" />
          </clipPath>
        </defs>
        <rect
          x="0" y="0" width="100" height="100"
          fill={`url(#${id})`}
          clipPath="url(#addere-logo-clip)"
        />
      </svg>
      {showWordmark && (
        <span className={wordmarkClass}>Addere</span>
      )}
    </span>
  )
}
