import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen, Users, Smile, Smartphone, Video, CookingPot, Sprout, Hammer, Sparkles, Music, Languages,
  UserPlus, MessageCircle, CalendarCheck, Handshake, Camera, Star, ShieldCheck, Mic, Volume2, Hand, ChevronLeft, ChevronRight, Plus, Heart, Menu, X,
} from 'lucide-react'
import { AREAS, INTERESTS, LANGUAGES, MEET, PEOPLE, POSTS, PRIORITIES, SKILLS, STORIES, TIMES, check, heard, plain } from './core.js'
import { findMatches, screen } from './ai.js'
import './styles.css'

const NAV = ['Join', 'Matches', 'Messages', 'Sessions', 'Community']
const pageFromHash = () => location.hash.slice(1) || 'home'

function App() {
  const [page, setPage] = useState(pageFromHash)
  const [menuOpen, setMenuOpen] = useState(false) // the phone menu behind the ☰ button

  useEffect(() => {
    if (!menuOpen) return
    const onKey = e => e.key === 'Escape' && setMenuOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [menuOpen])
  const [profile, setProfile] = useState(null)
  const [chatWith, setChatWith] = useState('Margaret')
  const [threads, setThreads] = useState({})
  const [sessions, setSessions] = useState([])
  const [posts, setPosts] = useState(POSTS)
  const [stories, setStories] = useState(STORIES) // reviews left on Community also show on the home page

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); setMenuOpen(false); scrollTo(0, 0) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  // Before sign-up, show the demo neighbours from the mockups.
  const [found, setFound] = useState(null) // { source: 'ai' | 'local', matches } once matching finishes
  const latest = useRef(0) // ignore an older matching request that finishes after a newer one

  const saveProfile = p => {
    setProfile(p)
    setFound(null)
    location.hash = 'matches'
    const req = ++latest.current
    findMatches(p).then(r => req === latest.current && setFound(r))
  }

  // Before sign-up (or while matching runs) Messages and Sessions show the demo neighbours.
  const matches = found ? found.matches : PEOPLE.slice(0, 4)

  const say = (name, from, text) => setThreads(t => ({ ...t, [name]: [...(t[name] ?? []), { from, text }] }))
  const send = (person, text) => {
    say(person.name, 'me', text)
    setTimeout(() => say(person.name, 'them', `Lovely to hear from you! I'd be glad to help with ${person.teach[0]} — when suits you?`), 1200)
  }

  const pages = {
    home: <Home stories={stories} />,
    join: <Join profile={profile} onSave={saveProfile} />,
    matches: <Matches profile={profile} found={found} onMessage={name => { setChatWith(name); location.hash = 'messages' }} />,
    messages: <Messages people={matches} chatWith={chatWith} setChatWith={setChatWith} threads={threads} onSend={send} />,
    sessions: <Sessions people={matches} chatWith={chatWith} profile={profile} sessions={sessions} setSessions={setSessions} />,
    community: <Community profile={profile} posts={posts} setPosts={setPosts} stories={stories} setStories={setStories} />,
  }

  return (
    <>
      <header className="nav">
        <div className={'wrap nav-inner' + (menuOpen ? ' open' : '')}>
          <a href="#" className="logo">Skill<span>Swap</span></a>
          {/* On narrow screens Join stays in the bar; the other pages live behind ☰ */}
          <a href="#join" className="nav-join" aria-current={page === 'join' ? 'page' : undefined}>Join</a>
          <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="site-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
          <nav id="site-menu" className="nav-links" aria-label="Main">
            {NAV.map(n => {
              const id = n.toLowerCase()
              return <a key={id} href={'#' + id} className={id === 'join' ? 'join-link' : undefined} aria-current={page === id ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{n}</a>
            })}
          </nav>
        </div>
      </header>
      {pages[page] ?? pages.home}
    </>
  )
}

/* ---------- Home ---------- */

const WHAT_MATTERS = [
  [BookOpen, '1. Learn something', "Teach what you know, learn what you don't — sharing goes both ways."],
  [Users, '2. Be social', 'Meet a real person at your local library, community centre or on a safe video call.'],
  [Smile, '3. Be happy', 'Share your wins with the community and celebrate the little moments together.'],
]
const SWAPS = [
  [Smartphone, 'Phones & tablets'],
  [Video, 'Video calls'],
  [CookingPot, 'Cooking & baking'],
  [Sprout, 'Gardening'],
  [Hammer, 'DIY & woodwork'],
  [Sparkles, 'AI tools'],
  [Music, 'Music & hobbies'],
  [Languages, 'Languages & money'],
]
const STEPS = [
  [UserPlus, '1. Create your profile', 'Skills to teach, skills to learn, interests and availability.'],
  [Sparkles, '2. AI finds your match', 'We pair you with someone whose skills complement yours.'],
  [MessageCircle, '3. Chat safely', 'Moderated messages help keep conversations friendly.'],
  [CalendarCheck, '4. Book a session', 'Meet at a trusted local venue or on a video call.'],
  [Handshake, '5. Share skills', 'Teach a little, learn a little, laugh a lot.'],
  [Camera, '6. Share your story', 'Post photos and moments for the community.'],
  [Star, '7. Rate & discover more', 'Feedback helps us suggest your next great match.'],
]
const tone = i => (i % 2 ? 'amber' : 'green')

// Title only until hovered, focused or tapped, so the page stays light on text.
// The description is always in the page for screen readers, and keeps its space so nothing jumps.
function Feature({ icon: Icon, title, text }) {
  const [open, setOpen] = useState(false)
  return (
    <article className={'feature' + (open ? ' open' : '')} tabIndex={0} onClick={() => setOpen(o => !o)}>
      <span className="feature-more" aria-hidden="true"><Plus size={20} /></span>
      <div className="icon soft"><Icon size={24} strokeWidth={1.75} /></div>
      <h3>{title}</h3>
      <p className="feature-desc">{text}</p>
    </article>
  )
}

// The two groups. Matching only ever pairs a Member with a Buddy.
const GROUPS = [
  { id: 'member', label: 'Member', ages: 'Over 60', emoji: '👵', min: 60, max: 120, gives: ['Life stories', 'Cooking', 'Crafts', 'Trades'] },
  { id: 'buddy', label: 'Buddy', ages: 'Aged 18–30', emoji: '🧑', min: 18, max: 30, gives: ['Phones & apps', 'Video calls', 'Social media', 'Languages'] },
]

function Generations() {
  const [side, setSide] = useState(null) // which group's gifts are highlighted
  const pick = id => setSide(s => (s === id ? null : id))
  const caption = side === 'member' ? 'Members share life skills with Buddies →'
    : side === 'buddy' ? '← Buddies share digital skills with Members'
    : 'Tap a card to see what each group shares.'
  return (
    <section className="section gens">
      <h2>Two groups, matched together</h2>
      <p className="sub">Every Member is paired with a Buddy.</p>
      <div className={'gens-stage' + (side ? ` show-${side}` : '')}>
        <GroupCard g={GROUPS[0]} active={side === 'member'} onPick={pick} />
        <div className="flow" aria-hidden="true">
          <svg viewBox="0 0 200 120">
            <defs>
              <marker id="head-member" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="#2e6146" /></marker>
              <marker id="head-buddy" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="#6b4000" /></marker>
            </defs>
            <path className="arc arc-member" d="M22 50 C 70 0, 130 0, 178 50" markerEnd="url(#head-member)" />
            <path className="arc arc-buddy" d="M178 70 C 130 120, 70 120, 22 70" markerEnd="url(#head-buddy)" />
          </svg>
          <span className="flow-heart"><Heart size={22} fill="currentColor" /></span>
        </div>
        <GroupCard g={GROUPS[1]} active={side === 'buddy'} onPick={pick} />
      </div>
      <p className="gens-caption" aria-live="polite">{caption}</p>
    </section>
  )
}

const GroupCard = ({ g, active, onPick }) => (
  <button type="button" className={`gen-card ${g.id}`} aria-pressed={active} onClick={() => onPick(g.id)}>
    <span className="gen-avatar" aria-hidden="true">{g.emoji}</span>
    <span className="gen-name">{g.label}</span>
    <span className="gen-ages">{g.ages}</span>
    <span className="gen-gives">{g.gives.map(x => <span className="chip-sm" key={x}>{x}</span>)}</span>
  </button>
)

// Fades the "How it works" steps in one after another as they scroll into view.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window)) return els.forEach(el => el.classList.add('in'))
    const io = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach((e, k) => {
        e.target.style.transitionDelay = `${k * 150}ms` // steps that arrive together still appear one by one
        e.target.classList.add('in')
        io.unobserve(e.target)
      })
    }, { threshold: 0.3 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

const HeroGradient = lazy(() => import('./HeroGradient.jsx'))

// The animated gradient only loads when the visitor hasn't asked for less motion and WebGL works;
// otherwise the same colours show as a still CSS gradient.
function HeroBackdrop() {
  const [animate] = useState(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
  })
  return (
    <div className="hero-bg" aria-hidden="true">
      {animate && <Suspense fallback={null}><HeroGradient /></Suspense>}
    </div>
  )
}

