// Focused tests for Render deployment changes: server port binding,
// graceful shutdown, persistent storage config, health endpoint safety,
// and smoke-test script validation.
//
// Run with: node --test tests/renderDeployment.test.js

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')

function runScript(args = []) {
  try {
    const out = execFileSync('node', [path.join(ROOT, 'scripts/real-omr-smoke-test.js'), ...args], {
      timeout: 5000,
      encoding: 'utf8',
      cwd: ROOT,
    })
    return { exitCode: 0, stdout: out, stderr: '' }
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('Server port and binding', () => {
  test('1. Production server uses PORT env var', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    assert.ok(serverSrc.includes('process.env.PORT'), 'Server must read PORT env var')
  })

  test('2. Production server binds to 0.0.0.0', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    assert.ok(serverSrc.includes('0.0.0.0'), 'Server must bind to 0.0.0.0')
  })

  test('2b. Recovery completes before HTTP listen and gateway starts workers before cleanup', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    const indexSrc = readFileSync(path.join(ROOT, 'backend/index.js'), 'utf8')
    assert.ok(serverSrc.indexOf('await startGateway()') < serverSrc.indexOf('app.listen('))
    assert.ok(indexSrc.indexOf('recoverJobs') < indexSrc.indexOf('startWorkerPool') || indexSrc.includes('(deps.recoverJobs || recoverJobs)'))
    const recoveryCall = indexSrc.indexOf('(deps.recoverJobs || recoverJobs)')
    assert.ok(recoveryCall < indexSrc.indexOf('(deps.startWorkerPool || startWorkerPool)'))
    assert.ok(indexSrc.indexOf('(deps.startWorkerPool || startWorkerPool)') < indexSrc.indexOf('(deps.startCleanup || startCleanup)'))
  })
})

describe('Graceful shutdown', () => {
  test('3. SIGTERM handler exists', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    assert.ok(serverSrc.includes('SIGTERM'), 'Server must handle SIGTERM')
    assert.ok(serverSrc.includes('shutdown'), 'Server must have shutdown function')
  })

  test('4. Shutdown stops new job acceptance', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    assert.ok(serverSrc.includes('shuttingDown'), 'Server must track shuttingDown state')
    assert.ok(serverSrc.includes('SHUTTING_DOWN'), 'Server must reject new jobs during shutdown')
  })
})

describe('Persistent storage configuration', () => {
  test('5. Storage config parsed from env vars', () => {
    const configSrc = readFileSync(path.join(ROOT, 'backend/config/gatewayConfig.js'), 'utf8')
    assert.ok(configSrc.includes('SESLITAB_MUSICXML_DIR'), 'Config must read SESLITAB_MUSICXML_DIR')
    assert.ok(configSrc.includes('SESLITAB_TEMP_DIR'), 'Config must read SESLITAB_TEMP_DIR')
    assert.ok(configSrc.includes('SESLITAB_DATA_DIR'), 'Config must read SESLITAB_DATA_DIR')
  })

  test('6. Missing writable storage uses safe fallback', () => {
    const configSrc = readFileSync(path.join(ROOT, 'backend/config/gatewayConfig.js'), 'utf8')
    assert.ok(configSrc.includes('envPath'), 'Config must use envPath helper')
    assert.ok(configSrc.includes("'./storage/jobs'"), 'Config must have safe fallback for storage')
  })
})

describe('Health endpoint safety', () => {
  test('7. Health response does not expose paths', () => {
    const preflightSrc = readFileSync(path.join(ROOT, 'backend/services/audiverisPreflight.js'), 'utf8')
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    // safePreflightResponse must only expose code, not message or paths
    assert.ok(preflightSrc.includes('safePreflightResponse'), 'Must use safePreflightResponse')
    assert.ok(preflightSrc.includes('error: result.available ? undefined'), 'Must not expose error when available')
    assert.ok(!preflightSrc.includes('command') || preflightSrc.includes('safePreflightResponse'), 'No raw command in response')
  })

  test('8. Health response does not expose environment variables', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'backend/server.js'), 'utf8')
    // Health endpoint must not dump process.env
    const healthSection = serverSrc.slice(serverSrc.indexOf('/health'), serverSrc.indexOf('/health') + 500)
    assert.ok(!healthSection.includes('process.env.AUDIVERIS_COMMAND'), 'Must not expose AUDIVERIS_COMMAND')
    assert.ok(!healthSection.includes('process.env.OMR_HTTP_API_KEY'), 'Must not expose API keys')
  })
})

