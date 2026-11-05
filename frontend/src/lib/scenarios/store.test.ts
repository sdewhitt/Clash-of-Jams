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
    /** Runs just before a transaction reads, to simulate a write from another tab. */
    beforeTransactionRead: undefined as (() => void) | undefined,
    nextId: () => `generated-${++counter}`,
    reset() {
      docs.clear()
      counter = 0
      this.beforeTransactionRead = undefined
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
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: (orderField: string, direction: string) => ({ orderField, direction }),
    limit: (count: number) => ({ count }),
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      fake.docs.set(target.path, { ...fake.docs.get(target.path), ...data })
    },
    runTransaction: async (_db: unknown, run: (transaction: unknown) => Promise<unknown>) => {
      const pending: (() => void)[] = []
      const read = (target: { path: string }) => ({
        exists: () => fake.docs.has(target.path),
        data: () => fake.docs.get(target.path),
      })
      const result = await run({
        get: async (target: { path: string }) => {
          fake.beforeTransactionRead?.()
          return read(target)
        },
        set: (target: { path: string }, data: Record<string, unknown>) =>
          pending.push(() => fake.docs.set(target.path, data)),
        update: (target: { path: string }, data: Record<string, unknown>) =>
          pending.push(() =>
            fake.docs.set(target.path, { ...fake.docs.get(target.path), ...data }),
          ),
        delete: (target: { path: string }) => pending.push(() => fake.docs.delete(target.path)),
      })
      pending.forEach((write) => write())
      return result
    },
    getDocs: async (built: {
      path: string
      constraints?: {
        field?: string
        op?: string
        value?: unknown
        orderField?: string
        direction?: string
        count?: number
      }[]
    }) => {
      const constraints = built.constraints ?? []
      const compare = (
        data: Record<string, unknown>,
        field: string,
        op: string,
        value: unknown,
      ) => {
        if (op === '>') return (data[field] as number) > (value as number)
        if (op === '<') return (data[field] as number) < (value as number)
        return data[field] === value
      }
      let matches = [...fake.docs.entries()]
        .filter(([path]) => path.startsWith(`${built.path}/`))
        .filter(([path]) => !path.slice(built.path.length + 1).includes('/'))
        .filter(([, data]) =>
          constraints.every(
            ({ field, op, value }) =>
              field === undefined || compare(data, field, op as string, value),
          ),
        )
      for (const { orderField, direction } of constraints) {
        if (!orderField || orderField === 'updatedAt') continue
        const sign = direction === 'desc' ? -1 : 1
        matches = [...matches].sort(
          ([, x], [, y]) => sign * ((x[orderField] as number) - (y[orderField] as number)),
        )
      }
      const count = constraints.find((constraint) => constraint.count !== undefined)?.count
      if (count !== undefined) matches = matches.slice(0, count)
      return {
        size: matches.length,
        docs: matches.map(([path, data]) => ({ ref: { path }, data: () => data })),
      }
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

const {
  deleteScenario,
  listMyScenarios,
  listScenarioVersions,
  loadScenario,
  renameScenarioVersion,
  revertToVersion,
  saveScenarioDraft,
  ScenarioConflictError,
  VERSION_PAGE_SIZE,
} = await import('@/lib/scenarios/store')

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

describe('version history', () => {
  /** Saves a scenario `count` times, returning the version ids oldest first. */
  async function savedVersions(count: number) {
    const draft = draftWithNotes()
    const first = await saveScenarioDraft({ uid: 'user-1', draft })
    const ids = [first.versionId]
    for (let saved = 1; saved < count; saved++) {
      const next = await saveScenarioDraft({
        uid: 'user-1',
        draft: { ...draft, title: `Take ${saved + 1}` },
        scenarioId: first.scenarioId,
      })
      ids.push(next.versionId)
    }
    return { scenarioId: first.scenarioId, ids }
  }

  describe('listing', () => {
    it('returns versions newest first', async () => {
      const { scenarioId } = await savedVersions(3)

      const listed = await listScenarioVersions(scenarioId)

      expect(listed.map((version) => version.versionNumber)).toEqual([3, 2, 1])
    })

    it('pages through older versions', async () => {
      const { scenarioId } = await savedVersions(VERSION_PAGE_SIZE + 2)

      const firstPage = await listScenarioVersions(scenarioId)
      const secondPage = await listScenarioVersions(scenarioId, firstPage.at(-1)?.versionNumber)

      expect(firstPage).toHaveLength(VERSION_PAGE_SIZE)
      expect(secondPage.map((version) => version.versionNumber)).toEqual([2, 1])
    })
  })

  describe('renaming', () => {
    it('stores a trimmed name and leaves the chart alone', async () => {
      const { scenarioId, ids } = await savedVersions(1)
      const before = storedVersion(scenarioId, ids[0]).chart

      const stored = await renameScenarioVersion({
        scenarioId,
        versionId: ids[0],
        name: '  Bridge rewrite ',
      })

      expect(stored).toBe('Bridge rewrite')
      expect(storedVersion(scenarioId, ids[0]).name).toBe('Bridge rewrite')
      expect(storedVersion(scenarioId, ids[0]).chart).toEqual(before)
    })

    it('clears the name when given only whitespace', async () => {
      const { scenarioId, ids } = await savedVersions(1)

      expect(await renameScenarioVersion({ scenarioId, versionId: ids[0], name: '   ' })).toBeNull()
    })
  })

  describe('reverting', () => {
    it('makes the target current and deletes every later version', async () => {
      const { scenarioId, ids } = await savedVersions(4)

      const result = await revertToVersion({
        uid: 'user-1',
        scenarioId,
        targetVersionId: ids[1],
        expectedCurrentVersionId: ids[3],
      })

      expect(result).toEqual({ versionNumber: 2, deletedCount: 2 })
      expect(storedScenario(scenarioId)).toMatchObject({
        currentVersionId: ids[1],
        currentVersionNumber: 2,
      })
      const left = await listScenarioVersions(scenarioId)
      expect(left.map((version) => version.id)).toEqual([ids[1], ids[0]])
    })

    it('numbers the next save straight after the target, under a new id', async () => {
      const { scenarioId, ids } = await savedVersions(3)
      await revertToVersion({
        uid: 'user-1',
        scenarioId,
        targetVersionId: ids[0],
        expectedCurrentVersionId: ids[2],
      })

      const next = await saveScenarioDraft({
        uid: 'user-1',
        draft: { ...draftWithNotes(), title: 'After the revert' },
        scenarioId,
      })

      expect(next.versionNumber).toBe(2)
      expect(ids).not.toContain(next.versionId)
    })

    it('restores recorded settings but never visibility', async () => {
      const { scenarioId, ids } = await savedVersions(2)
      const path = `scenarios/${scenarioId}`
      fake.docs.set(path, { ...fake.docs.get(path), visibility: 'private' })
      const versionPath = `${path}/versions/${ids[0]}`
      fake.docs.set(versionPath, {
        ...fake.docs.get(versionPath),
        metadata: {
          title: 'Original',
          description: 'First pass',
          instrument: 'guitar',
          authorDifficulty: 2,
          genres: [],
          tags: [],
        },
      })

      await revertToVersion({
        uid: 'user-1',
        scenarioId,
        targetVersionId: ids[0],
        expectedCurrentVersionId: ids[1],
      })

      expect(storedScenario(scenarioId)).toMatchObject({
        title: 'Original',
        instrument: 'guitar',
        authorDifficulty: 2,
        visibility: 'private',
      })
    })

    it('keeps the current settings when the target recorded none', async () => {
      const { scenarioId, ids } = await savedVersions(2)
      const legacyPath = `scenarios/${scenarioId}/versions/${ids[0]}`
      const { metadata: _metadata, ...legacy } = fake.docs.get(legacyPath) as Record<
        string,
        unknown
      >
      fake.docs.set(legacyPath, legacy)

      await revertToVersion({
        uid: 'user-1',
        scenarioId,
        targetVersionId: ids[0],
        expectedCurrentVersionId: ids[1],
      })

      expect(storedScenario(scenarioId).title).toBe('Take 2')
    })

    it('changes nothing if the scenario moved on since the history was read', async () => {
      const { scenarioId, ids } = await savedVersions(3)

      await expect(
        revertToVersion({
          uid: 'user-1',
          scenarioId,
          targetVersionId: ids[0],
          expectedCurrentVersionId: ids[1],
        }),
      ).rejects.toBeInstanceOf(ScenarioConflictError)

      expect(storedScenario(scenarioId).currentVersionId).toBe(ids[2])
      expect(await listScenarioVersions(scenarioId)).toHaveLength(3)
    })

    it('notices a save that lands after the later versions were listed', async () => {
      const { scenarioId, ids } = await savedVersions(2)
      fake.beforeTransactionRead = () => {
        fake.beforeTransactionRead = undefined
        const path = `scenarios/${scenarioId}`
        fake.docs.set(path, { ...fake.docs.get(path), currentVersionId: 'from-another-tab' })
      }

      await expect(
        revertToVersion({
          uid: 'user-1',
          scenarioId,
          targetVersionId: ids[0],
          expectedCurrentVersionId: ids[1],
        }),
      ).rejects.toBeInstanceOf(ScenarioConflictError)
      expect(storedVersion(scenarioId, ids[1])).toBeDefined()
    })

    it.each([
      [null, /sign in/i],
      ['user-2', /your own/i],
    ])('refuses uid %j', async (uid, message) => {
      const { scenarioId, ids } = await savedVersions(2)

      await expect(
        revertToVersion({
          uid,
          scenarioId,
          targetVersionId: ids[0],
          expectedCurrentVersionId: ids[1],
        }),
      ).rejects.toThrow(message)
      expect(storedVersion(scenarioId, ids[1])).toBeDefined()
    })

    it('reports a target that has already been deleted', async () => {
      const { scenarioId, ids } = await savedVersions(1)

      await expect(
        revertToVersion({
          uid: 'user-1',
          scenarioId,
          targetVersionId: 'gone',
          expectedCurrentVersionId: ids[0],
        }),
      ).rejects.toThrow(/no longer available/i)
    })
  })
})

describe('safe saving', () => {
  const edited = (title: string) => ({ ...draftWithNotes(), title })

  it('records the settings on each version', async () => {
    const first = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })

    expect(storedVersion(first.scenarioId, first.versionId).metadata).toMatchObject({
      title: 'Chromatic Warmup',
      description: 'Four bars, slowly.',
      authorDifficulty: 4,
    })
  })

  it('writes nothing when the content matches the current version', async () => {
    const draft = draftWithNotes()
    const first = await saveScenarioDraft({ uid: 'user-1', draft })

    const again = await saveScenarioDraft({ uid: 'user-1', draft, scenarioId: first.scenarioId })

    expect(again).toMatchObject({ versionId: first.versionId, outcome: 'unchanged' })
    expect(storedScenario(first.scenarioId).currentVersionNumber).toBe(1)
  })

  it('returns the same version when a completed save is retried from a stale base', async () => {
    const first = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })
    const args = {
      uid: 'user-1',
      draft: edited('Take 2'),
      scenarioId: first.scenarioId,
      baseVersionId: first.versionId,
    }
    const saved = await saveScenarioDraft(args)

    const retried = await saveScenarioDraft(args)

    expect(retried).toMatchObject({ versionId: saved.versionId, outcome: 'unchanged' })
  })

  it('changes only the parent for a visibility change', async () => {
    const first = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })

    const result = await saveScenarioDraft({
      uid: 'user-1',
      draft: { ...draftWithNotes(), visibility: 'public' },
      scenarioId: first.scenarioId,
    })

    expect(result.outcome).toBe('visibility')
    expect(storedScenario(first.scenarioId)).toMatchObject({
      visibility: 'public',
      currentVersionNumber: 1,
    })
  })

  it('refuses to save over a version it did not start from', async () => {
    const first = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })
    const other = await saveScenarioDraft({
      uid: 'user-1',
      draft: edited('From another tab'),
      scenarioId: first.scenarioId,
      baseVersionId: first.versionId,
    })

    await expect(
      saveScenarioDraft({
        uid: 'user-1',
        draft: edited('From this tab'),
        scenarioId: first.scenarioId,
        baseVersionId: first.versionId,
      }),
    ).rejects.toBeInstanceOf(ScenarioConflictError)

    expect(storedScenario(first.scenarioId)).toMatchObject({
      title: 'From another tab',
      currentVersionId: other.versionId,
    })
  })

  it('carries scoring rules and media forward', async () => {
    const first = await saveScenarioDraft({ uid: 'user-1', draft: draftWithNotes() })
    const path = `scenarios/${first.scenarioId}/versions/${first.versionId}`
    const scoringRules = { ...DEFAULT_SCORING_RULES, hitWindowMs: 999 }
    fake.docs.set(path, { ...fake.docs.get(path), scoringRules, mediaAssetIds: ['track'] })

    const next = await saveScenarioDraft({
      uid: 'user-1',
      draft: edited('Take 2'),
      scenarioId: first.scenarioId,
    })

    expect(storedVersion(first.scenarioId, next.versionId)).toMatchObject({
      scoringRules,
      mediaAssetIds: ['track'],
    })
  })
})
