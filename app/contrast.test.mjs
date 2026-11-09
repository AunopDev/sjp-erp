// Checks colour contrast with numbers (WCAG): text >= 4.5:1, clickable parts >= 3:1, in the light and dark themes.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src')
const read = f => fs.readFileSync(path.join(src, f), 'utf8')

function tokens(block) {
  const out = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) out[m[1]] = m[2]
  return out
}
function rgb(c) {
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).replace(/./g, x => x + x) : c.slice(1, 7)
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  }
  return c.match(/[\d.]+/g).slice(0, 3).map(Number)
}
const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const light = tokens(read('refined.css').match(/:root\s*{[^}]*}/)[0])
const dark = tokens(read('shell.css').match(/html\[data-theme='dark'\]\s*{\s*--bg[^}]*}/)[0])
// the card colour is translucent white in the light theme; on the page background it renders as white
light.card = '#ffffff'

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text contrast is at least 4.5:1`, () => {
    for (const [fg, bg] of [['ink', 'bg'], ['ink', 'card'], ['muted', 'bg'], ['muted', 'card']]) {
      const r = ratio(t[fg], t[bg])
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1 in the ${name} theme`)
    }
  })
  test(`${name} theme: primary button and its text are readable`, () => {
    const r = ratio('#ffffff', t.pri)
    assert.ok(r >= 4.5, `white text on the primary button is ${r.toFixed(2)}:1 in the ${name} theme`)
    const edge = ratio(t.pri, t.bg)
    assert.ok(edge >= 3, `the primary button against the page is ${edge.toFixed(2)}:1 in the ${name} theme`)
  })
}

test('focus outlines are visible against both themes (>= 3:1)', () => {
  assert.ok(ratio('#1a5fd0', light.bg) >= 3)
  assert.ok(ratio('#8ab8ff', dark.bg) >= 3)
})