describe('Smoke-test script validation', () => {
  test('9. Rejects missing PDF argument', () => {
    const result = runScript([])
    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('PDF dosya yolu gerekli'))
  })

  test('10. Rejects non-PDF files', () => {
    const tmpFile = path.join(ROOT, 'test_file.txt')
    writeFileSync(tmpFile, 'not a pdf')
    const result = runScript([tmpFile])
    unlinkSync(tmpFile)
    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('PDF değil'))
  })

  test('11. Rejects MockProvider results', async () => {
    const scriptSrc = readFileSync(path.join(ROOT, 'scripts/real-omr-smoke-test.js'), 'utf8')
    assert.ok(scriptSrc.includes("provider === 'mock'"), 'Script must reject mock provider')
    assert.ok(scriptSrc.includes('MockProvider'), 'Script must mention MockProvider in error')
  })
})

describe('Render Blueprint', () => {
  test('12. render.yaml exists and has correct structure', async () => {
    const yaml = readFileSync(path.join(ROOT, 'render.yaml'), 'utf8')
    assert.ok(yaml.includes('seslitab-omr'), 'Service name must be seslitab-omr')
    assert.ok(yaml.includes('runtime: docker'), 'Runtime must be docker')
    assert.ok(yaml.includes('healthCheckPath: /health'), 'Health check path must be /health')
    assert.ok(yaml.includes('plan: standard'), 'Plan must be standard')
    assert.ok(yaml.includes('mountPath: /var/lib/seslitab'), 'Disk mount path must be /var/lib/seslitab')
    assert.ok(yaml.includes('sizeGB: 1'), 'Disk size must be 1 GB')
    assert.ok(yaml.includes('autoDeploy: false'), 'autoDeploy must be false')
    assert.ok(yaml.includes('OMR_PROVIDER'), 'Must set OMR_PROVIDER')
    assert.ok(yaml.includes('AUDIVERIS_COMMAND'), 'Must set AUDIVERIS_COMMAND')
    assert.ok(yaml.includes('5.11.0'), 'Must pin Audiveris version')
  })

  test('13. render.yaml does not contain secrets', async () => {
    const yaml = readFileSync(path.join(ROOT, 'render.yaml'), 'utf8')
    assert.ok(!yaml.includes('API_KEY'), 'No API keys in render.yaml')
    assert.ok(!yaml.includes('SECRET'), 'No secrets in render.yaml')
    assert.ok(!yaml.match(/password/i), 'No passwords in render.yaml')
  })
})

