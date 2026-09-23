import assert from 'node:assert/strict'
import https from 'node:https'
import test from 'node:test'

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'seslitab-sonar-diagnostic',
        Accept: 'application/vnd.github+json',
      },
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error('GitHub API HTTP ' + res.statusCode + ': ' + body.slice(0, 800)))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', reject)
  })
}

test('TEMP diagnostic: print Sonar GitHub check annotation', async () => {
  const annotations = await getJson(
    'https://api.github.com/repos/khfy7wpr5p-maker/seslitab-guitar-reader/check-runs/107099246629/annotations',
  )
  assert.fail('SONAR_DIAGNOSTIC=' + JSON.stringify(annotations))
})
