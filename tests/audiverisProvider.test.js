// Focused tests for AudiverisProvider and provider selection.
// Uses Node's built-in test runner with mocked child_process.spawn.
// No real Audiveris installation is required.
// Run with: node --test tests/audiverisProvider.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

import {
  createAudiverisProvider,
  parseConfig,
  parseTimeout,
  parseExtraArgs,
  extractMxl,
  isPathSafe,
  safeFileName,
  VALID_EXTENSIONS,
  MAX_UNCOMPRESSED_XML,
} from '../backend/providers/AudiverisProvider.js'
import { validateMusicXml } from '../backend/providers/HttpOmrProvider.js'

const SAMPLE_PARTWISE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const SAMPLE_TIMEWISE = `<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list></score-timewise>`

const VALID_PDF = Buffer.from('%PDF-1.4\nfake PDF content\n%%EOF')

// ── Mock spawn helpers ────────────────────────────────────────

function makeMockSpawn(opts = {}) {
  const calls = []
  const mockSpawn = (command, args, timeoutMs, abortSignal) => {
    return new Promise((resolve, reject) => {
      calls.push({ command, args, timeoutMs })
      const outputDir = args[args.indexOf('-output') + 1]

      if (opts.beforeSpawn) opts.beforeSpawn({ command, args, outputDir, calls })

      if (opts.hang) {
        // Never resolves until abort
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            if (opts.abortRejectsAsCanceled) reject(makeErr('CANCELED', 'İşlem iptal edildi.'))
            else reject(new Error('aborted'))
          })
        }
        return
      }

      if (opts.launchError) {
        const err = new Error(opts.launchError)
        err.code = opts.launchErrorCode || 'ENOENT'
        reject(err)
        return
      }

      if (opts.spawnThrow) {
        throw new Error(opts.spawnThrow)
      }

      // Simulate successful process — write output files
      setTimeout(async () => {
        try {
          await fs.mkdir(outputDir, { recursive: true })
          if (opts.writeFiles) {
            await opts.writeFiles(outputDir)
          } else {
            await fs.writeFile(path.join(outputDir, 'output.musicxml'), SAMPLE_PARTWISE)
          }
          resolve({ stdout: opts.stdout || '', stderr: opts.stderr || '' })
        } catch (e) {
          reject(e)
        }
      }, opts.delay || 10)
    })
  }
  return { mockSpawn, calls }
}

function makeErr(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

async function makeMxlBuffer(xmlContent = SAMPLE_PARTWISE) {
  const zip = new JSZip()
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>`)
  zip.file('score.xml', xmlContent)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function makeAmbiguousMxlBuffer() {
  const zip = new JSZip()
  zip.file('score1.xml', SAMPLE_PARTWISE)
  zip.file('score2.xml', '<score-partwise version="4.0"/>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function makeNoContainerMxlBuffer(xmlContent = SAMPLE_PARTWISE) {
  const zip = new JSZip()
  zip.file('score.xml', xmlContent)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function makeTraversalMxlBuffer() {
  const zip = new JSZip()
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="../escape.xml"/></rootfiles></container>`)
  zip.file('../escape.xml', SAMPLE_PARTWISE)
  return zip.generateAsync({ type: 'nodebuffer' })
}

function makeProvider(opts = {}, deps = {}) {
  return createAudiverisProvider(
    {
      command: opts.command ?? 'audiveris',
      timeoutMs: opts.timeoutMs ?? 110000,
      extraArgs: opts.extraArgs ?? [],
    },
    deps
  )
}

// ── Tests ─────────────────────────────────────────────────────

describe('AudiverisProvider contract and selection', () => {
  test('1. Implements IOmrProvider contract', () => {
    const p = makeProvider()
    assert.equal(typeof p.uploadPdf, 'function')
    assert.equal(typeof p.analyzePdf, 'function')
    assert.equal(typeof p.getStatus, 'function')
    assert.equal(typeof p.downloadMusicXML, 'function')
  })

  test('2. OMR_PROVIDER=audiveris selects AudiverisProvider', async () => {
    const orig = process.env.OMR_PROVIDER
    process.env.OMR_PROVIDER = 'audiveris'
    const mod = await import('../backend/providers/index.js?t=' + Date.now() + 'au1')
    assert.equal(mod.getProviderName(), 'audiveris')
    process.env.OMR_PROVIDER = orig
  })

  test('3. MockProvider remains default', async () => {
    const orig = process.env.OMR_PROVIDER
    delete process.env.OMR_PROVIDER
    const mod = await import('../backend/providers/index.js?t=' + Date.now() + 'au2')
    assert.equal(mod.getProviderName(), 'mock')
    process.env.OMR_PROVIDER = orig
  })
})

