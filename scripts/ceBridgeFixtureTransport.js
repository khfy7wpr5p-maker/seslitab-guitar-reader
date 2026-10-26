// DOM script.textContent is not an HTML parser input. Serialize exactly once:
// Keep payload fidelity explicit without nested script-string escaping.
export function framePayloadScript(payload) {
  return 'parent.postMessage(' + JSON.stringify(payload) + ', location.origin);'
}
