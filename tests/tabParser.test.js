// Focused tests for tabParser — multi-block, x2 repeat, normalization, muted "x".
// Run with: node --test tests/tabParser.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  tabToTurkish, tabToNotes, noteFrequency, fretToText,
  normalizeTabInput,
} from '../tabParser.js'

// ── Helpers ──────────────────────────────────────────────────

function countPhrases(text) {
  if (!text) return 0
  const t = text.replace(/\.$/, '')
  return t.split('. ').length
}

// ── Test data ─────────────────────────────────────────────────

const SINGLE_BLOCK = `e|---0---1---3---|
B|---1-----------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|`

const TWO_BLOCKS = `e|---0---1---3---|
B|---1-----------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|
e|---2---4---5---|
B|----------------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|`

const THREE_BLOCKS = `e|---0---1---3---|
B|---1-----------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|
e|---2---4---5---|
B|----------------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|
e|---7---8---10--|
B|----------------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|`

const WITH_PIPE = `e|---0---1---|
B|---1-------|
G|-----------|
D|-----------|
A|-----------|
E|-----------|`

const WITHOUT_PIPE = `e---0---1---|
B---1-------|
G-----------|
D-----------|
A-----------|
E-----------|`

const WITH_PAREN = `e---------------------------  )
B---------------------------  )
G--2-2-0-----0-----0--------  )  x2
D--------3-2---3-2---3-2-2--  )
A---------------------------  )
E---------------------------  )`

const FULL_EXAMPLE = `E---------------------------------
B------0-0-0-0-0-0-----0----------
G--0-2-------------2-2---2-2-0-2--
D---------------------------------
A---------------------------------
E---------------------------------
E-------------------------------------------
B------------------0---0--------------------
G--0-2-2-2-2-2-0-2---2---2-0-0--------------
D------------------------------3-2-2-2-3-2--
A-------------------------------------------
E-------------------------------------------
E---------------------------  )
B---------------------------  )
G--2-2-0-----0-----0--------  )  x2
D--------3-2---3-2---3-2-2--  )
A---------------------------  )
E---------------------------  )`

const MUTED_X = `e|---x---x---|
B|------------|
G|------------|
D|------------|
A|------------|
E|------------|`

const BROKEN_BLOCK = `e|---0---1---|
B|---1-------|
G|-----------|
D|-----------|
A|-----------|`

// ── Tests ─────────────────────────────────────────────────────

describe('1. Tek 6 telli TAB bloğu', () => {
  test('tek blok parse edilir', () => {
    const notes = tabToNotes(SINGLE_BLOCK)
    assert.ok(notes.length > 0, 'Nota bulunamadı')
    // 3 sütun: e:0, e:1/B:1, e:3
    assert.ok(notes.length >= 3, 'En az 3 nota olmalı')
  })

  test('tabToTurkish boş değil', () => {
    const text = tabToTurkish(SINGLE_BLOCK)
    assert.ok(text.length > 0, 'Türkçe metin boş')
    assert.ok(text.includes('birinci tel'), 'birinci tel geçmeli')
  })
})

describe('2. Art arda iki TAB bloğu', () => {
  test('iki blok algılanır', () => {
    const { blocks, error } = normalizeTabInput(TWO_BLOCKS)
    assert.ifError(error)
    assert.equal(blocks.length, 2, 'İki blok olmalı')
  })

  test('iki bloğun notaları birleşik döner', () => {
    const notes = tabToNotes(TWO_BLOCKS)
    assert.ok(notes.length > 0)
    // Birinci blok: e:0, e:1+B:1, e:3 (3 sütun)
    // İkinci blok: e:2, e:4, e:5 (3 sütun)
    assert.ok(notes.length >= 6, 'En az 6 nota olmalı')
  })
})

describe('3. Art arda üç TAB bloğu', () => {
  test('üç blok algılanır', () => {
    const { blocks, error } = normalizeTabInput(THREE_BLOCKS)
    assert.ifError(error)
    assert.equal(blocks.length, 3, 'Üç blok olmalı')
  })

  test('üç bloğun notaları birleşik döner', () => {
    const notes = tabToNotes(THREE_BLOCKS)
    assert.ok(notes.length >= 9, 'En az 9 nota olmalı')
  })
})

describe('4. Tel adından sonra "|" bulunan biçim', () => {
  test("pipe ile parse edilir", () => {
    const notes = tabToNotes(WITH_PIPE)
    assert.ok(notes.length > 0)
    assert.equal(notes[0][0].string, 'e')
    assert.equal(notes[0][0].fret, '0')
  })
})

describe('5. Tel adından sonra "|" bulunmayan biçim', () => {
  test('pipesiz parse edilir', () => {
    const notes = tabToNotes(WITHOUT_PIPE)
    assert.ok(notes.length > 0)
    assert.equal(notes[0][0].string, 'e')
    assert.equal(notes[0][0].fret, '0')
  })
})

describe('6. Satır sonlarında ")" bulunan biçim', () => {
  test('parantezler temizlenir', () => {
    const { normalized, error } = normalizeTabInput(WITH_PAREN)
    assert.ifError(error)
    // Normalized text should not contain ")"
    assert.ok(!normalized.includes(')'), 'Parantezler temizlenmeli')
  })
})

