// Shared inline-SVG icon set (Lucide-style paths). One module instead of the
// per-file copies that used to live in GlassDock / HomeClient / adminNav.
// Nav icons take `filled` so the dock can render the M3 active (solid) state.

type IconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

type FillableIconProps = IconProps & { filled?: boolean };

function Svg({
  size = 24,
  strokeWidth = 1.9,
  className,
  children,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

// ── Nav icons (stroke + filled) ─────────────────────────────────────────────

export function IconHome({ filled, ...p }: FillableIconProps) {
  return filled ? (
    <Svg filled {...p}>
      <path d="M11.39 2.49a1 1 0 011.22 0l8.5 6.54a1 1 0 01.39.79V20a2 2 0 01-2 2h-4.25a.75.75 0 01-.75-.75V15.5a.5.5 0 00-.5-.5h-4a.5.5 0 00-.5.5v5.75a.75.75 0 01-.75.75H4.5a2 2 0 01-2-2V9.82a1 1 0 01.39-.79l8.5-6.54z" />
    </Svg>
  ) : (
    <Svg {...p}>
      <path d="M3 10.5L12 3l9 7.5M5.5 9.5V20a1 1 0 001 1h11a1 1 0 001-1V9.5" />
    </Svg>
  );
}

export function IconTicket({ filled, ...p }: FillableIconProps) {
  return filled ? (
    <Svg filled {...p}>
      <path
        fillRule="evenodd"
        d="M3 7.5A1.5 1.5 0 014.5 6h15A1.5 1.5 0 0121 7.5v2.1a.6.6 0 01-.45.57 1.87 1.87 0 000 3.66.6.6 0 01.45.57v2.1a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 16.5v-2.1a.6.6 0 01.45-.57 1.87 1.87 0 000-3.66A.6.6 0 013 9.6V7.5zm11.75.75a.75.75 0 011.5 0v1a.75.75 0 01-1.5 0v-1zm.75 3.25a.75.75 0 00-.75.75v1a.75.75 0 001.5 0v-1a.75.75 0 00-.75-.75zm-.75 4.75a.75.75 0 011.5 0v.5a.75.75 0 01-1.5 0v-.5z"
      />
    </Svg>
  ) : (
    <Svg {...p}>
      <path d="M3.75 7.5a.75.75 0 01.75-.75h15a.75.75 0 01.75.75v2.13a2.63 2.63 0 000 4.74v2.13a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75v-2.13a2.63 2.63 0 000-4.74V7.5z" />
      <path d="M15.5 8v1M15.5 11.5v1M15.5 15v1" />
    </Svg>
  );
}

export function IconTrophy({ filled, ...p }: FillableIconProps) {
  return filled ? (
    <Svg filled {...p}>
      <path d="M7 3.25A.75.75 0 017.75 2.5h8.5a.75.75 0 01.75.75V4h2.5a.75.75 0 01.75.75V7a4 4 0 01-3.62 3.98A5.5 5.5 0 0113 14.7v2.55h2.25a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-6.5a.75.75 0 01-.75-.75V18a.75.75 0 01.75-.75H11V14.7a5.5 5.5 0 01-3.63-3.72A4 4 0 013.75 7V4.75A.75.75 0 014.5 4H7v-.75zM5.25 5.5V7c0 1.2.84 2.2 1.96 2.44A5.53 5.53 0 017 8.5v-3H5.25zm13.5 0H17v3c0 .32-.03.64-.08.94A2.5 2.5 0 0018.75 7V5.5z" />
    </Svg>
  ) : (
    <Svg {...p}>
      <path d="M8 21h8M12 17.5V21M7.5 3.5h9v5a4.5 4.5 0 01-9 0v-5z" />
      <path d="M7.5 5H4.5v1.5a3 3 0 003 3M16.5 5h3v1.5a3 3 0 01-3 3" />
    </Svg>
  );
}

export function IconUser({ filled, ...p }: FillableIconProps) {
  return filled ? (
    <Svg filled {...p}>
      <path d="M12 11.5a4.25 4.25 0 100-8.5 4.25 4.25 0 000 8.5zM4.25 19.6a5.6 5.6 0 015.6-5.6h4.3a5.6 5.6 0 015.6 5.6c0 .77-.63 1.4-1.4 1.4H5.65c-.77 0-1.4-.63-1.4-1.4z" />
    </Svg>
  ) : (
    <Svg {...p}>
      <path d="M19 20v-1a5 5 0 00-5-5h-4a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z" />
    </Svg>
  );
}

// ── Utility icons (stroke only) ─────────────────────────────────────────────

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3v3M17 3v3M4 8.5h16M5 5.5h14a1 1 0 011 1V20a1 1 0 01-1 1H5a1 1 0 01-1-1V6.5a1 1 0 011-1z" />
    </Svg>
  );
}

export function IconPin(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s7-5.1 7-11a7 7 0 10-14 0c0 5.9 7 11 7 11z" />
      <path d="M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </Svg>
  );
}

export function IconDoc(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z" />
      <path d="M14 3v4h4M9.5 12h5M9.5 16h5" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM20 19v-1.5a3.5 3.5 0 00-2.6-3.4M15.5 4.6a3 3 0 010 5.8" />
    </Svg>
  );
}

export function IconBroadcast(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      <path d="M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.7 18.3a9 9 0 010-12.6M18.3 5.7a9 9 0 010 12.6" />
    </Svg>
  );
}

export function IconDot({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

export function IconFlag(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 21V4" />
      <path d="M6 4.5h11.5l-2.4 3.75L17.5 12H6" />
    </Svg>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function IconChevronLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconList(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
