# SesliTab ↔ Smoosic mobil runtime haritası

## Ana veri akışı

```text
PDF / MusicXML / TAB
        |
        v
SesliTab host result/source lifecycle
        |
        | accepted MusicXML + source filename
        v
src/smoosicEditorTabUi.js
        |
        | same-origin File/DataTransfer/change
        v
#smoosic-editor-frame -> /smoosic-editor/index.html
        |
        v
Smoosic mobile runtime
  - XmlToSmo
  - changeScore
  - note editing / transpose
  - playback / metronome
  - MusicXML export
```

## Mobil geometri/event akışı

```text
Host parent scroll -----------------------+
Host resize ------------------------------|
Host orientationchange -------------------|
Host visualViewport.scroll ---------------|
Host visualViewport.resize ---------------+
                                          v
                                viewport-fit.js::scheduleFit
                                          |
                                          v
                                requestAnimationFrame
                                          |
                                          v
                                fitEditorFrame
                                  |             |
                                  |             +--> --seslitab-mobile-menu-top
                                  |
                                  +--> iframe.style.height
```

`fitEditorFrame` yüksekliği parent visual viewport alt sınırı ile iframe'in o anki `getBoundingClientRect().top` değeri arasından türetir. Parent scroll `frameTop` değerini değiştirdiği için scroll ile iframe yüksekliği birbirine bağlıdır.

## Menü akışı

```text
Alt mobil toolbar / Menü
        |
        v
body.mobile-menu-open toggle
        |
        v
mobile-layout.js
        |
        +--> dismiss transient modal/dropdown
        +--> portal outer #controls-left to body
        +--> blur retained focus
        +--> scrollTop=0 stabilization
        v
mobile.css
        |
        +--> body > #controls-left fixed outer shell
        +--> nested #controls-left.controls-left normal flow
```

## Source lifecycle sınırı

Host `sourceTransitionPending()` true olduğunda iframe geçici olarak `hidden=true` yapılır. Bu davranış yalnız PDF/MusicXML source transition lifecycle'ına bağlı olmalıdır. P1 diagnostic parent scroll sırasında `hidden` değişikliği veya editor input `change` olayı olup olmadığını ölçer; scroll ile source lifecycle birbirine bağlanmamalıdır.

## Audio/playback sınırı

`experiments/smoosic-mobile/src/index.js` audio sampler, metronom ve playback işlevlerini yürütür. P0/P1 layout diagnostic bunları değiştirmez ve playback'i quality/OMR hatası nedeniyle kapatmaz.
