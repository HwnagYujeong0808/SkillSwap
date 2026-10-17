export const SKILLS = [
  'Gardening', 'Cooking', 'Knitting', 'Baking', 'History', 'Woodwork', 'Chess', 'Piano', 'Smartphone basics',
  'Video calling', 'Social media', 'AI tools', 'Online banking', 'Photography', 'Spanish', 'Budgeting', 'CV writing',
  'DIY repairs', 'Painting', 'Guitar',
]
export const INTERESTS = ['Music', 'Nature', 'Books', 'Food', 'Travel', 'Tech', 'Crafts', 'Sport', 'Films', 'Faith']
export const TIMES = ['Weekday mornings', 'Weekday afternoons', 'Evenings', 'Weekends']
export const MEET = ['in-person', 'online', 'Either is fine']
// The AI service's service area (New York Capital Region); its travel and venue rules know these towns.
export const AREAS = ['Albany', 'Troy', 'Schenectady', 'Saratoga Springs', 'Rural Rensselaer']
export const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Cantonese', 'Hindi', 'Bengali', 'Arabic', 'Russian', 'Italian', 'Polish', 'Korean', 'Haitian Creole']
export const PRIORITIES = { learn: '📚 Learn something', social: '💛 Be social', happy: '🌞 Be happy' }

export const PEOPLE = [
  { name: 'Margaret', emoji: '🧶', age: 72, area: 'Troy', teach: ['Knitting', 'Baking'], learn: ['Video calling', 'Smartphone basics'], interests: ['Crafts', 'Food', 'Books'], times: ['Weekday mornings', 'Weekday afternoons'] },
  { name: 'Arthur', emoji: '🪵', age: 68, area: 'Albany', teach: ['Woodwork', 'DIY repairs', 'History'], learn: ['AI tools', 'Online banking'], interests: ['Crafts', 'Sport'], times: ['Weekday mornings', 'Weekends'] },
  { name: 'Priya', emoji: '🌶️', age: 64, area: 'Schenectady', teach: ['Cooking', 'Gardening'], learn: ['Social media', 'Photography'], interests: ['Food', 'Nature', 'Travel'], times: ['Evenings', 'Weekends'] },
  { name: 'George', emoji: '🎹', age: 75, area: 'Saratoga Springs', teach: ['Piano', 'Chess', 'History'], learn: ['Smartphone basics', 'Spanish'], interests: ['Music', 'Books', 'Films'], times: ['Weekday afternoons'] },
  { name: 'Leo', emoji: '🎧', age: 22, area: 'Troy', teach: ['Video calling', 'Social media', 'Smartphone basics'], learn: ['Knitting', 'Cooking'], interests: ['Music', 'Crafts', 'Films'], times: ['Evenings', 'Weekends'] },
  { name: 'Amira', emoji: '💻', age: 25, area: 'Albany', teach: ['AI tools', 'CV writing', 'Online banking'], learn: ['Woodwork', 'DIY repairs'], interests: ['Tech', 'Crafts'], times: ['Weekday afternoons', 'Weekends'] },
  { name: 'Sam', emoji: '📸', age: 19, area: 'Schenectady', teach: ['Social media', 'Photography', 'Spanish'], learn: ['Cooking', 'Budgeting'], interests: ['Food', 'Travel', 'Sport'], times: ['Evenings'] },
]

export const POSTS = [
  { id: 1, who: 'Margaret & Leo', emoji: '🧶', meta: 'Knitting ↔ Video calling · 2 days ago', likes: 24, text: 'Leo finally finished his first scarf — and I video-called my granddaughter in Toronto all by myself! 💛' },
  { id: 2, who: 'Arthur & Amira', emoji: '🪵', meta: 'Woodwork ↔ AI tools · 4 days ago', likes: 31, text: 'Built a bookshelf together on Saturday. Amira showed me how to ask an AI for the measurements. Who knew!' },
  { id: 3, who: 'Priya & Sam', emoji: '🌶️', meta: 'Cooking ↔ Social media · 1 week ago', likes: 18, text: "Sam cooked dal for the first time. Priya's chilli page now has 40 followers 🌱" },
]

// Sample stories for the demo. Replace with real, consented member stories (and photos/videos) before launch.
export const STORIES = [
  { id: 's1', name: 'Margaret', emoji: '🧶', role: 'Member', since: 'March 2026', rating: 5, quote: "I video-called my granddaughter in Toronto all by myself. Leo was so patient — and now he's knitting his own scarf!" },
  { id: 's2', name: 'Helen', emoji: '🪵', role: 'Family member', since: 'May 2026', rating: 5, quote: 'Dad used to dread his phone. Since meeting Amira he asks an AI for his woodwork measurements and texts me photos of every shelf.' },
  { id: 's3', name: 'Leo', emoji: '🎧', role: 'Buddy', since: 'March 2026', rating: 5, quote: "I came to learn knitting and left with a friend. Margaret's stories about Troy in the sixties beat any podcast." },
  { id: 's4', name: 'Priya', emoji: '🌶️', role: 'Member', since: 'June 2026', rating: 5, quote: 'Sam cooked dal for the first time, and my chilli page now has 40 followers. We laugh every single week.' },
]

const overlap =(a, b) => a.filter(x => b.includes(x))

// Members (over 60) are only matched with Buddies (18–30), and the other way round.
// Skills that complement each other count most; the "What matters most" picks double their weight.
export function rank(me, people) {
  const skillW = me.priorities.includes('learn') ? 2 : 1
  const socialW = me.priorities.includes('social') ? 2 : 1
  return people
    .filter(p => (p.age >= 60) !== (me.age >= 60))
    .map(p => {
      const theyTeach = overlap(p.teach, me.learn)
      const theyLearn = overlap(p.learn, me.teach)
      const shared = overlap(p.interests, me.interests)
      const score = skillW * 3 * (theyTeach.length + theyLearn.length)
        + socialW * shared.length
        + overlap(p.times, me.times).length
        + (p.area === me.area ? 2 : 0)
      return { ...p, score, theyTeach, theyLearn, shared }
    })
    .sort((a, b) => b.score - a.score)
}

export const plain = s => s.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim()

const STOP = new Set(['be', 'is', 'in', 'something', 'weekday', 'basics', 'fine'])

// Which options does a spoken answer mention? Each option's key words match singular or plural.
// ponytail: word matching only, misses synonyms ("phone" ≠ smartphone); add an alias list if users stumble.
export function heard(said, options, label = x => x) {
  const text = plain(said).toLowerCase().replace(/['-]/g, ' ')
  return options.filter(o => plain(label(o)).toLowerCase().split(/[\s-]+/)
    .filter(w => w && !STOP.has(w))
    .some(w => new RegExp(`\\b${w.replace(/s$/, '')}s?\\b`).test(text)))
}

// ponytail: keyword screen only; swap for a real moderation model + human review queue before launch.
const SCAM = /\b(bank (details|account|card)|account number|sort code|card number|cvv|passwords?|passcode|pin (number|code)|your pin|gift ?cards?|send (me )?money|transfer money|bitcoin|crypto)\b|(\d[ -]?){13,19}/i
const UNKIND = /\b(stupid|idiot|dumb|shut up|hate you|loser)\b/i

export function check(text) {
  if (SCAM.test(text)) return 'For your safety, never share bank details or passwords, or ask for money.'
  if (UNKIND.test(text)) return "Let's keep things kind — could you reword that?"
  return null
}
