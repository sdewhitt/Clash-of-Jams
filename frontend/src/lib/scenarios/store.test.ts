/**
 * User story #25: saving a scenario and reading it back.
 *
 * Firestore is replaced with an in-memory stand-in so the shape of what gets
 * written is asserted directly, including that a save and a reopen agree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addNote } from '@/lib/chart/edits'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import { draftFromDocuments, emptyDraft } from '@/pages/scenario_editor/draft'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>()
  let counter = 0
  return {
    docs,
    nextId: () => `generated-${++counter}`,
    reset: () => {
      docs.clear()
      counter = 0
    },
  }
})

vi.mock('firebase/firestore', () => {
  const ref = (path: string, id: string) => ({ path: `${path}/${id}`, id })

  return {
    serverTimestamp: () => 'server-timestamp',
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (first: { path: string }, path?: string, id?: string) =>
      path === undefined ? ref(first.path, fake.nextId()) : ref(path, id as string),
    getDoc: async (target: { path: string }) => ({
      exists: () => fake.docs.has(target.path),
      data: () => fake.docs.get(target.path),
    }),
    query: (source: { path: string }, ...constraints: { field: string; value: unknown }[]) => ({
      path: source.path,
      constraints,
    }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    orderBy: () => ({}),
    limit: () => ({}),
    getDocs: async (built: { path: string; constraints?: { field: string; value: unknown }[] }) => {
      const matches = [...fake.docs.entries()]
        .filter(([path]) => path.startsWith(`${built.path}/`))
        .filter(([path]) => !path.slice(built.path.length + 1).includes('/'))
        .filter(([, data]) =>
          (built.constraints ?? []).every(
            (constraint) =>
              constraint.field === undefined || data[constraint.field] === constraint.value,
          ),
        )
      return { docs: matches.map(([path, data]) => ({ ref: { path }, data: () => data })) }
    },
    writeBatch: () => {
      const pending: (() => void)[] = []
      return {
        set: (target: { path: string }, data: Record<string, unknown>) =>
          pending.push(() => fake.docs.set(target.path, data)),
        update: (target: { path: string }, data: Record<string, unknown>) =>
          pending.push(() =>
            fake.docs.set(target.path, { ...fake.docs.get(target.path), ...data }),
          ),
        delete: (target: { path: string }) => pending.push(() => fake.docs.delete(target.path)),
        commit: async () => pending.forEach((write) => write()),
      }
    },
  }
})

const { deleteScenario, listMyScenarios, loadScenario, saveScenarioDraft } =
  await import('@/lib/scenarios/store')

function draftWithNotes(): ScenarioDraft {
  const draft = emptyDraft()
  return {
    ...draft,
    title: 'Chromatic Warmup',
    description: 'Four bars, slowly.',
    authorDifficulty: 4,
    chart: addNote(
      addNote(draft.chart, 'lead', { midiPitch: 60, startBeat: 0, durationBeats: 1 }),
      'lead',
      { midiPitch: 61, startBeat: 1, durationBeats: 0.5 },
    ),
  }
}

function storedScenario(id: string) {
  return fake.docs.get(`scenarios/${id}`) as unknown as Scenario
}

function storedVersion(scenarioId: string, versionId: string) {
  return fake.docs.get(
    `scenarios/${scenarioId}/versions/${versionId}`,
  ) as unknown as ScenarioVersion
}

beforeEach(() => {
  fake.reset()
})

describe('saving', () => {
  it('is rejected while signed out', async () => {
    await expect(saveScenarioDraft({ uid: null, draft: draftWithNotes() })).rejects.toThrow(
      /sign in/i,
    )
    expect(fake.docs.size).toBe(0)
  })

  it('is rejected without a title', async () => {
    await expect(
      saveScenarioDraft({ uid: 'user-1', draft: { ...emptyDraft(), title: '   ' } }),
    ).rejects.toThrow(/title/i)
    expect(fake.docs.size).toBe(0)
  })

  it('serialises the draft into the scenario and version documents', async () => {
    const draft = draftWithNotes()

    const result = await saveScenarioDraft({ uid: 'user-1', draft })

    expect(storedScenario(result.scenarioId)).toMatchObject({
      id: result.scenarioId,
      authorUid: 'user-1',
      title: 'Chromatic Warmup',
      description: 'Four bars, slowly.',
      instrument: 'piano',
      visibility: 'private',
      authorDifficulty: 4,
      currentVersionId: result.versionId,
      currentVersionNumber: 1,
      playCount: 0,
      ratingCount: 0,
      crowdDifficulty: null,
    })

    expect(storedVersion(result.scenarioId, result.versionId)).toMatchObject({
      id: result.versionId,
      scenarioId: result.scenarioId,
      versionNumber: 1,
      createdByUid: 'user-1',
      chart: draft.chart,
      scoringRules: DEFAULT_SCORING_RULES,
      mediaAssetIds: [],
    })
  })

  it('records the chart length in milliseconds', async () => {
    const draft = draftWithNotes()

    const result = await saveScenarioDraft({ uid: 'user-1', draft })

    // Last note ends on beat 1.5; at the default 120bpm that is 750ms.
    expect(storedVersion(result.scenarioId, result.versionId).durationMs).toBe(750)
  })

  it('trims the title it stores', async () => {
    const result = await saveScenarioDraft({
      uid: 'user-1',
      draft: { ...emptyDraft(), title: '  Spaced Out  ' },
    })

    expect(storedScenario(result.scenarioId).title).toBe('Spaced Out')
  })
})

describe('saving over an existing scenario', () => {
  it('writes a new version and repoints the scenario at it', async () => {
    const draft = draftWithNotes()
    const first = await saveScenarioDraft({ uid: 'user-1', draft })

    const second = await saveScenarioDraft({
      uid: 'user-1',
      draft: { ...draft, title: 'Chromatic Warmup v2' },
      scenarioId: first.scenarioId,
    })

    expect(second.scenarioId).toBe(first.scenarioId)
    expect(second.versionNumber).toBe(2)
    expect(second.versionId).not.toBe(first.versionId)

    const scenario = storedScenario(first.scenarioId)
    expect(scenario.currentVersionId).toBe(second.versionId)
    expect(scenario.currentVersionNumber).toBe(2)
    expect(scenario.title).toBe('Chromatic Warmup v2')

    // The earlier version stays exactly as it was written.
    expect(storedVersion(first.scenarioId, first.versionId).versionNumber).toBe(1)
  })

  it('refuses to write over a scenario owned by someone else', async () => {
    const mine = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })

    await expect(
      saveScenarioDraft({
        uid: 'user-2',
        draft: draftWithNotes(),
        scenarioId: mine.scenarioId,
      }),
    ).rejects.toThrow(/your own/i)
    expect(storedScenario(mine.scenarioId).currentVersionNumber).toBe(1)
  })

  it('refuses a scenario that is not there', async () => {
    await expect(
      saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes(), scenarioId: 'missing' }),
    ).rejects.toThrow(/no longer exists/i)
  })
})

describe('reopening', () => {
  it('round trips a saved scenario back to an equivalent draft', async () => {
    const draft = draftWithNotes()
    const result = await saveScenarioDraft({ uid: 'user-1', draft })

    const { scenario, version } = await loadScenario(result.scenarioId)

    expect(draftFromDocuments(scenario, version)).toEqual(draft)
  })

  it('reports a scenario that is no longer there', async () => {
    await expect(loadScenario('missing')).rejects.toThrow(/no longer exists/i)
  })
})

describe('deleting', () => {
  it('removes the scenario and every version of it', async () => {
    const draft = draftWithNotes()
    const first = await saveScenarioDraft({ uid: 'user-1', draft })
    await saveScenarioDraft({ uid: 'user-1', draft, scenarioId: first.scenarioId })
    const other = await saveScenarioDraft({ uid: 'user-1', draft })

    await deleteScenario({ uid: 'user-1', scenarioId: first.scenarioId })

    expect([...fake.docs.keys()].sort()).toEqual(
      [
        `scenarios/${other.scenarioId}`,
        `scenarios/${other.scenarioId}/versions/${other.versionId}`,
      ].sort(),
    )
    expect(await listMyScenarios('user-1')).toHaveLength(1)
    await expect(loadScenario(first.scenarioId)).rejects.toThrow(/no longer exists/i)
  })

  it('is rejected while signed out', async () => {
    const mine = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })

    await expect(deleteScenario({ uid: null, scenarioId: mine.scenarioId })).rejects.toThrow(
      /sign in/i,
    )
    expect(storedScenario(mine.scenarioId)).toBeDefined()
  })

  it('refuses a scenario owned by someone else', async () => {
    const mine = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })

    await expect(deleteScenario({ uid: 'user-2', scenarioId: mine.scenarioId })).rejects.toThrow(
      /your own/i,
    )
    expect(storedScenario(mine.scenarioId)).toBeDefined()
    expect(storedVersion(mine.scenarioId, mine.versionId)).toBeDefined()
  })

  it('treats a scenario that is already gone as done', async () => {
    await expect(deleteScenario({ uid: 'user-1', scenarioId: 'missing' })).resolves.toBeUndefined()
  })
})

describe('the author library', () => {
  it('lists a saved scenario, and only the ones the caller authored', async () => {
    const mine = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })
    await saveScenarioDraft({ uid: 'user-2', draft: draftWithNotes() })

    const listed = await listMyScenarios('user-1')

    expect(listed.map((scenario) => scenario.id)).toEqual([mine.scenarioId])
  })

  it('is empty for an author who has saved nothing', async () => {
    expect(await listMyScenarios('user-1')).toEqual([])
  })
})
