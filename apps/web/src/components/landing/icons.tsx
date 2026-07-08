import type { SVGProps } from "react";

/**
 * Custom outlined icon set (24px grid, 1.8 stroke, round caps/joins) from the
 * OfferBee handoff. All use `currentColor` so color follows the text utility.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({
  size = 24,
  strokeWidth = 1.9,
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Base>
  );
}

export function ChecklistIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6.5 5.3 7.8 7.5 5.5" />
      <path d="M4 12.5 5.3 13.8 7.5 11.5" />
      <path d="M4 18.3 5.3 19.6 7.5 17.3" />
      <path d="M11 6.5h9M11 12.5h9M11 18.5h6" />
    </Base>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 1.8" />
    </Base>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <path d="M12 6v12M6 12h12" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <path d="m15 5-7 7 7 7" />
    </Base>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Base strokeWidth={1.8} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Base>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </Base>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Base strokeWidth={1.8} {...props}>
      <path d="M4 11.5 12 4.5l8 7" />
      <path d="M6 10.5V20h4v-5h4v5h4v-9.5" />
    </Base>
  );
}
