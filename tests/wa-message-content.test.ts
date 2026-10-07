import test from 'node:test'
import assert from 'node:assert/strict'
import * as content from '../src/lib/wa-message-content'

test('stored content requires nonblank text or media metadata, including undownloaded audio', () => {
  for (const row of [{}, { body: ' \n\t', media_type: ' ', media_url: '' }, { body: 1, media_type: false, media_url: {} }]) {
    assert.equal(content.hasWhatsAppContent(row), false)
  }
  for (const row of [{ body: ' Olá ' }, { body: '👍' }, { media_type: ' audio ' }, { media_url: ' https://example.invalid/audio ' }]) {
    assert.equal(content.hasWhatsAppContent(row), true)
  }
})

test('customer reply is inbound meaningful content but never an own-send true_ ID', () => {
  for (const row of [{ direction: 'in', body: 'Oi' }, { direction: 'in', media_type: 'audio', wa_message_id: 'false_synthetic' }]) {
    assert.equal(content.isCustomerReply(row), true)
  }
  for (const row of [{ direction: 'out', body: 'Oi' }, { body: 'Oi' }, { direction: 'in', body: '  ' },
    { direction: 'in', body: 'Oi', wa_message_id: 'true_synthetic' }]) {
    assert.equal(content.isCustomerReply(row), false)
  }
})

test('technical transport types are excluded even with body or media flags', () => {
  for (const type of ['e2e_notification', 'ciphertext', 'notification_template', 'gp2', 'protocol', 'revoked', 'call_log', 'notification', 'broadcast_notification']) {
    assert.equal(content.shouldIgnoreWhatsAppEvent({ type, body: 'technical metadata', has_media: true }), true, type)
  }
})

test('empty events are excluded without coercing unknown payload fields', () => {
  for (const payload of [{}, { type: 'chat', body: ' \n ' }, { type: 'unknown' },
    { body: {}, media_url: 4, media_type: false, has_media: 'false' }]) {
    assert.equal(content.shouldIgnoreWhatsAppEvent(payload), true)
  }
})

test('legitimate and legacy text, emoji and media survive without a downloaded URL', () => {
  for (const payload of [{ body: 'Olá' }, { type: 'chat', body: '👍' }, { media_url: 'https://example.invalid/a' },
    { media_type: 'audio' }, { has_media: true }, ...['audio', 'ptt', 'image', 'video', 'document', 'sticker', 'location', 'vcard', 'multi_vcard'].map(type => ({ type }))]) {
    assert.equal(content.shouldIgnoreWhatsAppEvent(payload), false, JSON.stringify(payload))
  }
})

test('own echo with inbound/default direction is ignored rather than mislabelled as a reply', () => {
  for (const direction of [undefined, 'in']) {
    assert.equal(content.shouldIgnoreWhatsAppEvent({ direction, wa_message_id: 'true_synthetic', body: 'my send' }), true)
  }
  assert.equal(content.shouldIgnoreWhatsAppEvent({ direction: 'out', wa_message_id: 'true_synthetic', body: 'my send' }), false)
  assert.equal(content.shouldIgnoreWhatsAppEvent({ direction: 'in', wa_message_id: 'false_synthetic', body: 'reply' }), false)
})