describe('AudiverisProvider command construction', () => {
  test('4. Correct arguments passed as array', async () => {
    const { mockSpawn, calls } = makeMockSpawn()
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, 'audiveris')
    const a = calls[0].args
    assert.ok(a.includes('-batch'))
    assert.ok(a.includes('-transcribe'))
    assert.ok(a.includes('-export'))
    assert.ok(a.includes('-output'))
    assert.ok(a.includes('--'))
    assert.ok(a.some((arg) => typeof arg === 'string' && arg.endsWith('test.pdf')))
  })

  test('5. Shell mode is never enabled', async () => {
    const { mockSpawn, calls } = makeMockSpawn()
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    // The mock spawn receives args as array; the real runAudiveris uses shell: false
    // We verify the args are an array, not a string
    assert.ok(Array.isArray(calls[0].args), 'Args must be array')
  })

  test('6. Input paths with spaces remain safe', async () => {
    const { mockSpawn, calls } = makeMockSpawn()
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'my file with spaces.pdf')
    await p.analyzePdf(up.providerJobId)
    const inputArg = calls[0].args.find((a) => typeof a === 'string' && a.includes('my_file_with_spaces.pdf'))
    assert.ok(inputArg, 'Filename should be sanitized')
    assert.ok(!inputArg.includes(' '), 'No spaces in sanitized filename')
  })

  test('6b. Extra args are passed as separate array elements', async () => {
    const { mockSpawn, calls } = makeMockSpawn()
    const p = makeProvider({ extraArgs: ['-verbose', '-print'] }, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    assert.ok(calls[0].args.includes('-verbose'))
    assert.ok(calls[0].args.includes('-print'))
  })
})

describe('AudiverisProvider successful output', () => {
  test('7. .musicxml output accepted', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.musicxml'), SAMPLE_PARTWISE)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
    assert.equal(an.status, 'completed')
  })

  test('8. Plain .xml output accepted', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'result.xml'), SAMPLE_PARTWISE)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
  })

  test('9. Valid .mxl output extracted', async () => {
    const mxlBuf = await makeMxlBuffer()
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.mxl'), mxlBuf)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
    const dl = await p.downloadMusicXML(up.providerJobId)
    assert.ok(dl.musicXml.includes('<score-partwise'))
  })

  test('10. META-INF/container.xml root-file selection', async () => {
    const mxlBuf = await makeMxlBuffer(SAMPLE_TIMEWISE)
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.mxl'), mxlBuf)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    const dl = await p.downloadMusicXML(up.providerJobId)
    assert.ok(dl.musicXml.includes('<score-timewise'), 'Should extract root-file from container.xml')
  })

  test('11. Valid score-partwise accepted', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'out.xml'), SAMPLE_PARTWISE)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
  })

  test('12. Valid score-timewise accepted', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'out.xml'), SAMPLE_TIMEWISE)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
  })
})

