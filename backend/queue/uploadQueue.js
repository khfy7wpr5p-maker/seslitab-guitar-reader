// Upload Queue — FIFO queue for OMR jobs awaiting worker assignment.

import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { QueueFullError } from '../utils/errors.js'

const queue = []

export async function enqueue(entry) {
  const existingIndex = queue.findIndex((e) => e.jobId === entry.jobId)
  if (existingIndex !== -1) {
    return { accepted: true, duplicate: true, queuePosition: existingIndex + 1 }
  }
  if (queue.length >= GATEWAY_CONFIG.maxQueueSize) throw new QueueFullError()
  const e = { ...entry, priority: entry.priority || 'normal', enqueuedAt: new Date().toISOString() }
  if (e.priority === 'high') {
    const i = queue.findIndex((x) => x.priority === 'normal')
    if (i === -1) queue.push(e); else queue.splice(i, 0, e)
  } else queue.push(e)
  return { accepted: true, queuePosition: queue.indexOf(e) + 1 }
}

export function dequeue() { return queue.shift() || null }
export function peek() { return queue[0] || null }
export function size() { return queue.length }
export function isEmpty() { return !queue.length }
export function contains(jobId) { return queue.some((e) => e.jobId === jobId) }
export function remove(jobId) {
  let removed = false
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].jobId === jobId) { queue.splice(i, 1); removed = true }
  }
  return removed
}
export function clear() { queue.length = 0 }
export function snapshot() { return queue.map((e) => ({ ...e })) }
