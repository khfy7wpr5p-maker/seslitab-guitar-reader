# ST Music Engine — Mimari Tasarım

**Sürüm:** 1.0.0
**Durum:** Taslak (kod henüz değiştirilmedi)
**Amaç:** MusicXML'den Türkçe ritmik metin, MIDI ve sese giden tam veri akışını
destekleyen modüler mimari. Gitar, piyano, keman ve diğer enstrümanları
destekleyecek şekilde genişletilebilir.

---

## İçindekiler

1. [Mimari Genel Bakış](#1-mimari-genel-bakış)
2. [Tasarım İlkeleri](#2-tasarım-ilkeleri)
3. [Modül Listesi](#3-modül-listesi)
4. [Modül Detayları](#4-modül-detayları)
   - [4.1 MusicXML Parser](#41-musicxml-parser)
   - [4.2 Note Object Builder](#42-note-object-builder)
   - [4.3 Rhythm Analyzer](#43-rhythm-analyzer)
   - [4.4 TAB Analyzer](#44-tab-analyzer)
   - [4.5 Chord Analyzer](#45-chord-analyzer)
   - [4.6 Turkish Rhythmic Text Generator](#46-turkish-rhythmic-text-generator)
   - [4.7 MIDI Generator](#47-midi-generator)
   - [4.8 Voice Generator](#48-voice-generator)
   - [4.9 Teacher Correction Engine](#49-teacher-correction-engine)
5. [Tam Veri Akış Diyagramı](#5-tam-veri-akış-diyagramı)
6. [Enstrüman Genişletilebilirlik Stratejisi](#6-enstrüman-genişletilebilirlik-stratejisi)
7. [Modül Bağımlılık Matrisi](#7-modül-bağımlılık-matrisi)
8. [Ortak Veri Modelleri](#8-ortak-veri-modelleri)
9. [Hata Yönetim Stratejisi](#9-hata-yönetim-stratejisi)

---

## 1. Mimari Genel Bakış

ST Music Engine, MusicXML dokümanından başlayarak Türkçe ritmik metin, MIDI
dosyası ve ses çıktısı üreten bir pipeline'dır. Her modül tek bir sorumluluğa
sahiptir ve modüller arası iletişim **NoteObject** veri modeli üzerinden
yapılır.

```
                    MusicXML (string)
                          │
                          ▼
                ┌─────────────────────┐
                │  MusicXML Parser    │
                └─────────┬───────────┘
                          │ NoteObject[]
                          ▼
                ┌─────────────────────┐
                │ Note Object Builder│  ← noteTheory.js
                └─────────┬───────────┘
                          │ NoteObject[] (zenginleştirilmiş)
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │Rhythm        │ │TAB Analyzer  │ │Chord         │
   │Analyzer      │ │              │ │Analyzer      │
   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                ┌─────────────────────┐
                │Teacher Correction  │
                │Engine               │
                └─────────┬───────────┘
                          │ NoteObject[] (düzeltilmiş)
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
   ┌──────────────┐ ┌────────────┐ ┌──────────────┐
   │Turkish       │ │MIDI        │ │Voice         │
   │Rhythmic Text │ │Generator   │ │Generator     │
   │Generator     │ │            │ │              │
   └──────────────┘ └────────────┘ └──────────────┘
        (text)         (binary)       (audio)
```

---

## 2. Tasarım İlkeleri

| İlke | Açıklama |
|------|----------|
| **Tek Sorumluluk (SRP)** | Her modül bir iş yapar: parser sadece parse eder, rhythm analyzer sadece ritim analizi yapar. |
| **NoteObject merkezli** | Tüm modüller arası veri akışı NoteObject[] üzerinden. Alternatif veri formatları yok. |
| **Saf fonksiyonlar** | Modüller yan etkisizdir: girdi alır, çıktı üretir. Global state yok. |
| **Genişletilebilirlik** | Enstrüman spesifik mantığı strategy pattern ile izole edilir. Yeni enstrüman = yeni strategy. |
| **Hata toleransı** | Bir modül hata verirse, pipeline durmaz — hata NoteObject'in `confidence` alanına yazılır ve sonraki modüller devam eder. |
| **Mevcut kodla uyum** | Mevcut `musicXmlParser.js`, `noteTheory.js`, `rhythmicTextGenerator.js`, `tabParser.js` modüllerinin sorumlulukları korunur ve netleştirilir. |

---

## 3. Modül Listesi

| # | Modül | Mevcut dosya | Durum |
|---|-------|-------------|-------|
| 1 | MusicXML Parser | `musicXmlParser.js` | Mevcut — netleştirilecek |
| 2 | Note Object Builder | `noteTheory.js` (`createNote`) | Mevcut — netleştirilecek |
| 3 | Rhythm Analyzer | (yok) | Yeni — tasarlanacak |
| 4 | TAB Analyzer | `tabParser.js` | Mevcut — netleştirilecek |
| 5 | Chord Analyzer | (yok) | Yeni — tasarlanacak |
| 6 | Turkish Rhythmic Text Generator | `rhythmicTextGenerator.js` | Mevcut — netleştirilecek |
| 7 | MIDI Generator | (yok) | Yeni — tasarlanacak |
| 8 | Voice Generator | `audio.js` (kısmi) | Yeni — tasarlanacak |
| 9 | Teacher Correction Engine | (yok) | Yeni — tasarlanacak |

---

## 4. Modül Detayları

---

### 4.1 MusicXML Parser

**Mevcut dosya:** `musicXmlParser.js`

#### Görevi

MusicXML dokümanını (string) parse ederek ham nota verilerini çıkarır.
Ölçüleri, notaları, sus işaretlerini, teknik bilgileri (tel/perde) ve
süreleri okur. Bu modül MusicXML formatının tek bilenidir — diğer modüller
XML ile çalışmaz.

#### Girdi verisi

```typescript
interface MusicXmlParserInput {
  musicXmlString: string  // MusicXML dokümanı (text/xml)
}
```

#### Çıktı verisi

```typescript
interface MusicXmlParserOutput {
  notes: NoteObject[]     // Ham nota listesi (zenginleştirilmemiş)
  error?: string          // Parse hatası mesajı (varsa)
}
```

Her NoteObject şu alanları içerir (henüz otomatik hesaplanmamış):
- `measure`, `startBeat` — konum
- `string`, `fret` — gitar pozisyonu (technical varsa)
- `noteName`, `frequency`, `midi` — perde bilgisi (hesaplanacak)
- `duration`, `beats` — süre
- `isRest` — sus işareti
- `confidence`, `confidenceReason` — güven skoru

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | Parser'ın çıktısı Builder'a gider — zenginleştirme için |
| Rhythm Analyzer | Parser'ın ürettiği `startBeat` ve `beats` alanlarını kullanır |
| TAB Analyzer | Parser, technical (string/fret) bilgisi yoksa TAB Analyzer devreye girer |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Geçersiz XML formatı | `{ notes: [], error: 'Geçersiz MusicXML formatı' }` |
| Boş string | `{ notes: [], error: 'Boş MusicXML' }` |
| `<parsererror>` | DOMParser hatası yakalanır, error mesajı döner |
| Eksik `<pitch>` | Nota atlanır, loglanır |
| Eksik `<technical>` | `pitchToGuitarPosition` ile tel/perde hesaplanır |
| Bilinmeyen duration type | Varsayılan `quarter` (1 beat) kullanılır |

---

### 4.2 Note Object Builder

**Mevcut dosya:** `noteTheory.js` (`createNote`, `validateNote`, `cloneNote`)

#### Görevi

Parser'dan gelen ham nota verilerini zenginleştirir. Eksik alanları otomatik
hesaplar: nota adı, frekans, MIDI numarası, oktav, süre adı, tel numarası.
NoteObject'in tüm türevi alanlarını (durationName, accidentalLabel, beats)
doldurur. Ayrıca validasyon yapar.

Bu modül **nota teorisinin** tek kaynağıdır. Diğer modüller nota teorisi
hesaplaması yapmaz — Builder'ın ürettiği zenginleştirilmiş NoteObject'yi
kullanır.

#### Girdi verisi

```typescript
interface NoteObjectBuilderInput {
  notes: NoteObject[]  // Parser'dan gelen ham notalar
}
```

#### Çıktı verisi

```typescript
interface NoteObjectBuilderOutput {
  notes: NoteObject[]  // Zenginleştirilmiş, validasyonu yapılmış notalar
  validationErrors: ValidationError[]  // Geçersiz notaların listesi
}

interface ValidationError {
  noteIndex: number
  errors: string[]
}
```

#### Otomatik hesaplanan alanlar

| Alan | Hesaplama | Kaynak |
|------|-----------|--------|
| `beats` | `applyDots(baseBeats, dotCount)` | `noteTheory.js` |
| `durationName` | `durationName(duration)` | `noteTheory.js` |
| `noteName` | `noteName(stringLetter, fret)` | `noteTheory.js` |
| `frequency` | `noteFrequency(stringLetter, fret)` veya `midiToFrequency(midi)` | `noteTheory.js` |
| `midi` | `noteToMidi(stringLetter, fret)` | `noteTheory.js` |
| `octave` | `midiToOctave(midi)` | `noteTheory.js` |
| `stringNumber` | `STRING_NUMBER[stringLetter]` | `noteTheory.js` |
| `accidentalLabel` | `ACCIDENTALS[accidental].label` | `noteTheory.js` |

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| MusicXML Parser | Parser'ın ham çıktısını alır |
| Rhythm Analyzer | Zenginleştirilmiş `beats` ve `startBeat` kullanır |
| TAB Analyzer | Builder, TAB Analyzer'dan gelen tel/perde düzeltmelerini uygular |
| Chord Analyzer | Builder'ın `isChord`, `chordName`, `chordNotes` alanlarını doldurur |
| Turkish Rhythmic Text Generator | Builder'ın `noteName`, `durationName`, `stringLetter` alanlarını kullanır |
| MIDI Generator | Builder'ın `midi` ve `frequency` alanlarını kullanır |
| Voice Generator | Builder'ın `frequency` ve `beats` alanlarını kullanır |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| `measureNumber < 1` | `validationErrors`'a eklenir, nota korunur |
| Tel bilgisi yok ve sus değil | `validationErrors`'a eklenir |
| `fret < 0` | `validationErrors`'a eklenir |
| `beats <= 0` | `validationErrors`'a eklenir |
| `confidence` 0-1 dışında | `validationErrors`'a eklenir |
| Bilinmeyen `stringLetter` | `noteName` ve `frequency` null kalır, nota korunur |

---

### 4.3 Rhythm Analyzer

**Mevcut dosya:** Yok (yeni modül)

#### Görevi

Nota listesindeki ritmik yapıyı analiz eder. Ölçü numaralarını, vuruş
numaralarını, zaman işaretini ve tempoyu doğrular. Ölçü içindeki nota
sürelerinin toplamının zaman işaretine uyup uymadığını kontrol eder.
Eksik veya fazla vuruşları tespit eder. Tekrar (repeat) işaretlerini işler.

#### Girdi verisi

```typescript
interface RhythmAnalyzerInput {
  notes: NoteObject[]       // Builder'dan gelen zenginleştirilmiş notalar
  timeSignature?: string   // '4/4', '3/4', '6/8' (MusicXML'den veya manuel)
  tempo?: number           // BPM (MusicXML'den veya varsayılan 120)
}
```

#### Çıktı verisi

```typescript
interface RhythmAnalyzerOutput {
  notes: NoteObject[]      // beatNumber ve zaman bilgisi güncellenmiş notalar
  measures: MeasureInfo[]  // Ölçü bazlı analiz
  issues: RhythmIssue[]    // Ritim sorunları
}

interface MeasureInfo {
  measureNumber: number
  totalBeats: number        // Ölçüdeki toplam vuruş
  expectedBeats: number    // Zaman işaretine göre beklenen vuruş
  isComplete: boolean       // Ölçü tam mı?
  beatCount: number         // Kaç vuruş var
}

interface RhythmIssue {
  type: 'incomplete_measure' | 'overfull_measure' | 'missing_beat' | 'unknown_time_signature'
  measureNumber: number
  message: string
  severity: 'warning' | 'error'
}
```

#### Analiz adımları

1. Notaları `measureNumber`'a göre grupla
2. Her ölçü için `beats` toplamını hesapla
3. Zaman işaretine göre beklenen vuruş sayısını bul (`TIME_SIGNATURES`)
4. Eksik/fazla vuruşları tespit et
5. Her nota için `beatNumber` hesapla (1, 2, 3, 4...)
6. `startBeat`'i doğrula — önceki notanın bitişiyle uyuşmalı
7. Tekrar işaretlerini işle (`repeatStart`, `repeatEnd`)

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | Zenginleştirilmiş notaları alır, `beatNumber` ekler |
| Turkish Rhythmic Text Generator | `beatNumber` ve `measureInfo`'yu metin üretiminde kullanır |
| MIDI Generator | `tempo` ve `startBeat`'i MIDI zamanlaması için kullanır |
| Voice Generator | `tempo` ve `beats`'i ses süresi için kullanır |
| Teacher Correction Engine | Ritim sorunlarını öğretmen düzeltme önerileri için kullanır |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Boş nota listesi | `{ notes: [], measures: [], issues: [] }` |
| Bilinmeyen zaman işareti | `issues`'a `unknown_time_signature` eklenir, varsayılan 4/4 |
| Eksik ölçü (toplam < beklenen) | `issues`'a `incomplete_measure` (warning) eklenir |
| Fazla ölçü (toplam > beklenen) | `issues`'a `overfull_measure` (error) eklenir |
| `startBeat` tutarsızlığı | Otomatik düzeltme, `issues`'a log |

---

### 4.4 TAB Analyzer

**Mevcut dosya:** `tabParser.js`

#### Görevi

ASCII guitar tab'ı parse eder. Sütun bazlı okuma yapar — her sütun bir zaman
anını temsil eder. Aynı sütunda birden fazla telde nota varsa akor olarak
tanımlar. Tab verisinden NoteObject üretir veya mevcut NoteObject'lerin
tel/perde bilgisini doğrular/düzeltir.

İki modda çalışır:
1. **Standalone:** Sadece tab metninden NoteObject[] üretir
2. **Validation:** MusicXML'den gelen notaların tel/perde bilgisini tab ile
   karşılaştırır ve düzeltir

#### Girdi verisi

```typescript
interface TabAnalyzerInput {
  tabText?: string           // Standalone mod: ASCII tab metni
  notes?: NoteObject[]       // Validation modu: doğrulanacak notalar
  mode: 'standalone' | 'validation'
}
```

#### Çıktı verisi

```typescript
interface TabAnalyzerOutput {
  notes: NoteObject[]        // Tab'dan üretilen veya düzeltilmiş notalar
  chords: ChordGroup[]       // Aynı sütundaki nota grupları
  corrections: TabCorrection[]  // Validation modunda yapılan düzeltmeler
}

interface ChordGroup {
  column: number             // Tab sütun indeksi
  notes: NoteObject[]        // Aynı anda çalınan notalar
  isChord: boolean           // 2+ nota varsa true
}

interface TabCorrection {
  noteIndex: number
  originalString: string
  originalFret: number
  correctedString: string
  correctedFret: number
  reason: string
}
```

#### Analiz adımları

1. Tab metnini satırlara böl, her satırı parse et (`parseTabLine`)
2. Satırları 6'lı bloklara grupla (`groupBlocks`)
3. Her blokta sütun bazlı okuma yap (`blockToPhrases`)
4. Her sütundaki notaları NoteObject'e dönüştür
5. Aynı sütunda 2+ nota varsa `isChord = true` işaretle
6. Validation modunda: MusicXML notalarının tel/perde bilgisini tab ile
   karşılaştır, uyumsuzluk varsa düzelt

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| MusicXML Parser | Parser'da technical bilgi yoksa, TAB Analyzer devreye girer |
| Note Object Builder | Tab'dan üretilen notalar Builder'a gider |
| Chord Analyzer | `chords` çıktısı Chord Analyzer'a gider |
| Teacher Correction Engine | Tab düzeltmeleri öğretmen onayına sunulur |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Geçersiz tab formatı | Boş `notes` array döner |
| 6 satırdan az tel | Eksik teller atlanır, uyarı loglanır |
| Çok haneli perde (10, 12) | Tek nota olarak işlenir |
| Hizalanmamış sütunlar | Sütun indeksine göre zaman atanır |
| Boş tab metni | `{ notes: [], chords: [], corrections: [] }` |

---

### 4.5 Chord Analyzer

**Mevcut dosya:** Yok (yeni modül)

#### Görevi

Nota listesindeki akorları tespit eder ve isimlendirir. Aynı `startBeat` ve
`measure` içindeki notaları gruplar. Akor kök notasını, türünü (majör, minör,
7'li, vb.) ve tam adını (örn. "Am", "G7", "Cmaj7") belirler. Akor üyelerini
`chordNotes` alanına yazar.

#### Girdi verisi

```typescript
interface ChordAnalyzerInput {
  notes: NoteObject[]     // Builder'dan gelen notalar
  chords?: ChordGroup[]   // TAB Analyzer'dan gelen akor grupları (opsiyonel)
}
```

#### Çıktı verisi

```typescript
interface ChordAnalyzerOutput {
  notes: NoteObject[]     // isChord, chordName, chordNotes güncellenmiş notalar
  chords: ChordInfo[]     // Tespit edilen akorların listesi
}

interface ChordInfo {
  measure: number
  startBeat: number
  chordName: string       // 'Am', 'G7', 'Cmaj7', 'F#m7b5'
  rootNote: string        // 'A', 'G', 'C'
  chordType: string       // 'major', 'minor', 'dominant7', 'maj7', 'm7'
  notes: NoteObject[]     // Akoru oluşturan notalar
  inversion: number       // 0 = root position, 1 = 1st inversion, vb.
}
```

#### Analiz adımları

1. Notaları `(measure, startBeat)` ikilisine göre grupla
2. Aynı grupta 2+ nota varsa akor adayı
3. Nota adlarından (noteName) pitch class'ları çıkar
4. Pitch class set'i bilinen akor pattern'leriyle karşılaştır:
   - Majör: {0, 4, 7} — C, E, G → "C"
   - Minör: {0, 3, 7} — A, C, E → "Am"
   - Dominant 7: {0, 4, 7, 10} — G, B, D, F → "G7"
   - Majör 7: {0, 4, 7, 11} — C, E, G, B → "Cmaj7"
5. Kök notası belirle (en düşük pitch class)
6. Akor adını üret: `rootNote + chordTypeSuffix`
7. `isChord = true`, `chordName`, `chordNotes` alanlarını doldur

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | `isChord`, `chordName`, `chordNotes` alanlarını doldurur |
| TAB Analyzer | TAB'dan gelen `chords` gruplarını kullanabilir |
| Turkish Rhythmic Text Generator | Akor adını metne ekler ("Am akoru") |
| MIDI Generator | Akor notalarını aynı anda çalar |
| Voice Generator | Akor adını sesli okur |
| Teacher Correction Engine | Yanlış akor tespitlerini öğretmene sunar |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Tek nota (akor değil) | `isChord = false`, atlanır |
| 2 nota (interval) | `isChord = true`, akor adı belirsiz, `chordName = null` |
| Bilinmeyen pitch class set | `chordName = null`, `isChord = true` |
| Tüm notalar aynı pitch | Tek nota olarak işlenir |
| Sus işareti akor içinde | Sus atlanır, kalan notalarla akor analizi yapılır |

---

### 4.6 Turkish Rhythmic Text Generator

**Mevcut dosya:** `rhythmicTextGenerator.js`

#### Görevi

NoteObject[] dizisini Türkçe ritmik metne dönüştürür. Her ölçü için başlık,
her nota için bir satır üretir. Tel adı, perde, nota adı, süre ve vuruş
sayısını Türkçe olarak yazar. Akorları grup olarak yazar. Düşük güven
skorlu notaları işaretler.

İki çıktı formatı destekler:
1. **Plain text** — sesli okuma ve ekran gösterimi için
2. **HTML** — zengin biçimli gösterim için

#### Girdi verisi

```typescript
interface RhythmicTextGeneratorInput {
  notes: NoteObject[]     // Düzeltilmiş, zenginleştirilmiş notalar
  format?: 'text' | 'html'  // Çıktı formatı (varsayılan: 'text')
  includeSummary?: boolean  // Özet ekle (varsayılan: false)
}
```

#### Çıktı verisi

```typescript
interface RhythmicTextGeneratorOutput {
  text: string            // Türkçe ritmik metin (plain veya HTML)
  summary?: string        // "12 nota, 4 ölçü, 2 sus, 1 düşük güven"
}
```

#### Metin üretim formatı

```
Ölçü 1.
birinci tel açık tel, Mi notası, dörtlük nota, bir vuruş
ikinci tel birinci perde, Do notası, dörtlük nota, bir vuruş
üçüncü tel ikinci perde, La notası, ikilik nota, iki vuruş
dörtlük nota, sus, bir vuruş

Ölçü 2.
...
```

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | `noteName`, `durationName`, `stringLetter` kullanır |
| Rhythm Analyzer | `beatNumber` ve ölçü yapısını kullanır |
| Chord Analyzer | `chordName` varsa akor adını metne ekler |
| Teacher Correction Engine | Düzeltilmiş notalardan metin üretir |
| Voice Generator | Metin, sesli okuma için Voice Generator'a gider |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Boş nota listesi | "Henüz nota yok." döner |
| `noteName` eksik | Tel/perde bilgisinden hesaplanır, olmazsa "bilinmeyen nota" |
| `duration` eksik | Varsayılan "dörtlük nota" |
| `stringLetter` eksik | Tel bilgisi atlanır, sadece nota adı yazılır |
| `confidence < 0.5` | HTML modunda "kontrol gerekiyor" etiketi eklenir |

---

### 4.7 MIDI Generator

**Mevcut dosya:** Yok (yeni modül)

#### Görevi

NoteObject[] dizisinden Standard MIDI File (SMF) üretir. Her notayı MIDI
event'ine dönüştürür: note-on, note-off, zamanlama, velocity. Tempo ve zaman
işareti meta event'lerini ekler. Akorları aynı anda çalar. Tekrar işaretlerini
MIDI'ye yansıtır.

#### Girdi verisi

```typescript
interface MidiGeneratorInput {
  notes: NoteObject[]     // Zenginleştirilmiş notalar
  tempo?: number          // BPM (varsayılan: 120)
  ppq?: number           // Pulses Per Quarter (varsayılan: 480)
  velocity?: number       // Note velocity 0-127 (varsayılan: 80)
}
```

#### Çıktı verisi

```typescript
interface MidiGeneratorOutput {
  midiData: Uint8Array    // Standard MIDI File binary data
  trackCount: number      // Kaç track üretildi
  noteCount: number       // Kaç nota MIDI'ye yazıldı
  durationSeconds: number  // Toplam süre (saniye)
  error?: string
}
```

#### MIDI üretim adımları

1. Header chunk: format=1 (multi-track), ntracks=2 (tempo track + note track)
2. Tempo track: tempo meta event, time signature meta event
3. Note track: her nota için:
   - `startBeat` → tick hesapla: `tick = startBeat * ppq`
   - `beats` → süre tick: `durationTick = beats * ppq`
   - Note-on event: `0x90, midiNote, velocity`
   - Note-off event: `0x80, midiNote, 0` (durationTick sonra)
4. Akorlar: aynı tick'te note-on, aynı tick'te note-off
5. Sus işaretleri: note event yok, sadece delta time ilerlet
6. Tekrar: tekrar bölümünü kopyala veya repeat meta event ekle
7. End of track meta event

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | `midi`, `frequency`, `beats` kullanır |
| Rhythm Analyzer | `tempo`, `startBeat`, `timeSignature` kullanır |
| Chord Analyzer | Akor notalarını aynı anda çalar |
| Teacher Correction Engine | Düzeltilmiş notalardan MIDI üretir |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Boş nota listesi | Boş MIDI dosyası (sadece header + end of track) |
| `midi` null | Atlanır, uyarı loglanır |
| `tempo` eksik | Varsayılan 120 BPM |
| `ppq` eksik | Varsayılan 480 |
| Çakışan notalar (aynı tick, aynı pitch) | İlk nota korunur, ikincisi atlanır |
| `beats` 0 veya negatif | Minimum 1 tick süre atanır |

---

### 4.8 Voice Generator

**Mevcut dosya:** `audio.js` (kısmi — `playNoteSequence`, `playWithMetronome`)

#### Görevi

Türkçe ritmik metni sesli okur ve notaları Web Audio API ile çalar. İki modu
vardır:
1. **Speech mode:** Turkish Rhythmic Text Generator'ın ürettiği metni
   `SpeechSynthesisUtterance` ile Türkçe sesli okur
2. **Tone mode:** Her notanın frekansını `OscillatorNode` ile çalar —
   gerçek nota sesi üretir

Ayrıca metronom desteği var: her vuruşta tik sesi çalar.

#### Girdi verisi

```typescript
interface VoiceGeneratorInput {
  text?: string            // Speech mode: okunacak Türkçe metin
  notes?: NoteObject[]     // Tone mode: çalınacak notalar
  mode: 'speech' | 'tone' | 'both'
  tempo?: number           // BPM (tone mode için)
  lang?: string            // Speech dili (varsayılan: 'tr-TR')
  rate?: number            // Konuşma hızı (varsayılan: 1.0)
  pitch?: number           // Konuşma perdesi (varsayılan: 1.0)
  metronome?: boolean      // Metronom ekle (varsayılan: false)
}
```

#### Çıktı verisi

```typescript
interface VoiceGeneratorOutput {
  duration: number         // Toplam çalma süresi (saniye)
  isPlaying: boolean       // Çalıyor mu?
  error?: string
}

// Kontrol fonksiyonları
interface VoiceGeneratorControls {
  play(): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  seek(seconds: number): void
}
```

#### Çalma adımları

**Speech mode:**
1. Metni cümlelere böl
2. Her cümle için `SpeechSynthesisUtterance` oluştur
3. `lang = 'tr-TR'`, `rate`, `pitch` ayarla
4. `speechSynthesis.speak()` ile sırayla oku
5. Cümle aralarında kısa pause

**Tone mode:**
1. AudioContext oluştur (veya mevcut olanı kullan)
2. Her nota için:
   - `OscillatorNode` oluştur
   - `frequency.value = note.frequency`
   - `type = 'sine'` (veya enstrümana göre)
   - Envelope: attack, decay, sustain, release (ADSR)
   - Süre: `beats * (60 / tempo)` saniye
3. Akorlar: aynı anda başlat
4. Metronom: her vuruşta kısa tik (`OscillatorNode` + kısa envelope)

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Turkish Rhythmic Text Generator | Speech mode'da üretilen metni okur |
| Note Object Builder | Tone mode'da `frequency` ve `beats` kullanır |
| Rhythm Analyzer | `tempo` ve `beatNumber` kullanır |
| MIDI Generator | MIDI ile aynı zamanlama mantığını paylaşır |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Web Audio API desteklenmiyor | `error: 'Web Audio API desteklenmiyor'` |
| SpeechSynthesis desteklenmiyor | Tone mode'a fallback |
| `frequency` null | Atlanır, uyarı loglanır |
| `beats` 0 | Minimum 0.1 saniye süre |
| AudioContext suspended | `resume()` çağrılır |
| Çalma sırasında stop | Tüm oscillator'lar durdurulur |

---

### 4.9 Teacher Correction Engine

**Mevcut dosya:** Yok (yeni modül)

#### Görevi

Öğretmenin nota düzeltmelerini (corrections) NoteObject[]'ye uygular.
Öğretmen, OMR sonucunu inceledikten sonra yanlış tel/perde, yanlış süre veya
yanlış nota adı düzeltmesi yapabilir. Bu modül düzeltmeleri uygular ve
sonucu öğrenci session'ı için hazırlar.

Ayrıca otomatik düzeltme önerileri üretir: düşük güven skorlu notalar için
olası düzeltmeleri tespit eder.

#### Girdi verisi

```typescript
interface TeacherCorrectionInput {
  notes: NoteObject[]         // OMR'dan gelen orijinal notalar
  corrections: Correction[]   // Öğretmenin manuel düzeltmeleri
  autoSuggest?: boolean        // Otomatik düzeltme önerisi üret (varsayılan: true)
}

interface Correction {
  noteIndex: number            // Hangi nota düzeltiliyor
  type: 'fret' | 'string' | 'duration' | 'noteName' | 'delete' | 'insert'
  originalValue?: any           // Orijinal değer
  correctedValue: any          // Yeni değer
  reason?: string               // Düzeltme nedeni
}
```

#### Çıktı verisi

```typescript
interface TeacherCorrectionOutput {
  notes: NoteObject[]          // Düzeltilmiş notalar
  appliedCorrections: Correction[]   // Uygulanan düzeltmeler
  rejectedCorrections: RejectedCorrection[]  // Reddedilen düzeltmeler
  suggestions: Suggestion[]    // Otomatik öneriler (autoSuggest=true ise)
}

interface RejectedCorrection {
  correction: Correction
  reason: string               // Neden reddedildi
}

interface Suggestion {
  noteIndex: number
  type: 'low_confidence' | 'rhythm_issue' | 'chord_mismatch'
  message: string
  suggestedValue?: any
  confidence: number           // Öneri güven skoru
}
```

#### Düzeltme adımları

1. Corrections'ları `noteIndex`'e göre sırala
2. Her correction için:
   - Nota var mı? Yoksa `rejectedCorrections`'a ekle
   - `type`'a göre ilgili alanı güncelle:
     - `fret`: `fret`, `noteName`, `frequency`, `midi` yeniden hesapla
     - `string`: `stringLetter`, `stringNumber`, `noteName`, `frequency`, `midi` yeniden hesapla
     - `duration`: `duration`, `beats`, `durationName` yeniden hesapla
     - `noteName`: `noteName` güncelle, `frequency`/`midi` yeniden hesapla
     - `delete`: notayı array'den çıkar
     - `insert`: yeni nota ekle (Note Object Builder ile)
   - Düzeltme sonrası Note Object Builder'ı çağırarak zenginleştir
3. `autoSuggest = true` ise:
   - `confidence < 0.5` olan notalar için `low_confidence` önerisi
   - Rhythm Analyzer'dan gelen `issues` için `rhythm_issue` önerisi
   - Chord Analyzer'dan gelen uyumsuzluklar için `chord_mismatch` önerisi
4. Düzeltilmiş notaları döndür

#### Diğer modüllerle ilişkisi

| Modül | İlişki |
|-------|--------|
| Note Object Builder | Düzeltme sonrası notaları yeniden zenginleştirir |
| Rhythm Analyzer | Ritim sorunlarını öneri olarak kullanır |
| Chord Analyzer | Akor uyumsuzluklarını öneri olarak kullanır |
| TAB Analyzer | Tab düzeltmelerini alır |
| Turkish Rhythmic Text Generator | Düzeltilmiş notalardan metin üretir |
| MIDI Generator | Düzeltilmiş notalardan MIDI üretir |
| Voice Generator | Düzeltilmiş notaları çalar |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| `noteIndex` out of bounds | `rejectedCorrections`'a eklenir |
| `type` bilinmiyor | `rejectedCorrections`'a eklenir |
| `correctedValue` geçersiz | `rejectedCorrections`'a eklenir |
| Aynı nota için çakışan corrections | İlk correction uygulanır, diğerleri reddedilir |
| `delete` sonrası boş ölçü | Uyarı loglanır, nota korunur |

---

## 5. Tam Veri Akış Diyagramı

### 5.1 Ana Pipeline

```
MusicXML (string)
    │
    ▼
┌─────────────────────────────────┐
│  1. MusicXML Parser             │
│  (musicXmlParser.js)            │
│  XML → ham nota verileri        │
└─────────────┬───────────────────┘
              │ NoteObject[] (ham)
              ▼
┌─────────────────────────────────┐
│  2. Note Object Builder         │
│  (noteTheory.js — createNote)    │
│  Eksik alanları hesapla:        │
│  noteName, frequency, midi,     │
│  beats, durationName            │
└─────────────┬───────────────────┘
              │ NoteObject[] (zenginleştirilmiş)
              ├─────────────────────────┐
              │                         │
              ▼                         ▼
┌─────────────────────┐    ┌─────────────────────┐
│  3. Rhythm Analyzer │    │  4. TAB Analyzer    │
│  (yeni)             │    │  (tabParser.js)     │
│  Ölçü yapısı,       │    │  Tab'dan tel/perde  │
│  vuruş numaraları,  │    │  doğrulama/düzeltme │
│  tempo, zaman iş.   │    │                     │
└─────────┬───────────┘    └──────────┬──────────┘
          │                           │
          │      ┌────────────────────┘
          ▼      ▼
    ┌─────────────────────┐
    │  5. Chord Analyzer │
    │  (yeni)            │
    │  Akor tespiti ve   │
    │  isimlendirme      │
    └──────────┬──────────┘
               │ NoteObject[] (akor bilgisi eklenmiş)
               ▼
    ┌─────────────────────────┐
    │  6. Teacher Correction  │
    │  Engine (yeni)          │
    │  Öğretmen düzeltmeler  │
    │  + otomatik öneriler   │
    └──────────┬──────────────┘
               │ NoteObject[] (düzeltilmiş, son hali)
               ├──────────────┬──────────────┐
               ▼              ▼              ▼
    ┌──────────────┐  ┌────────────┐  ┌──────────────┐
    │ 7. Turkish   │  │ 8. MIDI    │  │ 9. Voice     │
    │ Rhythmic     │  │ Generator  │  │ Generator    │
    │ Text Gen.    │  │ (yeni)     │  │ (audio.js)   │
    │ (rhythmicText│  │            │  │              │
    │  Generator.js)│  │            │  │              │
    └──────────────┘  └────────────┘  └──────────────┘
         (text)         (binary)        (audio)
```

### 5.2 Detaylı Veri Akışı

```
MusicXML
    │
    │  parseMusicXml(xmlString)
    ▼
Parser ────────────────────────────────────────────────────┐
    │  { notes: [                                          │
    │    { measure: 1, string: 'G', fret: 2,              │
    │      duration: 'quarter', startBeat: 0,             │
    │      isRest: false, confidence: 0.85 }              │
    │  ]}                                                  │
    ▼                                                      │
Note Object Builder                                        │
    │  createNote() ile her nota zenginleştirilir:        │
    │  - noteName: 'La'  (noteName('G', 2))               │
    │  - frequency: 220.00  (noteFrequency('G', 2))       │
    │  - midi: 57  (noteToMidi('G', 2))                   │
    │  - beats: 1  (applyDots(1, 0))                     │
    │  - durationName: 'Dörtlük'                          │
    │  - stringNumber: 3  (STRING_NUMBER['G'])           │
    │  - octave: 3  (midiToOctave(57))                    │
    ▼                                                      │
Rhythm Analyzer                                            │
    │  - Notalar ölçüye göre gruplanır                   │
    │  - Her ölçün toplam vuruşu hesaplanır              │
    │  - beatNumber atanır (1, 2, 3, 4...)               │
    │  - Zaman işareti: 4/4 → 4 vuruş/ölçü               │
    │  - Tempo: 120 BPM                                   │
    │  - issues: [{ type: 'incomplete_measure', ... }]   │
    ▼                                                      │
TAB Analyzer (opsiyonel)                                   │
    │  - Eğer tab metni varsa:                            │
    │    Tab sütunları → zaman anları                     │
    │    Her sütun → nota grubu (akor?)                   │
    │  - MusicXML notaları ile tab karşılaştır            │
    │  - corrections: [{ noteIndex: 2,                    │
    │      originalFret: 2, correctedFret: 3, ... }]      │
    ▼                                                      │
Chord Analyzer                                             │
    │  - Aynı (measure, startBeat) notaları grupla        │
    │  - 2+ nota → akor adayı                             │
    │  - Pitch class set → akor türü                      │
    │  - {0, 4, 7} → majör → "C"                          │
    │  - {0, 3, 7} → minör → "Am"                        │
    │  - isChord=true, chordName='Am',                    │
    │    chordNotes=[...]                                  │
    ▼                                                      │
Teacher Correction Engine                                  │
    │  - corrections: [{ noteIndex: 1,                    │
    │      type: 'fret', correctedValue: 3,               │
    │      reason: 'Yanlış perde' }]                      │
    │  - Düzeltme uygula → Builder ile yeniden hesapla   │
    │  - suggestions: [{ noteIndex: 3,                    │
    │      type: 'low_confidence',                        │
    │      message: 'Düşük güven skoru' }]               │
    ▼                                                      │
NoteObject[] (düzeltilmiş, son hali)                       │
    │                                                      │
    ├──→ Turkish Rhythmic Text Generator                   │
    │       │  generateTurkishRhythmicText(notes)         │
    │       ▼                                              │
    │    "Ölçü 1.                                         │
    │     üçüncü tel ikinci perde, La notası,             │
    │     dörtlük nota, bir vuruş                         │
    │     ikinci tel birinci perde, Do notası,            │
    │     dörtlük nota, bir vuruş                          │
    │     birinci tel açık tel, Mi notası,                │
    │     ikilik nota, iki vuruş"                         │
    │                                                      │
    ├──→ MIDI Generator                                    │
    │       │  generateMidi(notes, tempo=120)             │
    │       ▼                                              │
    │    Uint8Array (Standard MIDI File)                  │
    │    - Header chunk (format=1, ntracks=2)              │
    │    - Tempo track (120 BPM, 4/4)                     │
    │    - Note track (note-on/off events)                │
    │                                                      │
    └──→ Voice Generator                                   │
            │  playNoteSequence(notes, tempo=120)         │
            │  + speechSynthesis(text)                    │
            ▼                                              │
         Audio output (Web Audio API)                     │
         - OscillatorNode ile nota sesleri                │
         - SpeechSynthesis ile Türkçe okuma               │
         - Metronom tik sesleri                            │
```

### 5.3 Öğretmen Onay Akışı (Pipeline'ın 6. adımında)

```
OMR Sonucu (NoteObject[])
    │
    ▼
Teacher Correction Engine
    │
    ├── 1. Manuel düzeltmeleri uygula
    │     corrections: [{ noteIndex: 2, type: 'fret',
    │         originalFret: 2, correctedFret: 3,
    │         reason: 'Yanlış perde' }]
    │     → fret=3, noteName='Sib', frequency=233.08,
    │       midi=58 (yeniden hesapla)
    │
    ├── 2. Otomatik öneri üret
    │     - confidence < 0.5 → "Düşük güven, kontrol et"
    │     - Rhythm issue → "Eksik vuruş, kontrol et"
    │     - Chord mismatch → "Akor uyumsuz, kontrol et"
    │
    ├── 3. Düzeltilmiş notaları Note Object Builder'a gönder
    │     → Tüm türevi alanlar yeniden hesaplanır
    │
    └── 4. Sonuç: NoteObject[] (düzeltilmiş)
          │
          ├──→ Turkish Rhythmic Text Generator
          │     → Öğrenci için ritmik metin
          │
          ├──→ MIDI Generator
          │     → Öğrenci için MIDI dosyası
          │
          └──→ Voice Generator
                → Öğrenci için sesli okuma
```

---

## 6. Enstrüman Genişletilebilirlik Stratejisi

Mevcut mimari gitar için tasarlanmıştır, ancak aşağıdaki strateji ile
piyano, keman ve diğer enstrümanlar eklenebilir.

### 6.1 Strategy Pattern

Her enstrüman, bir **InstrumentProfile** ile temsil edilir. Profile, o
enstrümana özgü tel/perde, tuş, akort ve pozisyon bilgilerini içerir.

```typescript
interface InstrumentProfile {
  id: string                    // 'guitar', 'piano', 'violin'
  name: string                  // 'Gitar', 'Piyano', 'Keman'
  family: 'string' | 'keyboard' | 'wind' | 'percussion'

  // Tel/perde enstrümanları için (gitar, keman, ukulele)
  strings?: StringConfig[]

  // Tuşlu enstrümanlar için (piyano)
  keys?: KeyConfig[]

  // Pozisyon hesaplama fonksiyonu
  pitchToPosition: (pitch: Pitch) => Position
  positionToPitch: (position: Position) => Pitch

  // Akor pozisyonları
  chordPositions?: ChordPositionMap
}

interface StringConfig {
  letter: string               // 'E', 'A', 'D', 'G', 'B', 'e'
  number: number               // 1-6
  openFrequency: number        // Hz
  openMidi: number             // MIDI note number
  openPitchClass: number       // 0-11
}

interface KeyConfig {
  midi: number                 // MIDI note number
  octave: number
  isBlackKey: boolean
}
```

### 6.2 Enstrüman Bazlı Modül Davranışı

| Modül | Gitar | Piyano | Keman |
|-------|-------|--------|-------|
| MusicXML Parser | `<technical>` ile tel/perde okur | `<pitch>` ile tuş okur | `<technical>` ile tel/perde okur |
| Note Object Builder | `string`, `fret` hesaplar | `key`, `octave` hesaplar | `string`, `fret` hesaplar |
| TAB Analyzer | ASCII tab parse eder | (kullanılmaz) | (gelecekte) |
| Chord Analyzer | Aynı | Aynı | Aynı |
| Turkish Rhythmic Text | "üçüncü tel ikinci perde" | "Do dörtlük" | "birinci tel ikinci perde" |
| MIDI Generator | Aynı | Aynı | Aynı |
| Voice Generator | Aynı | Aynı | Aynı |

### 6.3 Genişletme Yol Haritası

| Sürüm | Enstrüman | Etkilenen modüller |
|-------|-----------|-------------------|
| v1.0 | Gitar | Tümü (mevcut) |
| v1.1 | Piyano | Parser, Builder, Text Generator |
| v1.2 | Keman | Parser, Builder, TAB Analyzer |
| v2.0 | Ukulele, Bağlama | Builder, Text Generator |

---

## 7. Modül Bağımlılık Matrisi

| Modül ↓ \ Bağımlı → | Parser | Builder | Rhythm | TAB | Chord | Text | MIDI | Voice | Correction |
|---------------------|--------|---------|--------|-----|-------|------|------|-------|-----------|
| MusicXML Parser | — | ✓ | | | | | | | |
| Note Object Builder | ✓ | — | | | | | | | |
| Rhythm Analyzer | | ✓ | — | | | | | | |
| TAB Analyzer | | ✓ | | — | | | | | |
| Chord Analyzer | | ✓ | ✓ | ✓ | — | | | | |
| Turkish Rhythmic Text | | ✓ | ✓ | | ✓ | — | | | |
| MIDI Generator | | ✓ | ✓ | | ✓ | | — | | |
| Voice Generator | | ✓ | ✓ | | | ✓ | | — | |
| Teacher Correction | | ✓ | ✓ | ✓ | ✓ | | | | — |

**✓** = modül, diğer modülün çıktısını kullanır.

### Bağımlılık sırası (pipeline order)

```
1. MusicXML Parser        (bağımlılık: yok)
2. Note Object Builder    (bağımlılık: Parser)
3. Rhythm Analyzer        (bağımlılık: Builder)
   TAB Analyzer           (bağımlılık: Builder)  — paralel
4. Chord Analyzer         (bağımlılık: Builder, Rhythm, TAB)
5. Teacher Correction     (bağımlılık: Builder, Rhythm, TAB, Chord)
6. Turkish Text Generator (bağımlılık: Builder, Rhythm, Chord, Correction)
   MIDI Generator         (bağımlılık: Builder, Rhythm, Chord, Correction)  — paralel
   Voice Generator        (bağımlılık: Builder, Rhythm, Text, Correction)   — paralel
```

---

## 8. Ortak Veri Modelleri

### 8.1 NoteObject (tam şema)

NoteObject, tüm modüller arası iletişimin tek veri modelidir. Mevcut
`noteTheory.js`'teki `createNote()` fonksiyonu ile üretilir.

```typescript
interface NoteObject {
  // --- Konum ---
  measureNumber: number        // Ölçü numarası (1, 2, 3, ...)
  startBeat: number            // Ölçü içindeki başlangıç (vuruş)
  beatNumber: number           // Vuruş numarası (1-4 in 4/4)

  // --- Süre ---
  duration: string             // 'whole', 'half', 'quarter', 'eighth', ...
  durationName: string          // 'Birlik', 'İkilik', 'Dörtlük', ...
  beats: number                // Kaç vuruş tuttuğu
  dotCount: number             // Noktalı nota (0, 1, 2)

  // --- Perde ---
  noteName: string             // 'Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'
  octave: number               // 2, 3, 4, 5, 6
  accidental: string | null    // 'sharp', 'flat', 'natural', null
  accidentalLabel: string      // 'diyez', 'bemol', ''
  frequency: number | null     // Hz
  midi: number | null          // 0-127

  // --- Gitar Pozisyonu ---
  stringNumber: number         // 1-6 (e=1, E=6)
  stringLetter: string         // 'e', 'B', 'G', 'D', 'A', 'E'
  fret: number                 // 0-24

  // --- MusicXML ---
  voice: number                // Çok sesli müzikte voice
  staff: number                // Staff 1 = TAB, 2 = standard

  // --- Artikülasyon ---
  tie: { start: boolean, end: boolean } | null
  slur: { start: boolean, end: boolean, number: number } | null
  staccato: boolean
  accent: boolean

  // --- Sus ---
  isRest: boolean
  restType: string | null

  // --- Akor ---
  isChord: boolean
  chordName: string | null     // 'Am', 'G7', 'Cmaj7'
  chordNotes: NoteObject[] | null

  // --- Tempo & Zaman ---
  tempo: number                // BPM
  timeSignature: string        // '4/4', '3/4', '6/8'

  // --- Tekrar ---
  repeatStart: boolean
  repeatEnd: boolean
  repeatTimes: number

  // --- Güven (OMR) ---
  confidence: number           // 0.0 - 1.0
  confidenceReason: string

  // --- Sayfa ---
  page: number

  // --- Debug ---
  _raw: any | null
}
```

### 8.2 Correction

```typescript
interface Correction {
  noteIndex: number            // Hangi nota düzeltiliyor
  type: 'fret' | 'string' | 'duration' | 'noteName' | 'delete' | 'insert'
  originalValue?: any
  correctedValue: any
  reason?: string
}
```

### 8.3 ChordInfo

```typescript
interface ChordInfo {
  measure: number
  startBeat: number
  chordName: string
  rootNote: string
  chordType: string            // 'major', 'minor', 'dominant7', 'maj7', 'm7'
  notes: NoteObject[]
  inversion: number            // 0 = root position
}
```

---

## 9. Hata Yönetim Stratejisi

### 9.1 Hata Sınıflandırması

| Sınıf | Örnek | Davranış |
|-------|-------|----------|
| **Fatal** | Geçersiz XML, boş input | Pipeline durur, error döner |
| **Recoverable** | Eksik pitch, bilinmeyen duration | Varsayılan değer, nota korunur |
| **Warning** | Düşük güven, eksik ölçü | `issues`'a eklenir, pipeline devam eder |
| **Validation** | measureNumber < 1, fret < 0 | `validationErrors`'a eklenir, nota korunur |

### 9.2 Hata Yayılımı

```
Parser hatası (fatal)
    → Pipeline durur
    → { notes: [], error: '...' }

Builder hatası (validation)
    → Nota korunur, validationErrors'a eklenir
    → Pipeline devam eder

Rhythm Analyzer hatası (warning)
    → issues'a eklenir
    → Pipeline devam eder

Chord Analyzer hatası (recoverable)
    → isChord=false, chordName=null
    → Pipeline devam eder

Teacher Correction hatası (validation)
    → rejectedCorrections'a eklenir
    → Pipeline devam eder

MIDI Generator hatası (fatal)
    → { midiData: null, error: '...' }

Voice Generator hatası (recoverable)
    → Tone mode'a fallback
    → Pipeline devam eder
```

### 9.3 Hata Kodları

| Code | Modül | Severity |
|------|-------|----------|
| `PARSE_ERROR` | Parser | fatal |
| `VALIDATION_ERROR` | Builder | validation |
| `RHYTHM_ISSUE` | Rhythm Analyzer | warning |
| `TAB_PARSE_ERROR` | TAB Analyzer | recoverable |
| `CHORD_UNKNOWN` | Chord Analyzer | recoverable |
| `CORRECTION_REJECTED` | Teacher Correction | validation |
| `MIDI_GENERATION_ERROR` | MIDI Generator | fatal |
| `AUDIO_ERROR` | Voice Generator | recoverable |

---

## 10. Özet

ST Music Engine, 9 modülden oluşan bir pipeline'dır:

1. **MusicXML Parser** — XML'i ham notalara dönüştürür
2. **Note Object Builder** — Ham notaları zenginleştirir (nota teorisi)
3. **Rhythm Analyzer** — Ritmik yapıyı analiz eder
4. **TAB Analyzer** — ASCII tab'ı parse eder, doğrular
5. **Chord Analyzer** — Akorları tespit eder ve isimlendirir
6. **Turkish Rhythmic Text Generator** — Türkçe ritmik metin üretir
7. **MIDI Generator** — Standard MIDI File üretir
8. **Voice Generator** — Sesli okuma ve nota çalma
9. **Teacher Correction Engine** — Öğretmen düzeltmelerini uygular

Tüm modüller **NoteObject** veri modeli üzerinden iletişim kurar. Mimari,
strategy pattern ile gitar, piyano, keman ve diğer enstrümanları
destekleyecek şekilde genişletilebilir. Hiçbir modülün kodu bu dokümanda
değiştirilmemiştir — sadece mimari tasarım oluşturulmuştur.
