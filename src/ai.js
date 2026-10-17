// Client for the Python AI service in ai_service/ (matching + message safety).
// Every call falls back to the built-in rules in core.js when the service isn't configured or doesn't
// answer, so the static GitHub Pages site keeps working on its own.
import { PEOPLE, TIMES, check, rank } from './core.js'

const env = import.meta.env ?? {}
// Dev uses a local service by default; a production build only calls one when VITE_AI_URL is set.
export const AI_URL = env.VITE_AI_URL ?? (env.DEV ? 'http://localhost:8000' : '')

// One id per browser tab; the service keeps profiles in memory, keyed by this.
const MY_ID = 'web_' + Math.random().toString(36).slice(2, 10)

async function call(path, body, { method = 'POST', timeout = 8000 } = {}) {
  if (!AI_URL) throw new Error('no AI service configured')
  const res = await fetch(AI_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`AI service answered ${res.status}`)
  return res.json()
}

/* ---------- sign-up answers -> the service's profile record ---------- */

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const SLOTS = {
  'Weekday mornings': WEEKDAYS.map(d => `${d}_am`),
  'Weekday afternoons': WEEKDAYS.map(d => `${d}_pm`),
  Evenings: [...WEEKDAYS, 'sat', 'sun'].map(d => `${d}_eve`),
  Weekends: ['sat', 'sun'].flatMap(d => [`${d}_am`, `${d}_pm`]),
}
const LANG_CODES = {
  english: 'en', spanish: 'es', mandarin: 'zh', cantonese: 'zh', chinese: 'zh', hindi: 'hi', bengali: 'bn',
  arabic: 'ar', russian: 'ru', italian: 'it', polish: 'pl', korean: 'ko', 'haitian creole': 'ht',
}

export function toAiProfile(id, p) {
  const lang = p.language.trim().toLowerCase()
  return {
    person_id: id,
    role: p.age >= 60 ? 'older_adult' : 'student',
    first_name: p.name,
    area: p.area,
    teach_text: p.teach.join(', '),
    learn_text: p.learn.join(', '),
    interests_text: p.interests.join(', '),
    // Picking no times means "flexible", not "never free" (which the service would filter out).
    availability: [...new Set((p.times.length ? p.times : TIMES).flatMap(t => SLOTS[t]))],
    // The site is in English, so everyone reads some English; the preferred language adds a second option.
    languages: [...new Set(['en', LANG_CODES[lang] ?? lang])],
    is_synthetic: false,
  }
}

// Selected priorities count fully, the rest not at all; the service splits evenly if none are selected.
export const toWeights = priorities =>
  Object.fromEntries(['learn', 'social', 'happy'].map(k => [k, priorities.includes(k) ? 1 : 0]))

/* ---------- the service's recommendations -> the match cards the pages use ---------- */

const items = text => text.split(/[;,]/).map(s => s.trim()).filter(Boolean)

export function fromAiMatch(r, myRole) {
  const f = r.facts
  const older = myRole === 'student' // the candidate is from the other generation
  return {
    id: r.candidate_id,
    name: r.candidate_first_name,
    emoji: older ? '🧓' : '🎓',
    role: older ? 'Member' : 'Buddy',
    teach: items(older ? f.older_teaches : f.student_teaches),
    learn: items(older ? f.older_wants : f.student_wants),
    explanation: r.explanation,
    tags: [
      ...f.shared_interests.map(s => `Both enjoy ${s.split(' / ')[0]}`),
      ...f.shared_availability.slice(0, 2).map(s => `Both free ${s}`),
    ],
  }
}

export const localMatches = profile => rank(profile, PEOPLE).slice(0, 4).map(m => ({
  ...m,
  id: m.name,
  role: m.age >= 60 ? 'Member' : 'Buddy',
  explanation: null,
  tags: [
    ...m.theyTeach.map(s => `Can teach you ${s}`),
    ...m.theyLearn.map(s => `Wants to learn your ${s}`),
    ...m.shared.map(s => `Both into ${s}`),
  ],
}))

// Returns { source: 'ai' | 'local', matches }. Always has matches, so Messages and Sessions have people.
export async function findMatches(profile) {
  try {
    await call(`/profiles/${MY_ID}`, toAiProfile(MY_ID, profile), { method: 'PUT' })
    // Generous timeout: the explanation model can take a few seconds per match on a CPU.
    const res = await call('/recommendations',
      { person_id: MY_ID, weights: toWeights(profile.priorities), top_k: 4 }, { timeout: 90000 })
    if (res.recommendations.length) {
      const myRole = profile.age >= 60 ? 'older_adult' : 'student'
      return { source: 'ai', matches: res.recommendations.map(r => fromAiMatch(r, myRole)) }
    }
  } catch (e) {
    console.warn('AI matching unavailable, using built-in matching:', e.message)
  }
  return { source: 'local', matches: localMatches(profile) }
}

/* ---------- message safety ---------- */

// What the person sees. The service's own notes are written for coordinators.
const HELD = {
  money_request: 'Asking for or offering money isn’t allowed on SkillSwap.',
  financial_info: 'Never share bank details or card numbers — not even with a friend here.',
  credentials: 'Never share passwords or codes. SkillSwap will never ask for them.',
  personal_info: 'Please keep phone numbers, emails and addresses out of chat for now.',
  off_platform: 'Please keep chatting on SkillSwap for now — it keeps you both safe.',
  pressure_secrecy: 'Please keep things open — no secrets, and no meeting at home.',
  harassment: 'Let’s keep things kind — could you reword that?',
  sexual_content: 'That isn’t appropriate on SkillSwap.',
}

// Returns null when the text is fine, otherwise the message to show.
export async function screen(text) {
  try {
    const r = await call('/safety/screen', { text, level: 1 })
    if (r.action === 'allow') return null
    if (r.action === 'urgent_escalation') {
      return 'It sounds like things are hard right now. A coordinator will reach out to you. ' +
        'If you are in danger, call or text 988, or call 911.'
    }
    return `${HELD[r.flags[0]?.category] ?? 'This was held for a quick safety check.'} It wasn’t sent.`
  } catch {
    return check(text)
  }
}
