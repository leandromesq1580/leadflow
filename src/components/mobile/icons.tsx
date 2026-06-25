import type { ReactNode } from 'react'

// Ícones de linha (premium), sem dependência externa. stroke = currentColor.
const ICONS: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V20h14V9.8" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" /></>,
  columns: <><rect x="3" y="4" width="5" height="16" rx="1.2" /><rect x="10" y="4" width="5" height="11" rx="1.2" /><rect x="17" y="4" width="4" height="14" rx="1.2" /></>,
  message: <><path d="M4 5h16v11H8l-4 3z" /></>,
  dots: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  flame: <><path d="M12 3c1 3-1.5 4-1.5 6.5A1.5 1.5 0 0 0 12 11a3 3 0 0 0 1.2-3.5C15 9 16 11 16 13a4 4 0 1 1-8 0c0-2.2 1.5-3.5 2-5 .3-.9.4-2.3 2-5z" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 9.5h3.2a1.6 1.6 0 0 1 0 3.2H10m0 0h3a1.6 1.6 0 0 1 0 3.2H9.5" /></>,
  trend: <><path d="M4 16l5-5 3 3 7-7" /><path d="M16 7h4v4" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  phone: <><path d="M5 4h3l2 5-2 1.5a11 11 0 0 0 5 5L19 13l2 5v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></>,
  whatsapp: <><path d="M4 20l1.4-4A8 8 0 1 1 9 19l-5 1z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.5-2-1-.8 1c-1-.4-2-1.4-2.4-2.4l1-.8-1-2L9 9.5z" /></>,
  sparkle: <><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7z" /></>,
  robot: <><rect x="5" y="8" width="14" height="11" rx="2.5" /><path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 19v2M15 19v2" /></>,
  template: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></>,
  bolt: <><path d="M13 3 5 13h5l-1 8 8-11h-5z" /></>,
  refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" /><path d="M4 20v-4h4" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  notes: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 6a3 3 0 0 1 0 6M21 20c0-2.5-1.3-4-3.5-4.6" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11M12 9c-1-3-5-3-5 0 0 1 1 0 5 0zm0 0c1-3 5-3 5 0 0 1-1 0-5 0z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M4.2 7l2.1 1.2M17.7 15.8 19.8 17M4.2 17l2.1-1.2M17.7 8.2 19.8 7" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-5" /></>,
  logout: <><path d="M9 5H5v14h4" /><path d="M14 12H9M17 9l3 3-3 3" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  userPlus: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5 1.2 0 2.3.2 3.2.7" /><path d="M17 14v6M14 17h6" /></>,
}

export function MIcon({
  name, size = 22, stroke = 1.9, style,
}: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      {ICONS[name] || ICONS.dots}
    </svg>
  )
}