describe('AudiverisProvider error handling', () => {
  test('13. Missing executable handled safely', async () => {
    const customSpawn = () => Promise.reject(makeErr('ENOENT', 'not found'))
    const p = makeProvider({}, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'EXECUTABLE_NOT_FOUND')
  })

  test('14. Process launch failure handled safely', async () => {
    const customSpawn = () => Promise.reject(makeErr('EACCES', 'spawn error'))
    const p = makeProvider({}, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'SPAWN_ERROR')
  })

  test('15. Non-zero exit code handled safely', async () => {
    const { mockSpawn } = makeMockSpawn({
      hang: false,
      writeFiles: null,
    })
    // Custom mock that rejects with NONZERO_EXIT
    const customSpawn = () => Promise.reject(makeErr('NONZERO_EXIT', 'Audiveris işlemi başarısız oldu.'))
    const p = makeProvider({}, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'NONZERO_EXIT')
  })

  test('16. Exit code zero without output rejected', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async () => {}, // No files written
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'NO_OUTPUT')
  })

  test('17. Empty output rejected', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'empty.xml'), '')
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.match(an.error.code, /EMPTY|NO_OUTPUT/)
  })

  test('18. Invalid XML rejected', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'bad.xml'), 'this is not xml')
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'INVALID_XML')
  })

  test('19. Non-MusicXML XML rejected', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'bad.xml'), '<?xml version="1.0"?><foo><bar/></foo>')
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'NON_MUSICXML')
  })

  test('20. Invalid .mxl ZIP rejected', async () => {
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.mxl'), Buffer.from('not a zip file'))
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'INVALID_MXL')
  })

  test('21. ZIP path traversal entries rejected', async () => {
    const traversalBuf = await makeTraversalMxlBuffer()
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.mxl'), traversalBuf)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.match(an.error.code, /INVALID_MXL|AMBIGUOUS/)
  })

  test('22. Ambiguous MusicXML candidates rejected', async () => {
    const ambiguousBuf = await makeAmbiguousMxlBuffer()
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'output.mxl'), ambiguousBuf)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'AMBIGUOUS_MXL')
  })

  test('23. Oversized extracted XML rejected', async () => {
    const bigXml = '<score-partwise version="4.0">' + 'x'.repeat(MAX_UNCOMPRESSED_XML + 1) + '</score-partwise>'
    const { mockSpawn } = makeMockSpawn({
      writeFiles: async (dir) => {
        await fs.writeFile(path.join(dir, 'big.xml'), bigXml)
      },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'OVERSIZED_XML')
  })
})

