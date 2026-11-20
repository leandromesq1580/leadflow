import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableSlots, validateBooking } from '../src/lib/equipe-booking'
const now = new Date('2026-11-19T12:00:00Z')
const body = {nome:'Test Agent',email:'test@example.test',telefone:'2025550123',idioma:'pt',fuso:'America/New_York',slot:availableSlots(now)[0],requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9',website:''}
test('international numbers respect selection or explicit plus, without guessing from language', () => {
 for (const [telefone,country,expected] of [['+44 20 7946 0018','US','+442079460018'],['(11) 91234-5678','BR','+5511912345678'],['+55 (11) 91234-5678','US','+5511912345678']]) assert.equal(validateBooking({...body,telefone,country},now).telefone,expected)
 for (const telefone of ['1111111111','202555','202555012345','call 2025550123','11912345678','+999123456789']) assert.throws(()=>validateBooking({...body,telefone},now))
})
test('invalid fields have specific errors, with security checks unchanged', () => {
 for (const [field,value] of [['nome',' '],['email','bad'],['telefone','123'],['slot','2026-11-19T00:00:00.000Z']]) assert.throws(()=>validateBooking({...body,[field]:value},now),(error: any)=>error.field===field)
 for (const bad of [{requestId:'bad'},{website:'robot'},{fuso:'not/a/zone'},{idioma:'zz'}]) assert.throws(()=>validateBooking({...body,...bad},now))
})
test('national US telephone works independently of language without a typed plus', () => {
 for (const telefone of ['2025550123','(202) 555-0123','1 202 555 0123','+1 (202) 555-0123']) {
  assert.equal(validateBooking({...body,telefone},now).telefone,'+12025550123')
 }
})