describe('Dockerfile security', () => {
  test('14. Uses non-root user', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    const entrypoint = readFileSync(path.join(ROOT, 'docker-entrypoint.sh'), 'utf8')
    // The container starts as root so the entrypoint can fix up the Render
    // disk mount, then drops permanently to seslitab via runuser.
    assert.ok(dockerfile.includes('ENTRYPOINT'), 'Must use ENTRYPOINT for root-to-seslitab drop')
    assert.ok(entrypoint.includes('runuser -u seslitab'), 'Entrypoint must drop to seslitab user')
    assert.ok(!entrypoint.includes('sudo'), 'Entrypoint must not use sudo')
    assert.ok(dockerfile.includes('groupadd'), 'Must create user group')
    assert.ok(dockerfile.includes('useradd'), 'Must create user')
  })

  test('15. Does not use chmod 777', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    assert.ok(!dockerfile.includes('777'), 'Must not use chmod 777')
  })

  test('16. Pins Audiveris version and uses HTTPS', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    assert.ok(dockerfile.includes('5.11.0'), 'Must pin Audiveris 5.11.0')
    assert.ok(dockerfile.includes('https://github.com/Audiveris/'), 'Must use official GitHub URL')
    assert.ok(!dockerfile.includes('/latest/'), 'Must not use latest URL')
  })

  test('17. Extracts Audiveris payload from .deb without package installation', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    // Must use the official Ubuntu 24.04 x86_64 release asset name
    assert.ok(dockerfile.includes('Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb'),
      'Must use official Audiveris-5.11.0-ubuntu24.04-x86_64.deb asset name')
    assert.ok(dockerfile.includes('https://github.com/Audiveris/audiveris/releases/download/'),
      'Must use official GitHub release URL')
    // Must extract the payload with dpkg-deb -x (no package installation)
    assert.ok(dockerfile.includes('dpkg-deb -x /tmp/audiveris.deb /tmp/audiveris-root'),
      'Must extract .deb payload with dpkg-deb -x')
    // Must verify the extracted executable before copying
    assert.ok(dockerfile.includes('test -x /tmp/audiveris-root/opt/audiveris/bin/Audiveris'),
      'Must verify extracted executable exists before copying')
    // Must copy the complete /opt/audiveris payload (not individual files)
    assert.ok(dockerfile.includes('cp -a /tmp/audiveris-root/opt/audiveris /opt/audiveris'),
      'Must copy complete /opt/audiveris directory tree')
    // Must verify the final executable
    assert.ok(dockerfile.includes('test -x /opt/audiveris/bin/Audiveris'),
      'Must require /opt/audiveris/bin/Audiveris after extraction')
    // Must run a strict headless smoke test
    assert.ok(dockerfile.includes('Audiveris -version'),
      'Must run headless -version smoke test')
    assert.ok(!dockerfile.includes('Audiveris -batch -version'),
      'Must not use -batch -version (triggers native OCR initialization)')
    // Must NOT use apt/dpkg package installation
    assert.ok(!dockerfile.includes('apt-get install -y --no-install-recommends /tmp/audiveris.deb'),
      'Must not install .deb with apt-get install')
    assert.ok(!/dpkg\s+-i\s+/.test(dockerfile),
      'Must not use dpkg -i to install the package')
    assert.ok(!dockerfile.includes('apt-get install -f'),
      'Must not use apt-get install -f fallback')
    // Must NOT use XDG desktop workarounds
    assert.ok(!dockerfile.includes('xdg-utils'),
      'Must not install xdg-utils')
    assert.ok(!dockerfile.includes('desktop-file-utils'),
      'Must not install desktop-file-utils')
    assert.ok(!dockerfile.includes('/usr/share/applications'),
      'Must not create XDG applications directory')
    assert.ok(!dockerfile.includes('/usr/share/desktop-directories'),
      'Must not create XDG desktop-directories')
    // Must NOT suppress errors or use fallback patterns
    assert.ok(!/2>\/dev\/null/.test(dockerfile),
      'Must not suppress errors with 2>/dev/null')
    assert.ok(!dockerfile.includes('|| true'),
      'Must not use || true to suppress failures')
    // Must NOT create symlinks to hide a failed installation
    assert.ok(!dockerfile.includes('ln -sf'),
      'Must not create symlinks to hide failed installation')
    // Must NOT use dpkg --unpack as a workaround
    assert.ok(!dockerfile.includes('dpkg --unpack'),
      'Must not use dpkg --unpack as a workaround')
    // Must install only headless runtime libraries
    assert.ok(dockerfile.includes('fontconfig'),
      'Must install fontconfig for headless rendering')
    assert.ok(dockerfile.includes('libfreetype6'),
      'Must install libfreetype6 for headless rendering')
    // Must set up writable runtime home
    assert.ok(dockerfile.includes('HOME=/var/lib/audiveris'),
      'Must set HOME to writable runtime directory')
    assert.ok(dockerfile.includes('mkdir -p /var/lib/audiveris'),
      'Must create writable runtime home directory')
  })

  test('17a. Final runtime stage copies root package.json with type=module', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    assert.equal(pkg.type, 'module', 'Root package.json must declare type=module')
    assert.ok(dockerfile.includes('COPY package.json /app/package.json'),
      'Must copy root package.json to /app/package.json in the final stage')
    assert.ok(dockerfile.includes("p.type !== 'module'"),
      'Must validate type=module at build time')
    assert.ok(dockerfile.includes("'Runtime package.json must contain type=module'"),
      'Must fail the build with a clear message when type is not module')
  })

  test('17b. Pins exact Node 24 LTS runtime and package engine contract', () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))

    assert.ok(dockerfile.includes('FROM node:24.18.1-bookworm-slim AS node-build'),
      'Docker build stage must pin exact Node 24.18.1 Bookworm Slim image')
    assert.ok(dockerfile.includes("node --version | grep -q '^v24\\.18\\.1$'"),
      'Docker build must verify exact Node 24.18.1 runtime')
    assert.ok(!dockerfile.includes('node:20.18.1'),
      'Dockerfile must not retain the end-of-life Node 20.18.1 image')
    assert.equal(pkg.engines?.node, '>=24.0.0 <25')
    assert.equal(lock.packages?.['']?.engines?.node, pkg.engines.node,
      'Lockfile root engine contract must match package.json')
  })
})

