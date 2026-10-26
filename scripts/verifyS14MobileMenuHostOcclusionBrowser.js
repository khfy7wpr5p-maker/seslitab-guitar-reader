import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error('S14 mobile menu host-occlusion proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('S14 mobile menu host-occlusion proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'viewport-fit.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 mobile menu host-occlusion proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function safeDistPath(pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (!relative || relative.endsWith('/')) relative += 'index.html'
  const target = resolve(distRoot, relative)
  if (target !== distRoot && !target.startsWith(distRoot + sep)) return null
  return target
}

async function waitForChildExit(child, timeoutMs = 2000) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolveExit) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('exit', finish)
      resolveExit()
    }
    const timer = setTimeout(finish, timeoutMs)
    child.once('exit', finish)
  })
}

async function waitForDevToolsPort(userDataDir, child) {
  const portFile = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools became ready (${child.exitCode}).`)
    if (existsSync(portFile)) {
      const [portText] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/)
      const port = Number(portText)
      if (Number.isInteger(port) && port > 0) return port
    }
    await delay(50)
  }
  throw new Error('Chrome DevTools port did not become ready.')
}

function connectCdp(webSocketUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(webSocketUrl)
    let nextId = 1
    const pending = new Map()
    let settled = false

    const rejectAll = (error) => {
      for (const { reject } of pending.values()) reject(error)
      pending.clear()
    }

    socket.addEventListener('open', () => {
      settled = true
      resolveConnection({
        send(method, params = {}) {
          const id = nextId++
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() {
          rejectAll(new Error('CDP connection closed.'))
          socket.close()
        },
      })
    }, { once: true })

    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!message.id || !pending.has(message.id)) return
      const handler = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) handler.reject(new Error(`${message.error.message ?? 'CDP command failed'} (${message.error.code ?? 'unknown'})`))
      else handler.resolve(message.result ?? {})
    })

    socket.addEventListener('error', () => {
      const error = new Error('Chrome DevTools WebSocket failed.')
      rejectAll(error)
      if (!settled) rejectConnection(error)
    })
    socket.addEventListener('close', () => rejectAll(new Error('Chrome DevTools WebSocket closed.')))
  })
}

async function createPageTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Chrome DevTools target creation failed (${response.status}).`)
  const target = await response.json()
  if (typeof target?.webSocketDebuggerUrl !== 'string' || !target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools target did not expose a WebSocket URL.')
  }
  return target.webSocketDebuggerUrl
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result?.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed.'
    throw new Error(text)
  }
  return result?.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let lastValue = null
  while (Date.now() < deadline) {
    lastValue = await evaluate(cdp, expression)
    if (lastValue) return lastValue
    await delay(100)
  }
  throw new Error(`${label} timed out${lastValue ? ` (last=${String(lastValue)})` : ''}`)
}

