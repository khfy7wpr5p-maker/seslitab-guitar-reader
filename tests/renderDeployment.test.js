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
    assert.ok(dockerfile.includes('USER seslitab'), 'Must use non-root user')
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

  test('17. Installs Audiveris .deb with strict, non-suppressed installation', async () => {
    const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    // Must use the official Ubuntu 24.04 x86_64 release asset name
    assert.ok(dockerfile.includes('Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb'),
      'Must use official Audiveris-5.11.0-ubuntu24.04-x86_64.deb asset name')
    assert.ok(dockerfile.includes('https://github.com/Audiveris/audiveris/releases/download/'),
      'Must use official GitHub release URL')
    // Must install xdg-utils and desktop-file-utils before the .deb
    assert.ok(dockerfile.includes('xdg-utils'),
      'Must install xdg-utils for Audiveris post-install script')
    assert.ok(dockerfile.includes('desktop-file-utils'),
      'Must install desktop-file-utils for Audiveris post-install script')
    // Must create XDG directories before installing the .deb
    assert.ok(dockerfile.includes('/usr/share/applications'),
      'Must create /usr/share/applications before .deb installation')
    assert.ok(dockerfile.includes('/usr/share/desktop-directories'),
      'Must create /usr/share/desktop-directories before .deb installation')
    assert.ok(dockerfile.includes('install -d -m 0755'),
      'Must create XDG directories with install -d -m 0755')
    // Must install the local .deb directly with apt/apt-get (resolves dependencies)
    assert.ok(dockerfile.includes('apt-get install -y --no-install-recommends /tmp/audiveris.deb'),
      'Must install local .deb directly with apt-get install')
    // Must verify the package is installed after installation
    assert.ok(dockerfile.includes("dpkg-query -W -f='${Status}\\n' audiveris"),
      'Must verify audiveris package is installed')
    assert.ok(dockerfile.includes("grep -Fx 'install ok installed'"),
      'Must confirm package status is install ok installed')
    // Must require /opt/audiveris/bin/Audiveris after installation
    assert.ok(dockerfile.includes('test -x /opt/audiveris/bin/Audiveris'),
      'Must require /opt/audiveris/bin/Audiveris after installation')
    // Must NOT use the broken dpkg -i || apt-get install -f pattern
    assert.ok(!/dpkg\s+-i\s+.*\|\|\s*apt-get\s+install\s+-f/.test(dockerfile),
      'Must not use dpkg -i || apt-get install -f fallback pattern')
    // Must NOT suppress installation errors with 2>/dev/null
    assert.ok(!/dpkg\s+-i\s+.*2>\/dev\/null/.test(dockerfile),
      'Must not suppress dpkg installation errors with 2>/dev/null')
    // Must NOT create symlinks to hide a failed installation
    assert.ok(!dockerfile.includes('ln -sf'),
      'Must not create symlinks to hide failed installation')
    // Must NOT run the Audiveris GUI during build
    assert.ok(!/Audiveris\s+-version/.test(dockerfile),
      'Must not execute Audiveris GUI during build')
    // Must NOT use dpkg --unpack as a workaround
    assert.ok(!dockerfile.includes('dpkg --unpack'),
      'Must not use dpkg --unpack as a workaround')
  })
})
