const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'Athenaze_Test_3_Section_And_Topic_Flashcards.html'), 'utf8');
class Element {
  constructor() {
    this.children = []; this.listeners = {}; this.attributes = {}; this.style = {}; this.textContent = '';
    this.classList = {toggle() {}, remove() {}};
  }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  set innerHTML(value) { this.children = []; }
  click() { if (!this.disabled) this.listeners.click?.(); }
}
function load(saved = {}) {
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const context = vm.createContext({
    document: {getElementById: id => elements[id], createElement: () => new Element(), createTextNode: text => ({textContent: text}), addEventListener() {}},
    localStorage: {getItem: key => saved[key] ?? null, setItem: (key, value) => saved[key] = value},
    window: {matchMedia: () => ({matches: true})},
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return {elements, saved, read: code => vm.runInContext(code, context), button: label => elements.topicButtons.children.find(b => b.children[0].textContent === label)};
}
const label = 'Homework / practice sentences';

test('all sentence exercises are covered with unique IDs, prompts, answers, and references', () => {
  const app = load();
  const cards = JSON.parse(app.read('JSON.stringify(allCards)'));
  const practice = cards.filter(c => c.subtopic === 'practice');
  assert.equal(cards.length, 370);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  for (let n = 1; n <= 370; n++) assert.ok(cards.some(c => c.id === `c${String(n).padStart(3, '0')}`));
  assert.equal(practice.length, 110);
  assert.equal(new Set(practice.map(c => c.front.normalize('NFC').trim())).size, practice.length);
  const coverage = {};
  for (const card of practice) {
    assert.equal(card.topic, 'translation');
    assert.ok(card.front && card.back && card.note);
    assert.match(card.source, /Exercise [67][α-ω], \d+[ab]?, p\. \d+(?:–\d+)? \(2nd ed\.\)$/u);
    assert.doesNotMatch(card.back, /_____|undefined|�/u);
    if (card.note.startsWith('English → Greek')) assert.match(card.note, /Suggested translation/);
    const exercise = card.source.match(/Exercise ([^,]+)/)[1];
    coverage[exercise] = (coverage[exercise] || 0) + 1;
  }
  assert.deepEqual(coverage, {'6γ':10,'6δ':10,'6η':10,'6θ':5,'6ι':10,'6λ':10,'6μ':12,'6ν':10,'6ξ':10,'6ο':4,'7γ':7,'7δ':12});
  for (const [exercise, count] of Object.entries(coverage)) {
    const actual = practice.filter(c => c.source.includes(`Exercise ${exercise},`)).map(c => c.source.split(', ')[1]).sort();
    const expected = ['6γ','6δ','6ξ'].includes(exercise)
      ? Array.from({length: count / 2}, (_, i) => [`${i+1}a`, `${i+1}b`]).flat()
      : exercise === '7γ' ? ['1a','1b','2','3','4','5','6']
      : Array.from({length: count}, (_, i) => String(i+1));
    assert.deepEqual(actual, expected.sort(), `${exercise}: every printed item appears once`);
  }
  assert.equal(practice.filter(c => Number(c.id.slice(1)) < 291).length, 30);
  assert.ok(['c260','c281','c282','c283','c284','c285'].every(id => !practice.some(c => c.id === id)));
});

test('category counts and visible cards follow all three textbook section filters', () => {
  const app = load();
  for (const [section, count] of [['all',110],['6a',35],['6b',56],['7a',19]]) {
    app.elements.section.listeners.change({target: {value: section}});
    assert.equal(app.read('topic'), 'all');
    assert.equal(app.button(label).attributes['aria-label'], `${label} (${count})`);
    app.button(label).click();
    assert.equal(app.read('display.length'), count);
    assert.ok(app.read('display.every(c => c.subtopic === "practice" && (section === "all" || c.section === section))'));
    assert.equal(app.button(label).attributes['aria-pressed'], 'true');
    assert.equal(app.elements.grammarGroup.hidden, true);
    assert.match(app.elements.filterSummary.textContent, /2nd edition/);
    const first = app.read('display[index].id');
    app.elements.next.click(); app.elements.prev.click();
    assert.equal(app.read('display[index].id'), first);
    app.elements.shuffle.click();
    assert.equal(app.read('display.length'), count);
  }
});

test('reused and new cards flip, persist ratings, and work in missed-card review', () => {
  const saved = {'athenaze-test3-comprehensive-v2': JSON.stringify({c261:false, c004:true})};
  const app = load(saved);
  app.button(label).click();
  assert.equal(app.read('ratings.c261'), false);
  assert.equal(app.read('ratings.c004'), true);
  app.elements.review.click();
  assert.equal(app.read('display.length'), 1);
  assert.equal(app.read('display[0].id'), 'c261');
  app.elements.flip.click();
  assert.equal(app.elements.maintext.textContent, app.read('display[0].back'));
  assert.match(app.elements.source.textContent, /Exercise 6η/);
  assert.match(app.elements.category.textContent, /Homework \/ practice sentences/);
  app.elements.known.click();
  assert.equal(app.read('display.length'), 0);
  assert.equal(app.elements.card.disabled, true);
  app.elements.review.click();
  app.read('index = display.findIndex(c => c.id === "c291"); render();');
  app.elements.missed.click();
  app.elements.review.click();
  assert.equal(app.read('display[0].id'), 'c291');
  assert.equal(load(saved).read('ratings.c291'), false);
  assert.equal(JSON.parse(saved['athenaze-test3-comprehensive-v2']).c261, true);
  assert.equal(JSON.parse(saved['athenaze-test3-comprehensive-v2']).c004, true);
});

test('existing deponent category and broader translation category remain available', () => {
  const app = load();
  app.button('Deponent verb translations').click();
  assert.equal(app.read('display.length'), 11);
  app.button('Translation').click();
  assert.equal(app.read('display.length'), 116);
});
