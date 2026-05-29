interface LogoProps {
  size?: number
  showWordmark?: boolean
  wordmarkClass?: string
}

export function Logo({ size = 28, showWordmark = false, wordmarkClass }: LogoProps) {
  const uid = `al-${size}`
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
          <linearGradient id={`${uid}-g`} x1="10" y1="5" x2="90" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#29BEFF" />
            <stop offset="48%" stopColor="#1B4FA8" />
            <stop offset="100%" stopColor="#0D2045" />
          </linearGradient>
          <radialGradient id={`${uid}-s`} cx="30" cy="38" r="45" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${uid}-c`}>
            <rect x="33" y="5"  width="34" height="90" rx="17" />
            <rect x="5"  y="33" width="90" height="34" rx="17" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${uid}-g)`} clipPath={`url(#${uid}-c)`} />
        <rect x="0" y="0" width="100" height="100" fill={`url(#${uid}-s)`} clipPath={`url(#${uid}-c)`} />
      </svg>
      {showWordmark && (
        <span className={wordmarkClass}>addere</span>
      )}
    </span>
  )
}
