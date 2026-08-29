#!/usr/bin/env node
// Package 8B-T6 isolated acceptance runner.
//
// This runner must be pointed at a separate, clean checkout of the exact pinned
// Audiveris revision. It temporarily adds one bounded JUnit probe to that
// checkout, invokes the real SampleRepository.getInstance(Path,true) API, and
// emits evidence inputs for audiverisMuscimaPinnedNativeSerializer.js.
// It never trains a classifier or modifies SesliTab production runtime/deploys.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { AUDIVERIS_PINNED_ACCEPTANCE_PROBE, AUDIVERIS_PINNED_REVISION } from './audiverisMuscimaPinnedNativeSerializer.js'

function fail(message) {
  console.error(message)
  process.exitCode = 1
  return null
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) return null
  return process.argv[index + 1]
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

const checkoutArg = argValue('--audiveris-checkout')
const archiveArg = argValue('--archive')
const expectedArg = argValue('--expected-samples')
if (!checkoutArg || !archiveArg || !expectedArg) {
  fail('Usage: node scripts/runPinnedAudiverisSampleRepositoryAcceptance.js --audiveris-checkout <path> --archive <samples.zip> --expected-samples <count>')
} else {
  const checkout = resolve(checkoutArg)
  const archive = resolve(archiveArg)
  const expectedSamples = Number(expectedArg)
  if (!Number.isSafeInteger(expectedSamples) || expectedSamples <= 0) {
    fail('--expected-samples must be a positive safe integer.')
  } else if (!existsSync(archive)) {
    fail('samples.zip does not exist.')
  } else {
    const git = run('git', ['rev-parse', 'HEAD'], { cwd: checkout })
    const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: checkout })
    if (git.status !== 0 || status.status !== 0) {
      fail(`Could not inspect Audiveris checkout: ${(git.stderr || status.stderr).trim()}`)
    } else if (git.stdout.trim() !== AUDIVERIS_PINNED_REVISION) {
      fail(`Audiveris checkout HEAD must equal ${AUDIVERIS_PINNED_REVISION}.`)
    } else if (status.stdout.trim() !== '') {
      fail('Audiveris checkout must be clean before the pinned acceptance probe is installed.')
    } else {
      const archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
      const packageFolder = join(checkout, 'app', 'src', 'test', 'java', 'org', 'audiveris', 'omr', 'classifier')
      const probePath = join(packageFolder, 'SesliTabPinnedSamplesAcceptanceTest.java')
      const receiptPath = join(checkout, '.seslitab-audiveris-acceptance.json')
      if (existsSync(probePath) || existsSync(receiptPath)) {
        fail('Refusing to overwrite an existing Audiveris probe or acceptance receipt file.')
      } else {
        const java = `package org.audiveris.omr.classifier;\n\nimport static org.junit.Assert.*;\nimport org.junit.Test;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.security.MessageDigest;\nimport java.util.HexFormat;\n\npublic class SesliTabPinnedSamplesAcceptanceTest {\n    @Test\n    public void acceptsExactSesliTabSamplesArchive() throws Exception {\n        final String archiveText = System.getenv("SESLITAB_SAMPLES_ARCHIVE");\n        final String receiptText = System.getenv("SESLITAB_ACCEPTANCE_RECEIPT");\n        final String expectedText = System.getenv("SESLITAB_EXPECTED_SAMPLES");\n        assertNotNull(archiveText);\n        assertNotNull(receiptText);\n        assertNotNull(expectedText);\n        final Path archive = Path.of(archiveText);\n        final int expected = Integer.parseInt(expectedText);\n        final byte[] bytes = Files.readAllBytes(archive);\n        final String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));\n        final SampleRepository repo = SampleRepository.getInstance(archive, true);\n        assertNotNull("SampleRepository rejected archive", repo);\n        assertTrue("SampleRepository did not load archive", repo.isLoaded());\n        final int loaded = repo.getAllSamples().size();\n        assertEquals("Loaded sample count mismatch", expected, loaded);\n        final String json = "{\\\"probeKind\\\":\\\"${AUDIVERIS_PINNED_ACCEPTANCE_PROBE.kind}\\\","
            + "\\\"probeApi\\\":\\\"${AUDIVERIS_PINNED_ACCEPTANCE_PROBE.api.replaceAll('"', '\\"')}\\\","
            + "\\\"upstreamRevision\\\":\\\"${AUDIVERIS_PINNED_REVISION}\\\","
            + "\\\"archiveSha256\\\":\\\"" + sha256 + "\\\","
            + "\\\"repositoryLoaded\\\":true,"
            + "\\\"loadedSampleCount\\\":" + loaded + "}";\n        Files.writeString(Path.of(receiptText), json);\n    }\n}\n`
        try {
          writeFileSync(probePath, java, { encoding: 'utf8', flag: 'wx' })
          const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
          const gradle = run(wrapper, [
            ':app:test',
            '--tests', 'org.audiveris.omr.classifier.SesliTabPinnedSamplesAcceptanceTest',
            '--no-daemon',
          ], {
            cwd: checkout,
            env: {
              ...process.env,
              SESLITAB_SAMPLES_ARCHIVE: archive,
              SESLITAB_ACCEPTANCE_RECEIPT: receiptPath,
              SESLITAB_EXPECTED_SAMPLES: String(expectedSamples),
            },
          })
          if (gradle.status !== 0) {
            fail(`Pinned Audiveris SampleRepository acceptance failed.\n${gradle.stdout}\n${gradle.stderr}`)
          } else if (!existsSync(receiptPath)) {
            fail('Pinned Audiveris probe completed without an acceptance receipt.')
          } else {
            const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
            const validReceipt = (
              receipt.probeKind === AUDIVERIS_PINNED_ACCEPTANCE_PROBE.kind &&
              receipt.probeApi === AUDIVERIS_PINNED_ACCEPTANCE_PROBE.api &&
              receipt.upstreamRevision === AUDIVERIS_PINNED_REVISION &&
              receipt.archiveSha256 === archiveSha256 &&
              receipt.repositoryLoaded === true &&
              receipt.loadedSampleCount === expectedSamples
            )
            if (!validReceipt) {
              fail('Pinned Audiveris receipt does not bind the exact probe/revision/archive/count.')
            } else {
              process.stdout.write(`${JSON.stringify(receipt)}\n`)
            }
          }
        } finally {
          rmSync(probePath, { force: true })
          rmSync(receiptPath, { force: true })
        }
      }
    }
  }
}