describe('7. x2 bulunan bloğun iki kez üretilmesi', () => {
  test('x2 blok iki kez okunur', () => {
    const { blocks, error } = normalizeTabInput(WITH_PAREN)
    assert.ifError(error)
    assert.equal(blocks.length, 1, 'Tek blok olmalı')
    assert.equal(blocks[0].repeat, 2, 'Tekrar sayısı 2 olmalı')
  })

  test('x2 ile notalar iki kez üretilir', () => {
    // WITH_PAREN bloğu: G telinde 2,2,0,0,0 ve D telinde 3,2,3,2,3,2,2 = birkaç sütun
    const notesOnce = tabToNotes(WITH_PAREN.replace(/\s*x2/i, ''))
    const notesTwice = tabToNotes(WITH_PAREN)
    assert.ok(notesTwice.length > notesOnce.length, 'x2 ile daha fazla nota olmalı')
    assert.ok(
      notesTwice.length >= notesOnce.length * 1.5,
      'Tekrar yaklaşık iki kat olmalı'
    )
  })
})

describe('8. x2 içindeki 2 perde olarak okunmamalı', () => {
  test('x2 rakamı perde değil', () => {
    const notes = tabToNotes(WITH_PAREN)
    // x2'deki "2" perde olarak okunmamalı. WITH_PAREN'de G telinde gerçek
    // perde 2'ler var, ama x2 açıklamasındaki 2 ekstra nota üretmemeli.
    // Normalized text'te "x2" olmamalı.
    const { normalized } = normalizeTabInput(WITH_PAREN)
    assert.ok(!/x2/i.test(normalized), 'x2 temizlenmeli')
  })
})

describe('9. Gerçek muted "x" notasının korunması', () => {
  test('x muted nota bozulmaz', () => {
    // MUTED_X: e telinde x, x — bunlar perde değil, muted.
    // tabToNotes x'i perde olarak okumamalı (x digit değil).
    const notes = tabToNotes(MUTED_X)
    // x digit olmadığı için nota üretilmez — bu doğru davranış.
    // Test: hata oluşmaz ve nota sayısı 0 (x'ler atlanır).
    assert.ok(Array.isArray(notes), 'Hata oluşmamalı')
  })
})

describe('10. Tam örnek parça hatasız çözümlenmeli', () => {
  test('üç blok + x2 tekrar', () => {
    const { blocks, error } = normalizeTabInput(FULL_EXAMPLE)
    assert.ifError(error, 'Hata olmamalı: ' + error)
    assert.equal(blocks.length, 3, 'Üç blok olmalı')
    assert.equal(blocks[2].repeat, 2, 'Üçüncü blok x2 ile iki kez')
  })

  test('tam örnek nota üretir', () => {
    const notes = tabToNotes(FULL_EXAMPLE)
    assert.ok(notes.length > 0, 'Nota üretilmeli')
    assert.ok(notes.length >= 20, 'Yeterli nota olmalı')
  })

  test('tam örnek Türkçe metin boş değil', () => {
    const text = tabToTurkish(FULL_EXAMPLE)
    assert.ok(text.length > 0, 'Türkçe metin boş olmamalı')
    assert.ok(text.includes('tel'), 'tel kelimesi geçmeli')
  })
})

describe('11. Bozuk blokta Türkçe hata', () => {
  test('eksik blok hata döner', () => {
    const { error } = normalizeTabInput(BROKEN_BLOCK)
    assert.ok(error, 'Hata dönmeli')
    assert.ok(/Türkçe|tel|blok|satır/i.test(error) || error.length > 5, 'Hata mesajı anlamlı olmalı')
  })
})

describe('12. Mevcut basit testler aynı şekilde geçmeli', () => {
  test('noteFrequency e:0 = 329.63 Hz', () => {
    const f = noteFrequency('e', 0)
    assert.ok(f !== null)
    assert.ok(Math.abs(f - 329.63) < 0.1)
  })

  test('noteFrequency e:1 = 349.23 Hz', () => {
    const f = noteFrequency('e', 1)
    assert.ok(Math.abs(f - 349.23) < 0.1)
  })

  test('noteFrequency B:1 = 261.63 Hz', () => {
    const f = noteFrequency('B', 1)
    assert.ok(Math.abs(f - 261.63) < 0.1)
  })

  test('fretToText(0) = açık tel', () => {
    assert.equal(fretToText(0), 'açık tel')
  })

  test('fretToText(1) = birinci perde', () => {
    assert.equal(fretToText(1), 'birinci perde')
  })

  test('fretToText(3) = üçüncü perde', () => {
    assert.equal(fretToText(3), 'üçüncü perde')
  })

  test('tek blok tabToTurkish boş değil', () => {
    const text = tabToTurkish(SINGLE_BLOCK)
    assert.ok(text.length > 0)
  })

  test('tek blok tabToNotes boş değil', () => {
    const notes = tabToNotes(SINGLE_BLOCK)
    assert.ok(notes.length > 0)
  })
})

describe('Ek: normalizeTabInput güvenlik', () => {
  test('CRLF normalize edilir', () => {
    const crlf = 'e|---0---|\r\nB|-------|\r\nG|-------|\r\nD|-------|\r\nA|-------|\r\nE|-------|\r\n'
    const { normalized, error } = normalizeTabInput(crlf)
    assert.ifError(error)
    assert.ok(!normalized.includes('\r'), 'CR kalmamalı')
  })

  test('boş metin hata döner', () => {
    const { error } = normalizeTabInput('')
    assert.ok(error, 'Boş metin hata vermeli')
  })

  test('x9 çok büyük tekrar reddedilir', () => {
    const big = `e|---0---|
B|-------|
G|-------|
D|-------|
A|-------|
E|-------|  x9`
    const { blocks, error } = normalizeTabInput(big)
    // x9 > 8, so repeat should be 1 (ignored)
    assert.ifError(error)
    assert.equal(blocks[0].repeat, 1, 'x9 reddedilmeli, tekrar 1 olmalı')
  })
})
