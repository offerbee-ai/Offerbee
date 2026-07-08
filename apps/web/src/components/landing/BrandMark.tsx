/**
 * OfferBee bee mark (amber gradient) + optional wordmark, from the handoff.
 * `gid` makes the gradient/clip ids unique so multiple marks can coexist.
 */
export function BeeLogo({
  size = 34,
  gid = "nav",
}: {
  size?: number;
  gid?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className="block shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`amber-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB300" />
          <stop offset="1" stopColor="#FF6D00" />
        </linearGradient>
        <clipPath id={`beebody-${gid}`}>
          <rect x="146" y="216" width="240" height="140" rx="70" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#amber-${gid})`} />
      <ellipse
        cx="226"
        cy="164"
        rx="46"
        ry="72"
        transform="rotate(-24 226 164)"
        fill="#FFFFFF"
        opacity="0.55"
      />
      <ellipse
        cx="306"
        cy="164"
        rx="46"
        ry="72"
        transform="rotate(24 306 164)"
        fill="#FFFFFF"
        opacity="0.85"
      />
      <path
        d="M360 270 Q404 278 412 286 Q404 294 360 302 Z"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <rect x="146" y="216" width="240" height="140" rx="70" fill="#FFFFFF" />
      <g clipPath={`url(#beebody-${gid})`}>
        <rect x="236" y="200" width="30" height="180" fill="#FF6D00" opacity="0.9" />
        <rect x="296" y="200" width="30" height="180" fill="#FF6D00" opacity="0.9" />
      </g>
      <circle cx="196" cy="272" r="13" fill="#FF6D00" />
      <path
        d="M172 222 Q160 184 132 172"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="128" cy="170" r="10" fill="#FFFFFF" />
    </svg>
  );
}

export function BrandMark({
  size = 34,
  wordSize = 22,
  gid = "nav",
}: {
  size?: number;
  wordSize?: number;
  gid?: string;
}) {
  return (
    <div className="flex items-center gap-[11px]">
      <BeeLogo size={size} gid={gid} />
      <span
        className="font-display font-semibold tracking-[-0.01em]"
        style={{ fontSize: wordSize }}
      >
        OfferBee
      </span>
    </div>
  );
}