async function menuLifecycleSnapshot(cdp) {
  return evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const doc = frame?.contentDocument;
    const menu = doc?.getElementById('controls-left');
    const score = doc?.querySelector('.musicRelief');
    const first = menu?.querySelector('button');
    if (!menu || !score || !first) throw new Error('Real Smoosic menu/score DOM is missing.');
    const view = frame.contentWindow;
    const rect = first.getBoundingClientRect();
    const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const activeInMenu = menu.contains(doc.activeElement);
    first.focus({ preventScroll: true });
    const focusAccepted = doc.activeElement === first;
    if (focusAccepted) first.blur();
    return {
      home: menu.parentElement?.classList.contains('media') === true,
      open: doc.body.classList.contains('mobile-menu-open'),
      scrollTop: menu.scrollTop,
      menuWidth: menu.getBoundingClientRect().width,
      menuDisplay: view.getComputedStyle(menu).display,
      scoreWidth: score.getBoundingClientRect().width,
      viewportWidth: view.innerWidth,
      firstTopInParent: frame.getBoundingClientRect().top + rect.top,
      headerBottom: document.querySelector('.app-header').getBoundingClientRect().bottom,
      pointerTarget: !!hit?.closest?.('#controls-left button'),
      activeInMenu, focusAccepted,
      buttonHeights: Array.from(menu.querySelectorAll('button'), button => button.getBoundingClientRect().height),
      toolbarDisplay: view.getComputedStyle(doc.getElementById('mobile-toolbar')).display,
    };
  })()`)
}

function assertInitialMenuHidden(snapshot, label) {
  if (!snapshot.home || snapshot.menuWidth > 1
    || Math.abs(snapshot.scoreWidth - snapshot.viewportWidth) > 2
    || snapshot.focusAccepted) {
    throw new Error(`${label}: native sidebar occupies the mobile score or accepts focus: ${JSON.stringify(snapshot)}`)
  }
}

async function tapMenuToggle(cdp, open) {
  const point = await waitFor(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const frameRect = frame.getBoundingClientRect();
    const doc = frame.contentDocument;
    const rect = doc.getElementById('mobile-menu-toggle').getBoundingClientRect();
    const localX = rect.left + rect.width / 2;
    const localY = rect.top + rect.height / 2;
    const x = frameRect.left + localX;
    const y = frameRect.top + localY;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight
      || document.elementFromPoint(x, y) !== frame
      || !doc.elementFromPoint(localX, localY)?.closest('#mobile-menu-toggle')) return false;
    return { x, y };
  })()`, 'mobile Menu toggle visible and hittable after layout settles')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await waitFor(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame').contentDocument;
    const menu = doc.getElementById('controls-left');
    return doc.body.classList.contains('mobile-menu-open') === ${open}
      && doc.defaultView.getComputedStyle(menu).opacity === '${open ? '1' : '0'}';
  })()`, `mobile menu ${open ? 'open' : 'closed'} after touch`)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const target = safeDistPath(url.pathname)
  if (!target || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }
  response.writeHead(200, {
    'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  response.end(readFileSync(target))
})

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
const port = typeof address === 'object' && address ? address.port : null
if (!port) throw new Error('S14 mobile menu host-occlusion proof could not acquire a local port.')

const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-menu-host-'))
const child = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { cwd: repoRoot, stdio: 'ignore' })

let cdp = null
try {
  const debugPort = await waitForDevToolsPort(userDataDir, child)
  const webSocketUrl = await createPageTarget(debugPort)
  cdp = await connectCdp(webSocketUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` })

  await waitFor(cdp, `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`, 'SesliTab shell')
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame')?.contentDocument;
    return !!doc?.getElementById('mobile-menu-toggle') && !!doc?.getElementById('controls-left');
  })()`, 'Smoosic mobile menu')

  await waitFor(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const doc = frame?.contentDocument;
    const status = String(doc?.getElementById('poc-status')?.textContent || '');
    if (/^(Başlatma hatası:|Hata:|Renderer oluşmadı)/.test(status)) throw new Error(status);
    return status.startsWith('Editör hazır') && !!doc?.querySelector('svg')
      && doc.getElementById('mobile-menu-toggle')?.disabled === false;
  })()`, 'Smoosic renderer and enabled controls')

  // Observe actual geometry for the production 140 ms settle interval; menu
  // DOM nodes exist earlier, while boot can still move the frame/host header.
  await waitFor(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const header = document.querySelector('.app-header');
    if (!frame || !header || frame.hidden || frame.parentElement?.hidden) return false;
    const rect = frame.getBoundingClientRect();
    const signature = JSON.stringify([rect.top, rect.height, frame.style.height,
      header.getBoundingClientRect().bottom, innerHeight, visualViewport?.height]);
    const previous = window.__s14MenuReadyLayout;
    if (!previous || previous.signature !== signature) {
      window.__s14MenuReadyLayout = { signature, since: performance.now() };
      return false;
    }
    return frame.dataset.seslitabViewportFit === 'mobile' && rect.height > 0
      && performance.now() - previous.since >= 140;
  })()`, 'initial mobile frame geometry settled')

  const initialMenu = await menuLifecycleSnapshot(cdp)
  assertInitialMenuHidden(initialMenu, 'First load before any Menu click')

  await evaluate(cdp, `(() => {
    const spacer = document.createElement('div');
    spacer.id = 'host-occlusion-test-spacer';
    spacer.style.height = '1400px';
    spacer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spacer);
    const frame = document.getElementById('smoosic-editor-frame');
    const frameDocumentTop = window.scrollY + frame.getBoundingClientRect().top;
    window.scrollTo(0, frameDocumentTop + 220);
    return true;
  })()`)

  await waitFor(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const header = document.querySelector('.app-header');
    if (!frame || !header) return false;
    return frame.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 100
      && Number(frame.dataset.seslitabHostOccludedTop || 0) > 100;
  })()`, 'host header to occlude iframe top')

  const scrolledInitialMenu = await menuLifecycleSnapshot(cdp)
  assertInitialMenuHidden(scrolledInitialMenu, 'Scrolled before any Menu click')
  await tapMenuToggle(cdp, true)

  const proof = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const header = document.querySelector('.app-header');
    const doc = frame.contentDocument;
    const menu = doc.getElementById('controls-left');
    const firstButton = menu.querySelector('button');
    const firstItem = firstButton?.closest?.('li') || firstButton?.parentElement;
    const grayShell = doc.querySelector('.media > #controls-left');
    const frameRect = frame.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const firstRect = firstButton.getBoundingClientRect();
    const firstItemRect = firstItem?.getBoundingClientRect?.();
    const x = Math.max(firstRect.left + 1, Math.min(firstRect.right - 1, firstRect.left + firstRect.width / 2));
    const y = Math.max(firstRect.top + 1, Math.min(firstRect.bottom - 1, firstRect.top + firstRect.height / 2));
    const hit = doc.elementFromPoint(x, y);
    const visibleFirstHeight = Math.max(0, Math.min(firstRect.bottom, menuRect.bottom) - Math.max(firstRect.top, menuRect.top));
    const grayRect = grayShell?.getBoundingClientRect?.();
    const grayStyle = grayShell ? getComputedStyle(grayShell) : null;
    const menuStyle = getComputedStyle(menu);
    const firstItemStyle = firstItem ? getComputedStyle(firstItem) : null;
    const firstButtonStyle = getComputedStyle(firstButton);
    const summarizeNode = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        id: node.id || '',
        className: typeof node.className === 'string' ? node.className : String(node.className || ''),
        text: String(node.textContent || '').trim().slice(0, 40),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        offsetTop: node.offsetTop,
        offsetParent: node.offsetParent?.id || node.offsetParent?.className || node.offsetParent?.tagName || '',
        display: style.display,
        position: style.position,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        transform: style.transform,
      };
    };
    return {
      firstLabel: String(firstButton?.textContent || '').trim(),
      scrollTop: menu.scrollTop,
      frameTop: frameRect.top,
      headerBottom: headerRect.bottom,
      menuTopInParent: frameRect.top + menuRect.top,
      firstTopInParent: frameRect.top + firstRect.top,
      menuTopCss: menuStyle.top,
      recordedMenuTop: Number(frame.dataset.seslitabMenuTop || 0),
      recordedOccludedTop: Number(frame.dataset.seslitabHostOccludedTop || 0),
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      menuParentIsBody: menu.parentElement === doc.body,
      firstHitInsideMenu: !!hit?.closest?.('#controls-left'),
      firstHitTag: hit?.tagName || '',
      firstHitClass: String(hit?.className || ''),
      visibleFirstHeight,
      grayShellWidth: Number(grayRect?.width || 0),
      grayShellPaddingLeft: grayStyle?.paddingLeft || '',
      grayShellBackground: grayStyle?.backgroundColor || '',
      menuComputed: {
        display: menuStyle.display,
        position: menuStyle.position,
        height: menuStyle.height,
        minHeight: menuStyle.minHeight,
        maxHeight: menuStyle.maxHeight,
        paddingTop: menuStyle.paddingTop,
        paddingBottom: menuStyle.paddingBottom,
        flexDirection: menuStyle.flexDirection,
        justifyContent: menuStyle.justifyContent,
        alignContent: menuStyle.alignContent,
      },
      firstItemComputed: firstItem ? {
        top: firstItemRect?.top,
        height: firstItemRect?.height,
        offsetTop: firstItem.offsetTop,
        display: firstItemStyle?.display,
        position: firstItemStyle?.position,
        marginTop: firstItemStyle?.marginTop,
        marginBottom: firstItemStyle?.marginBottom,
        paddingTop: firstItemStyle?.paddingTop,
        paddingBottom: firstItemStyle?.paddingBottom,
        transform: firstItemStyle?.transform,
      } : null,
      firstButtonComputed: {
        top: firstRect.top,
        height: firstRect.height,
        offsetTop: firstButton.offsetTop,
        display: firstButtonStyle.display,
        position: firstButtonStyle.position,
        marginTop: firstButtonStyle.marginTop,
        marginBottom: firstButtonStyle.marginBottom,
        paddingTop: firstButtonStyle.paddingTop,
        paddingBottom: firstButtonStyle.paddingBottom,
        transform: firstButtonStyle.transform,
      },
      menuChildren: Array.from(menu.children).slice(0, 8).map(summarizeNode),
    };
  })()`)

  if (!proof?.firstLabel.includes('Help')) throw new Error(`First mobile menu item is not Help: ${JSON.stringify(proof)}`)
  if (proof.scrollTop !== 0) throw new Error(`Mobile menu did not reopen at scrollTop=0: ${JSON.stringify(proof)}`)
  if (!(proof.recordedOccludedTop > 100)) throw new Error(`Host occlusion was not reproduced: ${JSON.stringify(proof)}`)
  if (proof.menuTopInParent < proof.headerBottom - 2) throw new Error(`Mobile menu is still hidden behind sticky host header: ${JSON.stringify(proof)}`)
  if (proof.firstTopInParent < proof.headerBottom - 2) throw new Error(`Help item is still hidden behind sticky host header: ${JSON.stringify(proof)}`)
  if (!proof.menuParentIsBody) throw new Error(`Mobile menu is still trapped inside Smoosic media layers: ${JSON.stringify(proof)}`)
  if (!proof.firstHitInsideMenu) throw new Error(`Help item is painted behind another Smoosic layer: ${JSON.stringify(proof)}`)
  if (proof.visibleFirstHeight < 40) throw new Error(`Help item is clipped to a narrow strip: ${JSON.stringify(proof)}`)
  if (proof.grayShellWidth > 1) throw new Error(`Empty Bootstrap menu shell still occupies score width: ${JSON.stringify(proof)}`)

  const closedMenus = []
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const opened = await menuLifecycleSnapshot(cdp)
    if (opened.scrollTop !== 0 || !opened.pointerTarget
      || opened.firstTopInParent < opened.headerBottom - 2
      || !opened.buttonHeights.every(height => height >= 44 && height <= 64)) {
      throw new Error(`Reopened mobile menu is scrolled, clipped or stretched: ${JSON.stringify(opened)}`)
    }
    const beforeClose = await evaluate(cdp, `(() => {
      const doc = document.getElementById('smoosic-editor-frame').contentDocument;
      const menu = doc.getElementById('controls-left');
      menu.scrollTop = menu.scrollHeight;
      Array.from(menu.querySelectorAll('button')).at(-1).focus({ preventScroll: true });
      return { focused: menu.contains(doc.activeElement), scrollTop: menu.scrollTop };
    })()`)
    if (!beforeClose.focused || beforeClose.scrollTop <= 0) {
      throw new Error(`Real menu must be focused and scrolled before close: ${JSON.stringify(beforeClose)}`)
    }
    if (cycle === 0) {
      // Programmatic activation preserves the focused descendant until the
      // actual close handler runs, unlike a touch that can focus the toggle.
      await evaluate(cdp, `document.getElementById('smoosic-editor-frame').contentDocument.getElementById('mobile-menu-toggle').click(); true`)
      await waitFor(cdp, `(() => {
        const doc = document.getElementById('smoosic-editor-frame').contentDocument;
        return !doc.body.classList.contains('mobile-menu-open')
          && doc.defaultView.getComputedStyle(doc.getElementById('controls-left')).opacity === '0';
      })()`, 'menu closed with retained descendant focus')
    } else {
      await tapMenuToggle(cdp, false)
    }
    const closed = await menuLifecycleSnapshot(cdp)
    if (closed.pointerTarget || closed.focusAccepted || closed.activeInMenu) {
      throw new Error(`Closed mobile menu intercepts pointer or keyboard focus: ${JSON.stringify(closed)}`)
    }
    closedMenus.push({ ...closed, beforeClose })
    await tapMenuToggle(cdp, true)
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  })
  await waitFor(cdp, `document.getElementById('smoosic-editor-frame').contentWindow.innerWidth > 820
    && document.getElementById('smoosic-editor-frame').contentDocument.getElementById('controls-left').parentElement.classList.contains('media')`, 'desktop menu restored to native parent')
  const desktopMenu = await menuLifecycleSnapshot(cdp)
  if (desktopMenu.open || desktopMenu.menuWidth <= 1 || desktopMenu.menuDisplay === 'none'
    || desktopMenu.toolbarDisplay !== 'none') {
    throw new Error(`Desktop menu did not restore: ${JSON.stringify(desktopMenu)}`)
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  })
  await waitFor(cdp, `document.getElementById('smoosic-editor-frame').contentWindow.innerWidth <= 820`, 'mobile viewport restored')
  const returnedMenu = await menuLifecycleSnapshot(cdp)
  assertInitialMenuHidden(returnedMenu, 'Returned from desktop to mobile')
  await tapMenuToggle(cdp, true)
  const reopenedMenu = await menuLifecycleSnapshot(cdp)
  if (!reopenedMenu.open || !reopenedMenu.pointerTarget
    || reopenedMenu.scrollTop !== 0
    || reopenedMenu.firstTopInParent < reopenedMenu.headerBottom - 2
    || !reopenedMenu.buttonHeights.every(height => height >= 44 && height <= 64)) {
    throw new Error(`Mobile menu cannot reopen after desktop round trip: ${JSON.stringify(reopenedMenu)}`)
  }

  console.log(`S14 mobile menu host-occlusion browser proof PASS using ${chrome}: ${JSON.stringify({ ...proof,
    lifecycle: { initialMenu, scrolledInitialMenu, closedMenus, desktopMenu, returnedMenu, reopenedMenu } })}`)
} catch (error) {
  console.error(`S14 mobile menu host-occlusion proof failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
} finally {
  try { cdp?.close() } catch {}
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  await waitForChildExit(child, 1500)
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await waitForChildExit(child, 1000)
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  } catch (error) {
    console.error(`S14 mobile menu host-occlusion cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
  await new Promise((resolveClose) => server.close(resolveClose))
}
