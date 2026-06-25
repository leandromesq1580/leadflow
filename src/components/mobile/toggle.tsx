'use client'

export function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div onClick={() => !disabled && onClick()} className="m-tap" style={{ width: 44, height: 26, borderRadius: 999, background: on ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.12)', position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, opacity: disabled ? 0.4 : 1 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </div>
  )
}
