// Upload Queue — FIFO queue for OMR jobs awaiting worker assignment.

import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { QueueFullError } from '../utils/errors.js'

const queue = []

export async function enqueue(entry) {
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
export function remove(jobId) { const i = queue.findIndex((e) => e.jobId === jobId); if (i === -1) return false; queue.splice(i, 1); return true }
export function snapshot() { return queue.map((e) => ({ ...e })) }
