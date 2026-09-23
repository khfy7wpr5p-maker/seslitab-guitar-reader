import assert from 'node:assert/strict'
import https from 'node:https'
import test from 'node:test'

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'seslitab-sonar-diagnostic',
        Accept: 'application/json',
      },
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error('Sonar API HTTP ' + res.statusCode + ': ' + body.slice(0, 500)))
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

test('TEMP diagnostic: print exact Sonar new-code reliability issues', async () => {
  const url = 'https://sonarcloud.io/api/issues/search?componentKeys=khfy7wpr5p-maker_seslitab-guitar-reader&pullRequest=247&issueStatuses=OPEN,CONFIRMED&sinceLeakPeriod=true'
  const data = await getJson(url)
  const issues = (data.issues ?? []).filter((issue) => (issue.impacts ?? []).some((impact) => impact.softwareQuality === 'RELIABILITY')).map((issue) => ({
    rule: issue.rule,
    severity: issue.severity,
    component: issue.component,
    line: issue.line,
    message: issue.message,
    type: issue.type,
    impacts: issue.impacts,
  }))
  assert.fail('SONAR_DIAGNOSTIC=' + JSON.stringify(issues))
})
