import { type ClassValue, clsx } from 'clsx'

// Simple cn utility without tailwind-merge for now
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

// Locale das funcoes compartilhadas de UI (web passa; /m fica no default 'pt' ate a Onda 3)
export type UiLocale = 'pt' | 'en' | 'es'

export function formatDate(date: string | Date, locale: UiLocale = 'pt'): string {
  const tag = locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR'
  return new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function timeAgo(date: string | Date, locale: UiLocale = 'pt'): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === 'en' ? 'just now' : locale === 'es' ? 'ahora' : 'agora'
  if (minutes < 60) return locale === 'en' ? `${minutes} min ago` : locale === 'es' ? `hace ${minutes} min` : `${minutes} min atras`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'en' ? `${hours}h ago` : locale === 'es' ? `hace ${hours}h` : `${hours}h atras`

  const days = Math.floor(hours / 24)
  if (days === 1) return locale === 'en' ? 'yesterday' : locale === 'es' ? 'ayer' : 'ontem'
  if (days < 7) return locale === 'en' ? `${days} days ago` : locale === 'es' ? `hace ${days} días` : `${days} dias atras`

  return formatDate(date, locale)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function statusLabel(status: string, locale: UiLocale = 'pt'): string {
  const labels: Record<UiLocale, Record<string, string>> = {
    pt: {
      new: 'Novo',
      assigned: 'Entregue',
      qualified: 'Qualificado',
      appointment_set: 'Agendado',
      contacted: 'Contatado',
      no_answer: 'Sem resposta',
      callback: 'Retornar',
      meeting_set: 'Reuniao marcada',
      converted: 'Convertido',
      lost: 'Perdido',
      scheduled: 'Agendado',
      confirmed: 'Confirmado',
      completed: 'Realizado',
      no_show: 'Nao compareceu',
      cancelled: 'Cancelado',
      pending: 'Pendente',
      active: 'Ativo',
    },
    en: {
      new: 'New',
      assigned: 'Delivered',
      qualified: 'Qualified',
      appointment_set: 'Appointment set',
      contacted: 'Contacted',
      no_answer: 'No answer',
      callback: 'Call back',
      meeting_set: 'Meeting set',
      converted: 'Converted',
      lost: 'Lost',
      scheduled: 'Scheduled',
      confirmed: 'Confirmed',
      completed: 'Completed',
      no_show: 'No-show',
      cancelled: 'Canceled',
      pending: 'Pending',
      active: 'Active',
    },
    es: {
      new: 'Nuevo',
      assigned: 'Entregado',
      qualified: 'Calificado',
      appointment_set: 'Cita agendada',
      contacted: 'Contactado',
      no_answer: 'Sin respuesta',
      callback: 'Devolver llamada',
      meeting_set: 'Reunión agendada',
      converted: 'Convertido',
      lost: 'Perdido',
      scheduled: 'Programado',
      confirmed: 'Confirmado',
      completed: 'Realizado',
      no_show: 'No se presentó',
      cancelled: 'Cancelado',
      pending: 'Pendiente',
      active: 'Activo',
    },
  }
  return labels[locale]?.[status] || labels.pt[status] || status
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    new: 'bg-green-100 text-green-700',
    assigned: 'bg-blue-100 text-blue-700',
    qualified: 'bg-purple-100 text-purple-700',
    appointment_set: 'bg-orange-100 text-orange-700',
    contacted: 'bg-yellow-100 text-yellow-700',
    converted: 'bg-green-100 text-green-700',
    lost: 'bg-gray-100 text-gray-500',
    scheduled: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
    no_show: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    hot: 'bg-red-100 text-red-700',
    cold: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
  }
  return colors[status] || 'bg-gray-100 text-gray-500'
}
