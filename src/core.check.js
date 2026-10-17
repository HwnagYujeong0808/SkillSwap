import assert from 'node:assert/strict'
import { check, heard, rank, MEET, PEOPLE, PRIORITIES, SKILLS, TIMES } from './core.js'
import { fromAiMatch, toAiProfile, toWeights } from './ai.js'

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

const me = { age: 22, area: 'Troy', teach: ['Video calling'], learn: ['Knitting'], interests: ['Crafts'], times: [], priorities: ['learn'] }
assert.equal(rank(me, PEOPLE)[0].name, 'Margaret')
// Two groups, never matched within their own group.
assert.ok(rank(me, PEOPLE).every(p => p.age >= 60), 'a Buddy only sees Members')
assert.ok(rank({ ...me, age: 70 }, PEOPLE).every(p => p.age <= 30), 'a Member only sees Buddies')

// Sign-up answers -> AI service profile, and its recommendation -> our match card.
const ai = toAiProfile('web_x', { name: 'Ann', age: 68, area: 'Troy', teach: ['Baking'], learn: ['Video calling'], interests: [], times: ['Weekends'], language: 'Spanish' })
assert.equal(ai.role, 'older_adult')
assert.deepEqual(ai.availability, ['sat_am', 'sat_pm', 'sun_am', 'sun_pm'])
assert.deepEqual(ai.languages, ['en', 'es'])
assert.equal(toAiProfile('x', { ...me, name: 'Jo', language: 'English' }).availability.length, 5 + 5 + 7 + 4) // no times = flexible
assert.deepEqual(toWeights(['learn', 'happy']), { learn: 1, social: 0, happy: 1 })
const card = fromAiMatch({
  candidate_id: 'st_1', candidate_first_name: 'Priya', explanation: 'x',
  facts: { older_teaches: 'Baking', older_wants: 'Video calls', student_teaches: 'Phones; video calls', student_wants: 'Baking', shared_interests: ['gardening'], shared_availability: ['Saturday mornings'] },
}, 'older_adult')
assert.deepEqual([card.role, card.teach, card.learn], ['Buddy', ['Phones', 'video calls'], ['Baking']])
assert.deepEqual(card.tags, ['Both enjoy gardening', 'Both free Saturday mornings'])

console.log('core checks passed')
