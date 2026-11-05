/**
 * Unsaved editor work kept in this browser, so a reload can offer it back.
 *
 * Keyed by account and scenario, so one person's draft is never offered to
 * another account on a shared machine. Storage can be full or blocked; recovery
 * is a convenience, so every failure just means there is nothing to recover.
 */
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'

export interface RecoverableDraft {
  draft: ScenarioDraft
  /** The version this work started from, so restoring it can still detect a conflict. */
  baseVersionId: string | null
  savedAt: number
}

function key(uid: string, scenarioId: string | null) {
  return `coj:scenario-draft:v1:${uid}:${scenarioId ?? 'new'}`
}

export function readRecoverableDraft(
  uid: string,
  scenarioId: string | null,
): RecoverableDraft | null {
  try {
    const stored = localStorage.getItem(key(uid, scenarioId))
    return stored ? (JSON.parse(stored) as RecoverableDraft) : null
  } catch {
    return null
  }
}

export function writeRecoverableDraft(
  uid: string,
  scenarioId: string | null,
  value: RecoverableDraft,
) {
  try {
    localStorage.setItem(key(uid, scenarioId), JSON.stringify(value))
  } catch {
    // Nothing to recover later; the editor itself is unaffected.
  }
}

export function clearRecoverableDraft(uid: string, scenarioId: string | null) {
  try {
    localStorage.removeItem(key(uid, scenarioId))
  } catch {
    // Same as above.
  }
}
