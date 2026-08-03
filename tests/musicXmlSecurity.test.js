import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { validateMusicXml } from '../backend/providers/HttpOmrProvider.js'
import { parseMusicXml } from '../musicXmlParser.js'

const VALID_PARTWISE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list/>
</score-partwise>`

const VALID_TIMEWISE = `<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="4.0">
  <part-list/>
</score-timewise>`

const STANDARD_PUBLIC_DOCTYPE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC
  "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list/>
</score-partwise>`

const EXTERNAL_FILE_ENTITY = `<?xml version="1.0"?>
<!DOCTYPE score-partwise [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<score-partwise>
  <credit><credit-words>&xxe;</credit-words></credit>
</score-partwise>`

const EXTERNAL_HTTP_ENTITY = `<?xml version="1.0"?>
<!DOCTYPE score-partwise [
  <!ENTITY xxe SYSTEM "https://example.invalid/external.txt">
]>
<score-partwise>
  <credit><credit-words>&xxe;</credit-words></credit>
</score-partwise>`

function assertAccepted(xml) {
  const result = validateMusicXml(xml)
  assert.equal(result.ok, true)
}

function assertRejected(xml) {
  const result = validateMusicXml(xml)
  assert.equal(result.ok, false)
  assert.ok(result.error)
  assert.equal(typeof result.error.message, 'string')
  assert.ok(result.error.message.length > 0)
}

class EmptyDocument {
  querySelector() {
    return null
  }

  querySelectorAll() {
    return []
  }
}

class SpyDOMParser {
  static calls = 0

  parseFromString() {
    SpyDOMParser.calls += 1
    return new EmptyDocument()
  }
}

function withSpyDomParser(run) {
  const original = globalThis.DOMParser
  SpyDOMParser.calls = 0
  globalThis.DOMParser = SpyDOMParser

  try {
    return run()
  } finally {
    if (original === undefined) {
      delete globalThis.DOMParser
    } else {
      globalThis.DOMParser = original
    }
  }
}

describe('MusicXML security policy — valid compatibility', () => {
  test('valid score-partwise without doctype is accepted', () => {
    assertAccepted(VALID_PARTWISE)
  })

  test('valid score-timewise without doctype is accepted', () => {
    assertAccepted(VALID_TIMEWISE)
  })

  test('standard Recordare PUBLIC doctype is accepted without resolving it', () => {
    assertAccepted(STANDARD_PUBLIC_DOCTYPE)
  })

  test('Audiveris MusicXML 4.0.3 PUBLIC doctype is accepted', () => {
    assertAccepted(`<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE score-partwise PUBLIC
        "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN"
        "http://www.musicxml.org/dtds/partwise.dtd">
      <score-partwise version="4.0.3">
        <part-list/>
      </score-partwise>`)
  })

  test('XML declaration, namespace and version attributes are accepted', () => {
    assertAccepted(`<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise
        xmlns="http://www.musicxml.org/ns/musicxml"
        version="4.0">
        <part-list/>
      </score-partwise>`)
  })

  test('predefined XML entities remain accepted', () => {
    assertAccepted(`<score-partwise>
      <credit>
        <credit-words>&amp; &lt; &gt; &quot; &apos;</credit-words>
      </credit>
    </score-partwise>`)
  })

  test('numeric character references remain accepted', () => {
    assertAccepted(`<score-partwise>
      <credit><credit-words>&#65; &#x41;</credit-words></credit>
    </score-partwise>`)
  })
})