const Stars = ({ n }) => (
  <span className="stars-row" role="img" aria-label={`Rated ${n} out of 5`}>
    {[1, 2, 3, 4, 5].map(k => <Star key={k} size={22} className={k <= n ? 'on' : ''} />)}
  </span>
)

function Stories({ stories }) {
  const [i, setI] = useState(0)
  const n = stories.length
  const at = i % n
  const s = stories[at]
  // No auto-advance: moving text is hard to read, so people turn the pages themselves.
  return (
    <section className="section stories-section">
      <span className="badge amber"><Sparkles size={16} /> Why intergenerational connection?</span>
      <h2>Two generations. One brilliant friendship.</h2>
      <p className="sub">When younger and older neighbours connect, both sides win. Here's what our members say:</p>
      <div className="stories">
        <div className="story">
          <p className="eyebrow">Stories from members &amp; buddies</p>
          <div aria-live="polite">
            <blockquote>“{s.quote}”</blockquote>
            <Stars n={s.rating} />
            <p className="story-name">{s.name}</p>
            <p className="meta">{s.role} · With us since {s.since}</p>
          </div>
          <div className="story-nav">
            <button type="button" className="arrow" aria-label="Previous story" onClick={() => setI((at - 1 + n) % n)}><ChevronLeft /></button>
            <div className="dots">
              {stories.map((x, k) => (
                <button type="button" key={x.id} className="dot" aria-label={`Story ${k + 1} of ${n}`} aria-current={k === at || undefined} onClick={() => setI(k)} />
              ))}
            </div>
            <button type="button" className="arrow" aria-label="Next story" onClick={() => setI((at + 1) % n)}><ChevronRight /></button>
          </div>
          <a className="more" href="#community">Read more reviews &amp; leave yours →</a>
        </div>
        {/* ponytail: emoji stands in for a member photo or video; swap in real, consented media when you have it. */}
        <div className="portrait" aria-hidden="true">
          <div className="portrait-card">{s.emoji}</div>
        </div>
      </div>
    </section>
  )
}

