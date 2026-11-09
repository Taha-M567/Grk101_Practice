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
const label = 'Test 3 practice sentences';

test('sentence cards cover only the announced test topics in Greek-to-English form', () => {
  const app = load();
  const cards = JSON.parse(app.read('JSON.stringify(allCards)'));
  const practice = cards.filter(c => c.subtopic === 'practice');
  assert.equal(cards.length, 338);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  assert.equal(practice.length, 84);
  assert.equal(cards.filter(c => c.topic === 'translation').length, practice.length);
  assert.equal(new Set(practice.map(c => c.front.normalize('NFC').trim())).size, practice.length);
  const focuses = new Set();
  const allowedFocuses = ['Middle / deponent verbs','3rd-declension nouns','Dative case','Prepositions','Reflexive pronouns','Substantive adjectives'];
  for (const card of practice) {
    assert.equal(card.topic, 'translation');
    assert.ok(card.front && card.back && card.note);
    assert.match(card.front, /[\u0370-\u03ff\u1f00-\u1fff]/u);
    assert.match(card.back, /[A-Za-z]/);
    assert.doesNotMatch(card.front + card.back, /_____|undefined|�/u);
    assert.doesNotMatch(card.back, /[\u0370-\u03ff\u1f00-\u1fff]/u);
    assert.match(card.note, /^Greek → English\. Test focus: /);
    assert.match(card.source, /^[67][αβ] · (?:Exercise|Grammar|Reading)/u);
    for (const focus of card.note.match(/Test focus: ([^.]+)\./)[1].split('; ')) {
      assert.ok(allowedFocuses.includes(focus));
      focuses.add(focus);
    }
  }
  assert.deepEqual([...focuses].sort(), allowedFocuses.sort());
  const numbers = n => Array.from({length:n}, (_, i) => String(i+1));
  const selectedItems = {
    '6γ':['1b','2a','2b','3b','4b','5a','5b'], '6δ':['1b','2a','2b','3b','4b','5b'],
    '6η':numbers(10), '6ι':numbers(10), '6λ':numbers(10), '6μ':[...numbers(10),'12'],
    '6ξ':['1a','2a','3a','4a','5a'], '7γ':['1a','1b','2','3','4','5','6'], '7δ':numbers(12),
  };
  for (const [exercise, expected] of Object.entries(selectedItems)) {
    const matching = practice.filter(c => c.source.includes(`Exercise ${exercise},`));
    assert.deepEqual(matching.map(c => c.source.split(', ')[1]).sort(), expected.sort(), exercise);
    for (const card of matching) assert.match(card.source, /\(2nd ed\.\)$/);
  }
  const removed = ['c255','c292','c293','c296','c300','c302','c304','c331', ...numbers(5).map(n => `c${309+Number(n)}`), ...numbers(10).map(n => `c${332+Number(n)}`), 'c344','c346','c348','c350','c352','c353','c354','c355','c356'];
  assert.equal(removed.length, 32);
  assert.ok(removed.every(id => !cards.some(c => c.id === id)));
  assert.ok(['c260','c281','c282','c283','c284','c285'].every(id => practice.some(c => c.id === id)));
});

test('category counts and visible cards follow all three textbook section filters', () => {
  const app = load();
  for (const [section, count] of [['all',84],['6a',24],['6b',36],['7a',24]]) {
    app.elements.section.listeners.change({target: {value: section}});
    assert.equal(app.read('topic'), 'all');
    assert.equal(app.button(label).attributes['aria-label'], `${label} (${count})`);
    app.button(label).click();
    assert.equal(app.read('display.length'), count);
    assert.ok(app.read('display.every(c => c.subtopic === "practice" && (section === "all" || c.section === section))'));
    assert.equal(app.button(label).attributes['aria-pressed'], 'true');
    assert.equal(app.elements.grammarGroup.hidden, true);
    assert.match(app.elements.filterSummary.textContent, /2nd edition/);
    assert.match(app.elements.filterSummary.textContent, /Greek → English/);
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
  assert.match(app.elements.category.textContent, /Test 3 practice sentences/);
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

test('deponent category is preserved and Translation contains the same selected sentences', () => {
  const app = load();
  app.button('Deponent verb translations').click();
  assert.equal(app.read('display.length'), 11);
  app.button('Translation').click();
  assert.equal(app.read('display.length'), 84);
});
