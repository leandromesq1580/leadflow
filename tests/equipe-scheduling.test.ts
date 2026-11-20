import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableSlots, validateBooking, slotLabel } from '../src/lib/equipe-booking'
const now = new Date('2026-10-30T10:00:00Z')
const input = { nome: 'Jane Agent', email: 'jane@example.test', telefone: '+1 (202) 555-0123', idioma: 'en', fuso: 'America/New_York', slot: '2026-11-02T12:00:00.000Z', requestId: 'a97687f0-d792-4b27-bd06-1ee41ccf44b9', website: '' }
test('real UTC slots display visitor DST and calendar date correctly', () => {
 assert.match(slotLabel('2026-10-30T12:00:00Z', 'en', 'America/New_York'), /8:00 AM/)
 assert.match(slotLabel(input.slot, 'en', 'America/New_York'), /7:00 AM/)
 assert.match(slotLabel(input.slot, 'en', 'Asia/Tokyo'), /9:00 PM/)
})
test('server grid enforces business days, lead time, horizon, and overlapping appointments', () => {
 const slots = availableSlots(now, ['2026-11-02T12:15:00Z'])
 assert.ok(!slots.includes('2026-11-02T12:00:00.000Z'))
 assert.ok(!slots.includes('2026-11-02T12:30:00.000Z'))
 assert.ok(slots.includes('2026-11-02T13:00:00.000Z'))
 assert.ok(!slots.some(s => s.startsWith('2026-10-31')))
 assert.ok(!slots.includes('2026-10-30T12:00:00.000Z'))
})
test('strict payload validation, no WhatsApp required, all locales', () => {
 for (const idioma of ['en','pt','es']) assert.equal(validateBooking({...input, idioma}, now).telefone, '+12025550123')
 for (const bad of [{slot:'2026-02-30T12:00:00Z'}, {slot:'2026-11-02T12:01:00Z'}, {slot:'2027-11-02T12:00:00Z'}, {slot:'2026-10-31T12:00:00Z'}, {nome:'x'}, {email:'no'}, {telefone:'123'}, {fuso:'invalid'}, {website:'spam'}, {idioma:'fr'}, {requestId:'oops'}]) assert.throws(() => validateBooking({...input,...bad}, now))
})
