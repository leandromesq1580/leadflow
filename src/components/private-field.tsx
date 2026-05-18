'use client'

import { usePrivacy } from '@/lib/privacy-mode'

/**
 * Componentes wrapper pra exibir phone/email mascarado quando o modo
 * "Apresentação" estiver ON. Usar dentro de Server Components que precisam
 * mostrar dados sensíveis sem virar client component inteiro.
 */
export function PrivatePhone({ value, className, style }: { value: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  const privacy = usePrivacy()
  return <span className={className} style={style}>{privacy.mask(value, 'phone')}</span>
}

export function PrivateEmail({ value, className, style }: { value: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  const privacy = usePrivacy()
  return <span className={className} style={style}>{privacy.mask(value, 'email')}</span>
}

export function PrivateText({ value, type = 'auto', className, style }: { value: string | null | undefined; type?: 'phone' | 'email' | 'auto'; className?: string; style?: React.CSSProperties }) {
  const privacy = usePrivacy()
  return <span className={className} style={style}>{privacy.mask(value, type)}</span>
}
