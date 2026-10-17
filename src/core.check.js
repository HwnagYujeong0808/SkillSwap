import assert from 'node:assert/strict'
import { check, heard, rank, MEET, PEOPLE, PRIORITIES, SKILLS, TIMES } from './core.js'

assert.deepEqual(heard('I could teach gardening and a bit of chess', SKILLS), ['Gardening', 'Chess'])
assert.deepEqual(heard('A.I. and smartphones please', SKILLS), ['Smartphone basics', 'AI tools'])
assert.deepEqual(heard('weekday mornings', TIMES), ['Weekday mornings'])
assert.deepEqual(heard('I want to learn and be happy', Object.keys(PRIORITIES), k => PRIORITIES[k]), ['learn', 'happy'])
assert.deepEqual(heard('online is fine', MEET), ['online'])
assert.deepEqual(heard('in person please', MEET), ['in-person'])

assert.equal(check('Lovely to meet you! Shall we do Tuesday?'), null)
assert.equal(check('I would love to learn online banking'), null)
assert.ok(check('Can you send me your bank details?'))
assert.ok(check('What is your password'))
assert.ok(check('my card is 4111 1111 1111 1111'))
assert.ok(check("don't be stupid"))

const me = { age: 22, area: 'Camden', teach: ['Video calling'], learn: ['Knitting'], interests: ['Crafts'], times: [], priorities: ['learn'] }
assert.equal(rank(me, PEOPLE)[0].name, 'Margaret')

console.log('core checks passed')