describe('AudiverisProvider timeout and cancellation', () => {
  test('24. Timeout terminates the process', async () => {
    const customSpawn = (_cmd, _args, _timeout, abortSignal) => {
      return new Promise((_, reject) => {
        if (abortSignal) abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    const p = makeProvider({ timeoutMs: 50 }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'TIMEOUT')
  })

  test('25. Cancellation terminates the process', async () => {
    const customSpawn = (_cmd, _args, _timeout, abortSignal) => {
      return new Promise((_, reject) => {
        if (abortSignal) abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    const p = makeProvider({ timeoutMs: 30000 }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const analyzePromise = p.analyzePdf(up.providerJobId)
    setTimeout(() => p.cancelJob(up.providerJobId), 10)
    const an = await analyzePromise
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'CANCELED')
  })

  test('26. Canceled jobs cannot later become completed', async () => {
    const customSpawn = (_cmd, _args, _timeout, abortSignal) => {
      return new Promise((_, reject) => {
        if (abortSignal) abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    const p = makeProvider({ timeoutMs: 30000 }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const analyzePromise = p.analyzePdf(up.providerJobId)
    setTimeout(() => p.cancelJob(up.providerJobId), 10)
    await analyzePromise
    const st = await p.getStatus(up.providerJobId)
    assert.equal(st.status, 'failed')
  })

  test('27. Timed-out jobs cannot later become completed', async () => {
    const customSpawn = (_cmd, _args, _timeout, abortSignal) => {
      return new Promise((_, reject) => {
        if (abortSignal) abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    const p = makeProvider({ timeoutMs: 50 }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    const st = await p.getStatus(up.providerJobId)
    assert.equal(st.status, 'failed')
  })
})

describe('AudiverisProvider temp file cleanup', () => {
  test('28. Temp files cleaned after success', async () => {
    let capturedDir
    const { mockSpawn } = makeMockSpawn({
      beforeSpawn: ({ outputDir }) => { capturedDir = path.dirname(outputDir) },
    })
    const p = makeProvider({}, { spawn: mockSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    const exists = await fs.access(capturedDir).then(() => true).catch(() => false)
    assert.equal(exists, false, 'Temp dir should be cleaned')
  })

  test('29. Temp files cleaned after failure', async () => {
    let capturedDir
    const customSpawn = (command, args) => {
      capturedDir = path.dirname(args[args.indexOf('-output') + 1])
      return Promise.reject(makeErr('NONZERO_EXIT', 'failed'))
    }
    const p = makeProvider({}, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    const exists = await fs.access(capturedDir).then(() => true).catch(() => false)
    assert.equal(exists, false, 'Temp dir should be cleaned after failure')
  })

  test('30. Temp files cleaned after cancellation', async () => {
    let capturedDir
    const customSpawn = (_cmd, args, _timeout, abortSignal) => {
      capturedDir = path.dirname(args[args.indexOf('-output') + 1])
      return new Promise((_, reject) => {
        if (abortSignal) abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    const p = makeProvider({ timeoutMs: 30000 }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const analyzePromise = p.analyzePdf(up.providerJobId)
    setTimeout(() => p.cancelJob(up.providerJobId), 10)
    await analyzePromise
    const exists = await fs.access(capturedDir).then(() => true).catch(() => false)
    assert.equal(exists, false, 'Temp dir should be cleaned after cancel')
  })
})

describe('AudiverisProvider user-facing error protection', () => {
  test('31. Full paths and process output absent from errors', async () => {
    const customSpawn = (command, args) => {
      return Promise.reject(makeErr('NONZERO_EXIT', 'Audiveris işlemi başarısız oldu.'))
    }
    const p = makeProvider({ command: '/usr/local/bin/audiveris' }, { spawn: customSpawn })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    const errStr = JSON.stringify(an.error)
    assert.ok(!errStr.includes('/usr/local'), 'No internal paths in error')
    assert.ok(!errStr.includes('--batch'), 'No process args in error')
    assert.equal(an.error.code, 'NONZERO_EXIT')
  })
})

describe('AudiverisProvider config parsing', () => {
  test('Config parsing defaults', () => {
    const c = parseConfig({})
    assert.equal(c.command, 'audiveris')
    assert.equal(c.timeoutMs, 110000)
    assert.deepEqual(c.extraArgs, [])
  })

  test('Timeout parsing', () => {
    assert.equal(parseTimeout(undefined), 110000)
    assert.equal(parseTimeout(''), 110000)
    assert.equal(parseTimeout('abc'), 110000)
    assert.equal(parseTimeout('-5'), 110000)
    assert.equal(parseTimeout('0'), 110000)
    assert.equal(parseTimeout('50000'), 50000)
    assert.equal(parseTimeout('999999'), 600000)
  })

  test('Extra args parsing', () => {
    assert.deepEqual(parseExtraArgs(undefined), [])
    assert.deepEqual(parseExtraArgs(''), [])
    assert.deepEqual(parseExtraArgs('-verbose -print'), ['-verbose', '-print'])
    assert.deepEqual(parseExtraArgs('  -a   -b  '), ['-a', '-b'])
  })

  test('safeFileName sanitizes', () => {
    assert.equal(safeFileName('normal.pdf'), 'normal.pdf')
    assert.equal(safeFileName('my file.pdf'), 'my_file.pdf')
    assert.equal(safeFileName(''), 'input.pdf')
  })

  test('isPathSafe blocks traversal', () => {
    assert.equal(isPathSafe('score.xml'), true)
    assert.equal(isPathSafe('META-INF/container.xml'), true)
    assert.equal(isPathSafe('../escape.xml'), false)
    assert.equal(isPathSafe('/etc/passwd'), false)
    assert.equal(isPathSafe('foo/../bar.xml'), false)
  })
})

describe('AudiverisProvider .mxl extraction helpers', () => {
  test('extractMxl with container.xml', async () => {
    const buf = await makeMxlBuffer()
    const xml = await extractMxl(buf)
    assert.ok(xml.includes('<score-partwise'))
  })

  test('extractMxl without container.xml — single candidate', async () => {
    const buf = await makeNoContainerMxlBuffer()
    const xml = await extractMxl(buf)
    assert.ok(xml.includes('<score-partwise'))
  })

  test('extractMxl without container.xml — ambiguous', async () => {
    const buf = await makeAmbiguousMxlBuffer()
    await assert.rejects(extractMxl(buf), (err) => err.code === 'AMBIGUOUS_MXL')
  })

  test('extractMxl invalid zip', async () => {
    await assert.rejects(extractMxl(Buffer.from('not zip')), (err) => err.code === 'INVALID_MXL')
  })
})
