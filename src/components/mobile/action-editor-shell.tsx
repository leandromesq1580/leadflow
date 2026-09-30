import type { CSSProperties, ReactNode } from 'react'

// Reuse the existing editors without the dashboard layout or its purchase surfaces.
// Their desktop tokens are scoped here to the mobile palette, including dialogs.
export function MobileActionEditorShell({ children }: { children: ReactNode }) {
  return <div data-theme="dark" className="m-pad py-4" style={{
    '--bg': 'var(--m-bg)', '--bg-card': '#15151f', '--border': 'var(--m-border)',
    '--fg': 'var(--m-text)', '--fg-secondary': 'var(--m-muted)', '--fg-muted': 'var(--m-faint)',
  } as CSSProperties}>{children}</div>
}