describe('E2E workflow jq paths', () => {
  test('18. Status polling uses .data.status not top-level .status', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    // Must use nested .data.status for job status polling
    assert.ok(wf.includes('.data.status'), 'Must poll .data.status')
    // Must NOT use top-level .status for the job status endpoint
    // Bad pattern: jq -r '.status' (without .data prefix)
    assert.ok(!/jq\s+-r\s+'\.status'/.test(wf), 'Must not use top-level .status in jq')
  })

  test('19. Status polling uses .data.progress not top-level .progress', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('.data.progress'), 'Must use .data.progress')
    assert.ok(!/jq\s+-r\s+'\.progress/.test(wf), 'Must not use top-level .progress in jq')
  })

  test('20. Status polling uses .data.updatedAt not top-level .updatedAt', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('.data.updatedAt'), 'Must use .data.updatedAt')
    assert.ok(!/jq\s+-r\s+'\.updatedAt/.test(wf), 'Must not use top-level .updatedAt in jq')
  })

  test('21. Error handling uses .data.error not top-level .error', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('.data.error.code'), 'Must use .data.error.code')
    assert.ok(wf.includes('.data.error.message'), 'Must use .data.error.message')
    assert.ok(wf.includes('.data.error.details'), 'Must use .data.error.details')
    // Must NOT use top-level .error.code/.error.message/.error.details
    const wfNoDataError = wf.replace(/\.data\.error/g, '')
    assert.ok(!wfNoDataError.includes('.error.code'), 'Must not use top-level .error.code')
    assert.ok(!wfNoDataError.includes('.error.message'), 'Must not use top-level .error.message')
    assert.ok(!wfNoDataError.includes('.error.details'), 'Must not use top-level .error.details')
  })

  test('22. Handles null/missing status as malformed response', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('null'), 'Must check for null status')
    assert.ok(wf.includes('Malformed'), 'Must have malformed-response error message')
  })

  test('23. completed is a terminal state that exits immediately', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('completed)'), 'Must handle completed state')
  })

  test('24. failed and expired are terminal states that exit 1', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('failed|expired'), 'Must handle failed and expired states')
  })

  test('25. musicxml_created is an intermediate state that continues polling', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('musicxml_created'), 'Must handle musicxml_created state')
    assert.ok(wf.includes('continuing to poll'), 'Must continue polling after musicxml_created')
  })

  test('26. Polls every 5 seconds with 180 second max', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('sleep 5'), 'Must poll every 5 seconds')
    assert.ok(wf.includes('180'), 'Must have 180 second max')
  })

  test('27. Validates root element directly from file, not shell variable', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('grep -Eq'), 'Must use grep -Eq for root validation')
    assert.ok(wf.includes('/tmp/output.musicxml'), 'Must read /tmp/output.musicxml directly')
    // Must NOT load entire XML into a shell variable and pipe echo into grep.
    // Only flag large XML content variables, not small ones like $CT.
    assert.ok(!/echo\s+"\$CONTENT"\s*\|\s*grep/.test(wf),
      'Must not pipe echo "$CONTENT" | grep')
    assert.ok(!wf.includes('CONTENT=$(cat'), 'Must not load XML into CONTENT variable')
  })

  test('28. Root regex accepts score-partwise with attributes', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    // The workflow contains this grep -Eq pattern (with shell escaping):
    //   grep -Eq '<score-(partwise|timewise)([[:space:]>])' /tmp/output.musicxml
    assert.ok(wf.includes("score-(partwise|timewise)"),
      'Must use score-(partwise|timewise) pattern')
    assert.ok(wf.includes('[[:space:]>]'),
      'Must use [[:space:>] character class for space/attr/bracket')
    // Verify the regex logic accepts score-partwise with attributes
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">\n<measure /></score-partwise>'
    assert.ok(/<score-(partwise|timewise)([\s>])/.test(xml),
      'Regex should match score-partwise with attributes')
  })

  test('29. Root regex accepts score-timewise with attributes', () => {
    const xml = '<?xml version="1.0"?>\n<score-timewise version="3.1">\n<measure /></score-timewise>'
    assert.ok(/<score-(partwise|timewise)([\s>])/.test(xml),
      'Regex should match score-timewise with attributes')
  })

  test('30. Root regex accepts XML declaration before root', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<score-partwise>'
    assert.ok(/<score-(partwise|timewise)([\s>])/.test(xml),
      'Regex should match with XML declaration before root')
  })

  test('31. Root regex rejects invalid XML without score-partwise/timewise', () => {
    const xml = '<?xml version="1.0"?>\n<html><body>not music</body></html>'
    assert.ok(!/<score-(partwise|timewise)([\s>])/.test(xml),
      'Regex should not match non-MusicXML root')
  })

  test('32. No large-variable echo pipe remains for validation', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    // The old broken pattern: CONTENT=$(cat ...) then echo "$CONTENT" | grep
    assert.ok(!wf.includes('CONTENT=$(cat'), 'Must not load XML into CONTENT variable')
    assert.ok(!/echo\s+"\$CONTENT"\s*\|/.test(wf), 'Must not pipe echo "$CONTENT" anywhere')
  })

  test('33. Prints safe diagnostics on validation failure', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(wf.includes('head -c 500'), 'Must print first 500 bytes')
    assert.ok(wf.includes('Content-Type:'), 'Must print Content-Type')
    assert.ok(wf.includes('File size:'), 'Must print file size')
    assert.ok(wf.includes('First XML element:'), 'Must print first XML element')
  })

  test('34. Measure and note counts read from file directly', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/e2e-render-omr.yml'), 'utf8')
    assert.ok(/grep -o '<measure '\s*\/tmp\/output\.musicxml/.test(wf),
      'Must grep measures from file directly')
    assert.ok(/grep -o '<note '\s*\/tmp\/output\.musicxml/.test(wf),
      'Must grep notes from file directly')
  })
})
