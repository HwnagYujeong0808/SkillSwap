// Accessibility + layout check for every page and sign-up step.
// Runs axe-core at phone size with WCAG 2.2 AA plus AAA contrast (7:1), because our users include people over 60,
// then checks nothing sticks out sideways on 320px, 650px and 1024px screens (narrow phones, web views, tablets).
// Usage: npm run a11y        Set CHROME_PATH if Chrome/Edge isn't found. Set SHOTS=<dir> to save screenshots.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core'), 'utf8')
const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => p && existsSync(p))
if (!browserPath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.')

const server = await preview({ preview: { port: 4173 } })
const browser = await puppeteer.launch({ executablePath: browserPath })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844 })
await page.goto(server.resolvedUrls.local[0])

const pause = () => new Promise(r => setTimeout(r, 300))
const go = async hash => { await page.evaluate(h => { location.hash = h }, hash); await pause() }
const click = async selector => { await page.click(selector); await pause() }
let problems = 0

async function audit(name) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => (await axe.run({
    runOnly: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
  })).violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => `${n.target.join(' ')}  ${n.failureSummary.split('\n')[1]?.trim() ?? ''}`) })))
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true })
  console.log(`\n${violations.length ? '✗' : '✓'} ${name}`)
  for (const v of violations) {
    problems++
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`)
    v.nodes.slice(0, 4).forEach(n => console.log(`      ${n}`))
    if (v.nodes.length > 4) console.log(`      …and ${v.nodes.length - 4} more`)
  }
  for (const width of [320, 650, 1024]) {
    await page.setViewport({ width, height: 844 })
    // Only a real sideways scroll counts; then name the elements causing it (clipped ones, like canvases, don't).
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 3).map(el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')))
    if (wide.length) { problems++; console.log(`  [layout] sticks out of a ${width}px screen: ${wide.join(', ')}`) }
  }
  await page.setViewport({ width: 390, height: 844 })
}

await audit('home')
await click('.menu-btn')
await audit('home-menu-open')

await go('join')
await audit('join-1-details')
// The referral section is optional, so it's left empty here to prove sign-up works without it.
await page.type('::-p-aria(First name)', 'Margaret')
await page.type('::-p-aria(Best phone number)', '07700 900123')
await page.type('::-p-aria(Best time to call)', 'Mornings')
await page.type('::-p-aria(Town or ZIP code)', 'Camden')
await page.type('::-p-aria(Preferred language)', 'English')
await click('input[type=checkbox]')
await page.type("::-p-aria(Contact's name)", 'Anna')
await page.type('::-p-aria(Relationship)', 'Daughter')
await page.type("::-p-aria(Contact's phone)", '07700 900456')
await click('::-p-text(Next →)')
await audit('join-2-choose')
await click('::-p-text(Listen & speak)')
await audit('join-3-voice')
await click('::-p-text(← Back)')
await click('::-p-text(Read & tap)')
await click('fieldset:nth-of-type(2) .chip')
await click('fieldset:nth-of-type(3) .chip:nth-child(10)')
await audit('join-3-text')
await click('::-p-text(Find my matches)')
await audit('matches')

await go('messages')
await page.type('::-p-aria(Message)', 'Hello! Could you show me video calling?')
await click('::-p-text(Send)')
await audit('messages')
await go('sessions')
await audit('sessions')
await go('community')
await audit('community')

await browser.close()
server.httpServer.close()
console.log(problems ? `\n${problems} problem(s) found.` : '\nNo problems found.')
process.exit(problems ? 1 : 0)