const Section = ({ title, sub, children }) => (
  <section className="section">
    <h2>{title}</h2>
    <p className="sub">{sub}</p>
    {children}
  </section>
)

function Home({ stories }) {
  useReveal()
  return (
    <main className="wrap">
      <HeroBackdrop />
      <section className="hero">
        <span className="badge">For over-60s and 18–30s</span>
        <h1>Every generation has something to <em className="teach">teach</em> &amp; <em className="learn">learn</em>.</h1>
        <p className="lead">SkillSwap pairs older and younger neighbours to share everyday skills — and make a real friend along the way.</p>
        <div className="actions">
          <a className="btn btn-amber" href="#join">Join SkillSwap</a>
          <a className="btn btn-ghost" href="#community">See member stories</a>
        </div>
      </section>

      <Generations />

      <Section title="How it works" sub="Seven simple steps from hello to friendship.">
        <ol className="timeline">
          {STEPS.map(([Icon, title, text], i) => (
            <li key={title} className="reveal">
              <span className={`icon ${tone(i)}`}><Icon size={24} /></span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="safety reveal">
          <ShieldCheck size={28} />
          Every message and post is checked for scams and unkind words — with real people reviewing anything flagged.
        </p>
      </Section>

      <Section title="What matters most" sub="Hover over or tap a card to read more.">
        <div className="grid grid-3">
          {WHAT_MATTERS.map(([icon, title, text]) => <Feature key={title} icon={icon} title={title} text={text} />)}
        </div>
      </Section>

      <Section title="What can you share?" sub={<>These are just some ideas. The easiest way to picture it?<br /><b>Anything you'd happily show a friend!</b></>}>
        <div className="share-list">
          {SWAPS.map(([Icon, title]) => (
            <div className="share-item" key={title}>
              <span className="icon sm soft"><Icon size={20} /></span>
              <h3>{title}</h3>
            </div>
          ))}
        </div>
      </Section>

      <Stories stories={stories} />

      <section className="cta">
        <h2>Ready to share?</h2>
        <p>It takes about three minutes to create your profile.</p>
        <a className="btn btn-amber" href="#join">Get started</a>
      </section>
    </main>
  )
}

/* ---------- Shared bits ---------- */

function Page({ eyebrow, title, lead, children }) {
  const h1 = useRef(null)
  // New page or sign-up part: start at the top and move screen-reader focus to the heading.
  useEffect(() => { scrollTo(0, 0); h1.current.focus({ preventScroll: true }) }, [title])
  return (
    <main className="wrap page">
      <p className="eyebrow">{eyebrow}</p>
      <h1 ref={h1} tabIndex={-1}>{title}</h1>
      <p className="lead">{lead}</p>
      {children}
    </main>
  )
}

const Chips = ({ title, hint, options, value, onToggle, label = x => x }) => (
  <fieldset>
    {title && <legend>{title}</legend>}
    {hint && <p className="hint">{hint}</p>}
    <div className="chips">
      {options.map(o => (
        <button type="button" key={o} className="chip" aria-pressed={value.includes(o)} onClick={() => onToggle(o)}>{label(o)}</button>
      ))}
    </div>
  </fieldset>
)

/* ---------- Step 1: Join ---------- */

const BLANK = {
  referrerName: '', referrerOrg: '', referrerPhone: '', reason: '',
  group: 'member', name: '', age: 65, area: 'Albany', phone: '', callTime: '', town: '', language: '', access: '', consent: false,
  contactName: '', contactRelation: '', contactPhone: '',
  priorities: ['learn', 'social', 'happy'], teach: [], learn: [], interests: [], times: [], meet: 'Either is fine',
}
const PHONE = { type: 'tel', pattern: '[0-9 +\\(\\)\\-]{7,20}', title: 'Digits, spaces and + ( ) - only' }

const Field = ({ label, className = '', ...props }) => (
  <label className={`field ${className}`}>{label}<input className="input" {...props} /></label>
)

const QUESTIONS = [
  { key: 'priorities', title: 'What matters most to you?', hint: "We'll weight your matches toward these.", ask: 'What matters most to you? Choose as many as you like.', options: Object.keys(PRIORITIES), label: k => PRIORITIES[k] },
  { key: 'teach', title: 'I can teach…', ask: 'What could you teach someone? Say as many as you like.', options: SKILLS },
  { key: 'learn', title: "I'd like to learn…", ask: 'What would you like to learn?', options: SKILLS },
  { key: 'interests', title: 'My interests', ask: 'What are you interested in?', options: INTERESTS },
  { key: 'times', title: "When I'm free", ask: 'When are you usually free?', options: TIMES },
  { key: 'meet', title: "How I'd like to meet", ask: 'How would you like to meet? Choose one.', options: MEET, single: true },
]

// Some in-app web views expose the speech APIs but throw when they're used; never let that blank the page.
const speak = (text, onEnd, rate = 0.9) => {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.onend = onEnd
    speechSynthesis.speak(u)
  } catch { /* no speech here: the caption still shows the words */ }
}

function Join({ profile, onSave }) {
  const [f, setF] = useState(profile ?? BLANK)
  const [step, setStep] = useState(0) // 0 details · 1 audio or text · 2 questions
  const [mode, setMode] = useState('text')
  const set = (key, value) => setF(f => ({ ...f, [key]: value }))
  const bind = key => ({ value: f[key], onChange: e => set(key, e.target.value) })
  const grp = GROUPS.find(g => g.id === f.group) ?? GROUPS[0]
  // Switching group clears an age that no longer fits, so the age box asks again.
  const pickGroup = id => {
    const g = GROUPS.find(x => x.id === id)
    setF(f => ({ ...f, group: id, age: f.age >= g.min && f.age <= g.max ? f.age : '' }))
  }
  const value = q => (q.single ? [f[q.key]] : f[q.key])
  const pick = (q, v) => setF(f => ({ ...f, [q.key]: q.single ? v : f[q.key].includes(v) ? f[q.key].filter(x => x !== v) : [...f[q.key], v] }))
  const add = (q, found) => setF(f => ({ ...f, [q.key]: q.single ? found[0] : [...new Set([...f[q.key], ...found])] }))
  const ready = f.teach.length > 0 && f.learn.length > 0

  const finish = () => {
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
    onSave({ ...clean, age: Number(f.age) })
  }
  const choose = m => {
    // iOS only allows speech that starts from a tap, so say the first words here.
    if (m === 'audio') speak("Great. I'll read each question out loud.")
    setMode(m)
    setStep(2)
  }

  const [title, lead] = [
    ['Tell us about you', 'Start with a few details so we can reach the person safely.'],
    ['How would you like to answer?', 'Pick whichever feels easiest. Both ask the same questions.'],
    ['A few quick questions', mode === 'audio' ? 'Listen to each question, then say your answer. You can also tap to change it.' : 'Tap everything that fits. You can change this any time.'],
  ][step]

  return (
    <Page eyebrow={`Step 1 · Sign up · Part ${step + 1} of 3`} title={title} lead={lead}>
      {step > 0 && <button className="link" onClick={() => setStep(step - 1)}>← Back</button>}

      {step === 1 && (
        <div className="modes">
          <button className="mode" onClick={() => choose('audio')}>
            <Volume2 size={44} />
            <b>Listen &amp; speak</b>
            <span>We read each question aloud. Answer with your voice.</span>
          </button>
          <button className="mode" onClick={() => choose('text')}>
            <Hand size={44} />
            <b>Read &amp; tap</b>
            <span>See the questions on screen and tap your answers.</span>
          </button>
        </div>
      )}

      {step === 2 && mode === 'text' && (
        <>
          {QUESTIONS.map(q => <Chips key={q.key} title={q.title} hint={q.hint} options={q.options} label={q.label} value={value(q)} onToggle={v => pick(q, v)} />)}
          <button className="btn btn-green submit" disabled={!ready} onClick={finish}>Find my matches →</button>
          {!ready && <p className="hint">Pick at least one skill to teach and one to learn.</p>}
        </>
      )}

      {step === 2 && mode === 'audio' && <VoiceQuestions value={value} pick={pick} add={add} ready={ready} onFinish={finish} />}

      {step === 0 && (
      <form onSubmit={e => { e.preventDefault(); setStep(1) }}>
        <p className="hint">Everything is required unless it says optional.</p>

        <section className="card fields">
          <h2 className="full">About the person</h2>
          <fieldset className="full group-pick">
            <legend>Joining as</legend>
            <div className="group-options">
              {GROUPS.map(g => (
                <label key={g.id} className={`group-option ${g.id}`}>
                  <input type="radio" name="group" checked={f.group === g.id} onChange={() => pickGroup(g.id)} />
                  <span className="group-emoji" aria-hidden="true">{g.emoji}</span>
                  <span><b>{g.label}</b> <span className="meta">· {g.ages}</span></span>
                </label>
              ))}
            </div>
            <p className="hint">Members are always matched with Buddies, and Buddies with Members.</p>
          </fieldset>
          <Field label="First name" {...bind('name')} required />
          <Field label="Age" type="number" min={grp.min} max={grp.max} {...bind('age')} required
            title={`${grp.label}s are ${grp.ages.toLowerCase()}`} />
          <label className="field">Nearest area (for matching)
            <select className="input" value={f.area} onChange={e => set('area', e.target.value)}>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <Field label="Best phone number" {...PHONE} {...bind('phone')} required />
          <Field label="Best time to call" placeholder="e.g. weekday mornings after 10" {...bind('callTime')} required />
          <Field label="Town or ZIP code" {...bind('town')} required />
          <Field label="Preferred language" list="languages" {...bind('language')} required />
          <datalist id="languages">{LANGUAGES.map(l => <option key={l} value={l} />)}</datalist>
          <Field className="span-2" label="Hearing, vision or speech considerations (optional)" placeholder="e.g. hard of hearing — please speak slowly" {...bind('access')} />
          <label className="check full">
            <input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} required />
            {f.name.trim() || 'The person'} has agreed to be contacted. We never call without this.
          </label>
          <p className="hint full">Their phone number is never shown to matches. Town is used to check our service area only.</p>
        </section>

        <section className="card fields">
          <h2 className="full">Trusted contact</h2>
          <Field label="Contact's name" {...bind('contactName')} required />
          <Field label="Relationship" placeholder="e.g. daughter, neighbour" {...bind('contactRelation')} required />
          <Field label="Contact's phone" {...PHONE} {...bind('contactPhone')} required />
          <p className="hint full">Suggested by the person. We only invite them after the person has given consent.</p>
        </section>

        <section className="card fields">
          <h2 className="full">Who's making the referral? <span className="hint">(optional)</span></h2>
          <Field label="Referrer name" autoComplete="name" {...bind('referrerName')} />
          <Field label="Organization" autoComplete="organization" {...bind('referrerOrg')} />
          <Field label="Referrer phone" autoComplete="tel" {...PHONE} {...bind('referrerPhone')} />
          <Field className="full" label="Why referred? (one line)" maxLength={140} {...bind('reason')} />
          <p className="hint full">Only if an organization is referring someone. It becomes the verifying organization. The reason stays with our team and is never read aloud to the person.</p>
        </section>
        {/* Left enabled on purpose: the browser then points at the first missing field instead of a dead button. */}
        <button className="btn btn-green submit">Next →</button>
      </form>
      )}
    </Page>
  )
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition

// One question at a time: read it aloud, then listen. Chips stay tappable to fix anything misheard.
function VoiceQuestions({ value, pick, add, ready, onFinish }) {
  const [i, setI] = useState(0)
  const [round, setRound] = useState(0) // bump to read the question again
  const [rate, setRate] = useState(0.9) // speaking speed; 1 is the voice's normal pace
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const [caption, setCaption] = useState(null) // what's being said right now: { who: 'ai' | 'me', text }
  const rec = useRef(null)
  const q = QUESTIONS[i]
  const last = i === QUESTIONS.length - 1

  const listen = () => {
    if (!Recognition) return
    rec.current?.abort()
    const r = new Recognition()
    rec.current = r // set before cancelling speech so the cancelled utterance can't start a second listen
    window.speechSynthesis?.cancel()
    r.lang = 'en-GB'
    r.interimResults = true // show words on screen while they're still being spoken
    r.onresult = e => {
      const said = [...e.results].map(x => x[0].transcript).join('')
      setCaption({ who: 'me', text: said })
      if (!e.results[e.results.length - 1].isFinal) return
      const found = heard(said, q.options, q.label)
      if (found.length) add(q, found)
      setStatus(found.length ? "Got it! Tap Next when you're ready." : "That didn't match an option. Try again or tap below.")
    }
    r.onerror = e => {
      if (e.error === 'aborted') return
      setStatus(e.error === 'not-allowed' ? 'The microphone is blocked — tap your answers below instead.' : "Sorry, I didn't catch that. Tap the microphone to try again.")
    }
    r.onend = () => setListening(false)
    try {
      r.start()
    } catch {
      setStatus("Voice answers aren't available here — tap your answers below instead.")
      return
    }
    setListening(true)
    setCaption({ who: 'me', text: '' })
    setStatus('Listening… say your answer.')
  }

  useEffect(() => {
    let live = true
    rec.current = null
    setStatus('')
    const text = `${q.ask} You can say: ${q.options.map(o => plain(q.label ? q.label(o) : o)).join(', ')}.`
    setCaption({ who: 'ai', text })
    speak(text, () => live && !rec.current && listen(), rate)
    return () => { live = false; window.speechSynthesis?.cancel(); rec.current?.abort() }
  }, [i, round, rate]) // a new speed restarts the question so the change is heard straight away

  return (
    <div className="card voice">
      <p className="eyebrow">Question {i + 1} of {QUESTIONS.length}</p>
      <h2>{q.title}</h2>
      {caption && (
        <div className={`caption ${caption.who}`} aria-live="polite">
          <span className="who">
            {caption.who === 'ai'
              ? <><Volume2 size={18} /> SkillSwap says</>
              : <><Mic size={18} /> {listening ? "You're saying" : 'You said'}</>}
          </span>
          <p>{caption.text || '…'}</p>
        </div>
      )}
      <label className="speed">
        <span>Speaking speed <span className="meta">· {rate.toFixed(1)}×</span></span>
        <span className="speed-row">
          <span aria-hidden="true">Slower</span>
          <input type="range" min="0.5" max="1.5" step="0.1" value={rate}
            aria-valuetext={`${rate.toFixed(1)} times normal speed`}
            onChange={e => setRate(Number(e.target.value))} />
          <span aria-hidden="true">Faster</span>
        </span>
      </label>
      <button type="button" className={'mic' + (listening ? ' on' : '')} disabled={!Recognition}
        aria-label={listening ? 'Stop listening' : 'Answer with your voice'}
        onClick={() => (listening ? rec.current.stop() : listen())}>
        <Mic size={44} />
      </button>
      <p className="hint" aria-live="polite">
        {Recognition ? status || 'Tap the microphone and say your answer.' : "Voice answers don't work in this browser — tap your answers below."}
      </p>
      <Chips options={q.options} label={q.label} value={value(q)} onToggle={v => pick(q, v)} />
      <div className="voice-nav">
        <button type="button" className="btn btn-ghost small" onClick={() => setRound(r => r + 1)}><Volume2 size={20} /> Repeat</button>
        {last
          ? <button type="button" className="btn btn-green small" disabled={!ready} onClick={onFinish}>Find my matches →</button>
          : <button type="button" className="btn btn-green small" onClick={() => setI(i + 1)}>Next →</button>}
      </div>
      {last && !ready && <p className="hint">Go back and choose at least one skill to teach and one to learn.</p>}
      {i > 0 && <button type="button" className="link" onClick={() => setI(i - 1)}>← Previous question</button>}
    </div>
  )
}

/* ---------- Step 2: Matches ---------- */

function Matches({ profile, found, onMessage }) {
  if (!profile) {
    return (
      <Page eyebrow="Step 2 · Match" title="Your matches" lead="Tell us a little about yourself first and we'll find neighbours whose skills complement yours.">
        <a className="btn btn-amber" href="#join">Create your profile</a>
      </Page>
    )
  }
  return (
    <Page eyebrow="Step 2 · Match" title="Your matches" lead={`Hi ${profile.name}! These neighbours' skills complement yours.`}>
      {!found ? (
        <p className="card loading" role="status"><Sparkles size={22} /> Finding your matches… this can take a few seconds.</p>
      ) : (
        <>
          <p className="hint source">
            {found.source === 'ai'
              ? <><Sparkles size={16} /> Suggested by SkillSwap AI. A coordinator checks every match before you meet.</>
              : 'Suggested by our quick matcher (the AI service isn’t connected right now).'}
          </p>
          <div className="grid grid-2">
            {found.matches.map(m => (
              <div className="card match" key={m.id}>
                <div className="row">
                  <span className="avatar" aria-hidden="true">{m.emoji}</span>
                  <div>
                    <h2>{m.name}</h2>
                    <p className="hint">{m.role}{m.area ? ` · ${m.area}` : ''}</p>
                  </div>
                </div>
                {m.explanation && <p className="why">{m.explanation}</p>}
                <p><b>Teaches:</b> {m.teach.join(', ')}</p>
                <p><b>Wants to learn:</b> {m.learn.join(', ')}</p>
                <div className="tags">
                  {(m.tags.length ? m.tags : ['A neighbour worth meeting']).map(r => <span className="tag" key={r}>{r}</span>)}
                </div>
                <button className="btn btn-green small" onClick={() => onMessage(m.name)}>Say hello</button>
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

/* ---------- Step 3: Messages ---------- */

function Messages({ people, chatWith, setChatWith, threads, onSend }) {
  const [text, setText] = useState('')
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false) // while the safety check runs; stops a double send
  const person = people.find(p => p.name === chatWith) ?? people[0]
  const thread = threads[person.name] ?? []

  const submit = async e => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const problem = await screen(t)
    setBusy(false)
    setWarn(problem)
    if (!problem) { onSend(person, t); setText('') }
  }

  return (
    <Page eyebrow="Step 3 · Connect" title="Messages" lead="Every message is checked by our safety AI. Never share bank details or passwords.">
      <div className="messages">
        <ul className="people">
          {people.map(p => (
            <li key={p.name}>
              <button className="person" aria-pressed={p.name === person.name} onClick={() => { setChatWith(p.name); setWarn(null) }}>
                <span aria-hidden="true">{p.emoji}</span>{p.name}
              </button>
            </li>
          ))}
        </ul>
        <section className="card chat">
          <header className="chat-head">
            <h2><span aria-hidden="true">{person.emoji}</span> {person.name}</h2>
            <a className="btn btn-amber small" href="#sessions" onClick={() => setChatWith(person.name)}>Book session</a>
          </header>
          {/* column-reverse keeps the newest message pinned to the bottom without scroll JS */}
          <div className={'chat-body' + (thread.length ? ' filled' : '')} aria-live="polite">
            {thread.length
              ? [...thread].reverse().map((m, i) => <p key={thread.length - i} className={`bubble ${m.from}`}>{m.text}</p>)
              : <p className="hint">Say hello and mention what you'd love to share!</p>}
          </div>
          {warn && <p className="warn" role="alert">{warn}</p>}
          <form className="chat-form" onSubmit={submit}>
            <input className="input" placeholder="Write a message…" aria-label="Message" value={text} onChange={e => setText(e.target.value)} />
            <button className="btn btn-green small" disabled={busy}>{busy ? 'Checking…' : 'Send'}</button>
          </form>
        </section>
      </div>
    </Page>
  )
}

/* ---------- Steps 4–5: Sessions ---------- */

const when = s => new Date(`${s.date}T${s.time}`).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Sessions({ people, chatWith, profile, sessions, setSessions }) {
  const area = profile?.area ?? 'Albany'
  const venues = [`${area} Library – Community Room`, `${area} Community Centre – Café`, 'Video call']
  const [f, setF] = useState({
    with: people.some(p => p.name === chatWith) ? chatWith : people[0].name,
    skill: '', date: '', time: '14:00',
    venue: profile?.meet === 'online' ? 'Video call' : venues[0],
  })
  const set = (key, value) => setF({ ...f, [key]: value })
  const person = people.find(p => p.name === f.with) ?? people[0]
  const skills = [...new Set([...person.teach, ...person.learn])]
  const skill = skills.includes(f.skill) ? f.skill : skills[0]
  const update = (id, patch) => setSessions(s => s.map(x => (x.id === id ? { ...x, ...patch } : x)))
  const sorted = [...sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  const submit = e => {
    e.preventDefault()
    setSessions([...sessions, { id: Date.now(), name: person.name, emoji: person.emoji, skill, date: f.date, time: f.time, venue: f.venue, done: false, rating: 0 }])
    set('date', '')
  }

  return (
    <Page eyebrow="Steps 4–5 · Schedule & share" title="Your sessions" lead="Meet at a trusted community venue or on a video call.">
      <div className="sessions">
        <form className="card booking" onSubmit={submit}>
          <h2>Book a session</h2>
          <label className="field">With
            <select className="input" value={person.name} onChange={e => set('with', e.target.value)}>
              {people.map(p => <option key={p.name} value={p.name}>{`${p.emoji} ${p.name}`}</option>)}
            </select>
          </label>
          <label className="field">Skill
            <select className="input" value={skill} onChange={e => set('skill', e.target.value)}>
              {skills.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <div className="pair">
            <label className="field">Date
              <input className="input" type="date" min={new Date().toLocaleDateString('en-CA')} value={f.date} onChange={e => set('date', e.target.value)} required />
            </label>
            <label className="field">Time
              <input className="input" type="time" value={f.time} onChange={e => set('time', e.target.value)} required />
            </label>
          </div>
          <label className="field">Safe venue
            <select className="input" value={f.venue} onChange={e => set('venue', e.target.value)}>
              {venues.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
          <button className="btn btn-green">Confirm booking</button>
        </form>

        <div className="list">
          {sorted.length ? sorted.map(s => (
            <div className="card session" key={s.id}>
              <div className="row">
                <span className="avatar" aria-hidden="true">{s.emoji}</span>
                <div>
                  <h2>{s.skill} with {s.name}</h2>
                  <p className="hint">{when(s)} · {s.venue}</p>
                </div>
              </div>
              {!s.done ? (
                <button className="btn btn-ghost small" onClick={() => update(s.id, { done: true })}>Mark as done</button>
              ) : s.rating ? (
                <p><span className="rated" aria-hidden="true">{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</span><span className="sr-only">Rated {s.rating} out of 5.</span> Thanks! We'll use this to suggest your next match. <a href="#community">Share your story →</a></p>
              ) : (
                <div className="row">
                  <span>How did it go?</span>
                  <div className="stars" role="group" aria-label="Rate this session">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => update(s.id, { rating: n })}><Star /></button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )) : <p className="empty">No sessions yet — book your first and start sharing!</p>}
        </div>
      </div>
    </Page>
  )
}

/* ---------- Steps 6–7: Community ---------- */

function Community({ profile, posts, setPosts, stories, setStories }) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const problem = await screen(t)
    setBusy(false)
    setWarn(problem)
    if (problem) return
    setPosts(ps => [{ id: Date.now(), who: profile?.name ?? 'You', emoji: '🙂', meta: 'Just now', text: t, photo, likes: 0 }, ...ps])
    setText('')
    setPhoto(null)
  }
  const like = id => setPosts(ps => ps.map(p => (p.id === id ? { ...p, liked: !p.liked } : p)))

  return (
    <Page eyebrow="Steps 6–7 · Share & celebrate" title="Community stories" lead="Little wins, big smiles. Share what you learned and cheer each other on.">
      <form className="card share" onSubmit={submit}>
        <h2>Share an experience</h2>
        <textarea className="input" rows="3" placeholder="Tell everyone what you learned or made…" aria-label="Your story" value={text} onChange={e => setText(e.target.value)} />
        {photo && <img className="preview" src={photo} alt="Your chosen photo" />}
        {warn && <p className="warn" role="alert">{warn}</p>}
        <div className="row">
          <label className="btn btn-ghost small">
            📷 {photo ? 'Change photo' : 'Add photo'}
            <input className="sr-only" type="file" accept="image/*" onChange={e => e.target.files[0] && setPhoto(URL.createObjectURL(e.target.files[0]))} />
          </label>
          <button className="btn btn-green small" disabled={busy}>{busy ? 'Checking…' : 'Post'}</button>
        </div>
      </form>

      <div className="grid grid-2 posts">
        {posts.map(p => (
          <article className="card post" key={p.id}>
            <div className="row">
              <span className="avatar" aria-hidden="true">{p.emoji}</span>
              <div>
                <h2>{p.who}</h2>
                <p className="meta">{p.meta}</p>
              </div>
            </div>
            <p>{p.text}</p>
            {p.photo && <img src={p.photo} alt={`Shared by ${p.who}`} />}
            <button className="like" aria-pressed={!!p.liked} onClick={() => like(p.id)}>
              <span aria-hidden="true">💛</span> {p.likes + (p.liked ? 1 : 0)} <span className="sr-only">likes</span>
            </button>
          </article>
        ))}
      </div>

      <Reviews profile={profile} stories={stories} setStories={setStories} />
    </Page>
  )
}

const ROLES = ['Member', 'Buddy', 'Family member']

function Reviews({ profile, stories, setStories }) {
  const [r, setR] = useState({ name: profile?.name ?? '', role: 'Member', rating: 0, text: '' })
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setR(r => ({ ...r, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    if (busy) return
    const sent = r // what was on screen when Post was pressed
    setBusy(true)
    const problem = check(sent.name) ?? await screen(sent.text)
    setBusy(false)
    setWarn(problem)
    if (problem) return
    const since = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    setStories(s => [{ id: Date.now(), name: sent.name.trim(), emoji: '🙂', role: sent.role, since, rating: sent.rating, quote: sent.text.trim() }, ...s])
    setR(x => ({ ...x, rating: 0, text: '' }))
  }

  return (
    <section className="reviews">
      <h2 className="section-title">Reviews</h2>
      <p className="lead">What has SkillSwap meant to you? Reviews also appear on our home page.</p>
      <form className="card share" onSubmit={submit}>
        <h3>Leave a review</h3>
        <fieldset className="rating">
          <legend>Your rating</legend>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map(n => (
              <label key={n}>
                <input className="sr-only" type="radio" name="rating" checked={r.rating === n} onChange={() => set('rating', n)} required />
                <Star size={32} className={n <= r.rating ? 'on' : ''} />
                <span className="sr-only">{n} star{n > 1 ? 's' : ''}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="pair">
          <Field label="Your first name" maxLength={40} value={r.name} onChange={e => set('name', e.target.value)} required />
          <label className="field">I'm a…
            <select className="input" value={r.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <textarea className="input" rows="3" maxLength={400} placeholder="What changed for you?" aria-label="Your review" value={r.text} onChange={e => set('text', e.target.value)} required />
        {warn && <p className="warn" role="alert">{warn}</p>}
        <button className="btn btn-green small" disabled={busy}>{busy ? 'Checking…' : 'Post review'}</button>
      </form>

      <div className="grid grid-2 posts">
        {stories.map(s => (
          <article className="card post" key={s.id}>
            <Stars n={s.rating} />
            <p>“{s.quote}”</p>
            <p className="meta"><b>{s.name}</b> · {s.role} · With us since {s.since}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')).render(<App />)
