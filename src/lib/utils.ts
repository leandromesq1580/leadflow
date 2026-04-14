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

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function timeAgo(date: string | Date): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min atras`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atras`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `${days} dias atras`

  return formatDate(date)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
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
  }
  return labels[status] || status
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