describe('MusicXML security policy — basic validation', () => {
  test('empty XML is rejected', () => {
    assertRejected('   ')
  })

  test('non-string content is rejected without an uncaught exception', () => {
    assert.doesNotThrow(() => {
      assertRejected({ xml: VALID_PARTWISE })
    })
  })

  test('malformed or unclosed XML is rejected', () => {
    assertRejected('<score-partwise><part></score-partwise>')
  })

  test('non-MusicXML root is rejected', () => {
    assertRejected('<catalog><item/></catalog>')
  })

  test('nested MusicXML element is not accepted as the document root', () => {
    assertRejected('<wrapper><score-partwise/></wrapper>')
  })

  test('fake root marker inside a comment is rejected', () => {
    assertRejected('<!-- <score-partwise> --><wrapper/>')
  })

  test('fake root marker inside CDATA is rejected', () => {
    assertRejected('<wrapper><![CDATA[<score-partwise>]]></wrapper>')
  })

  test('null byte is rejected', () => {
    assertRejected('<score-partwise>\u0000</score-partwise>')
  })

  test('invalid XML control character is rejected', () => {
    assertRejected('<score-partwise>\u0001</score-partwise>')
  })

  test('content exceeding the 10 MB limit is rejected', () => {
    const xml =
      '<score-partwise>' +
      ' '.repeat((10 * 1024 * 1024) + 1) +
      '</score-partwise>'

    assertRejected(xml)
  })
})

describe('MusicXML security policy — entity and XXE protection', () => {
  test('internal entity declaration is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise [
      <!ENTITY lesson "unsafe">
    ]>
    <score-partwise>&lesson;</score-partwise>`)
  })

  test('external file entity is rejected', () => {
    assertRejected(EXTERNAL_FILE_ENTITY)
  })

  test('external HTTP entity is rejected', () => {
    assertRejected(EXTERNAL_HTTP_ENTITY)
  })

  test('SYSTEM doctype is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise
      SYSTEM "https://example.invalid/musicxml.dtd">
      <score-partwise/>`)
  })

  test('unknown PUBLIC doctype is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise
      PUBLIC "-//Unknown//DTD Score//EN"
      "https://example.invalid/unknown.dtd">
      <score-partwise/>`)
  })

  test('doctype with an internal subset is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise [
      <!ELEMENT score-partwise ANY>
    ]>
    <score-partwise/>`)
  })

  test('parameter entity syntax is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise [
      <!ENTITY % remote
        SYSTEM "https://example.invalid/remote.dtd">
      %remote;
    ]>
    <score-partwise/>`)
  })

  test('billion-laughs entity expansion payload is rejected', () => {
    assertRejected(`<!DOCTYPE score-partwise [
      <!ENTITY a "ha">
      <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
      <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
    ]>
    <score-partwise>&c;</score-partwise>`)
  })

  test('mixed-case entity declaration is rejected before parsing', () => {
    assertRejected(`<!DOCTYPE score-partwise [
      <!EnTiTy unsafe "value">
    ]>
    <score-partwise>&unsafe;</score-partwise>`)
  })

  test('custom named entity reference is rejected', () => {
    assertRejected(
      '<score-partwise><credit-words>&custom;</credit-words></score-partwise>'
    )
  })
})

describe('MusicXML security policy — external inclusion protection', () => {
  test('xml-stylesheet processing instruction is rejected', () => {
    assertRejected(`<?xml version="1.0"?>
      <?xml-stylesheet
        type="text/xsl"
        href="https://example.invalid/style.xsl"?>
      <score-partwise/>`)
  })

  test('XInclude structure is rejected', () => {
    assertRejected(`<score-partwise
      xmlns:xi="http://www.w3.org/2001/XInclude">
      <xi:include
        href="https://example.invalid/external.xml"
        parse="xml"/>
    </score-partwise>`)
  })

  test('doctype and actual root name mismatch is rejected', () => {
    assertRejected(`<!DOCTYPE score-timewise PUBLIC
      "-//Recordare//DTD MusicXML 4.0 Timewise//EN"
      "http://www.musicxml.org/dtds/timewise.dtd">
      <score-partwise/>`)
  })
})

describe('MusicXML parser boundary', () => {
  test('unsafe XML is rejected before DOMParser executes', () => {
    withSpyDomParser(() => {
      const result = parseMusicXml(EXTERNAL_FILE_ENTITY)

      assert.equal(SpyDOMParser.calls, 0)
      assert.ok(result.error)
      assert.deepEqual(result.notes, [])
    })
  })

  test('valid MusicXML is allowed to reach DOMParser', () => {
    withSpyDomParser(() => {
      const result = parseMusicXml(VALID_PARTWISE)

      assert.equal(SpyDOMParser.calls, 1)
      assert.equal(result.error, undefined)
      assert.deepEqual(result.notes, [])
    })
  })
})
