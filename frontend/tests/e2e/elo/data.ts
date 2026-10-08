import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  newMatch,
  newMatchParticipant,
  newScenario,
  ratingHistoryPath,
  skillRatingsPath,
} from '../../../src/lib/schema/collections.js'
import type { Instrument } from '../../../src/lib/schema/types.js'
import type { TestData, TestPlayer } from '../support/data.js'
import { TEST_ENV } from '../support/environment.js'

type Outcome = 'win' | 'loss' | 'draw' | 'resign' | 'disconnect'

interface ResultEvent {
  matchId: string
  uid: string
  eloAfter: number
  eloDelta: number
}

export async function prepareResult(
  data: TestData,
  player: TestPlayer,
  opponent: TestPlayer,
  outcome: Outcome = 'win',
  instrument: Instrument = 'piano',
) {
  const matchId = data.id('match')
  const scenarioId = data.id('scenario')
  await data.seed([
    [
      'scenarios/' + scenarioId,
      newScenario({
        id: scenarioId,
        authorUid: player.uid,
        title: 'Synthetic UI result fixture',
        instrument,
      }),
    ],
    [
      'matches/' + matchId,
      newMatch({
        id: matchId,
        mode: 'versus_1v1',
        state: 'in_progress',
        scenarioId,
        scenarioVersionId: data.id('version'),
        hostUid: player.uid,
        participantUids: [player.uid, opponent.uid],
      }),
    ],
    ...[player, opponent].map(
      ({ uid }) =>
        [
          'matches/' + matchId + '/participants/' + uid,
          newMatchParticipant({ uid, matchId, partId: 'lead' }),
        ] as const,
    ),
  ])
  data.track(
    [player, opponent].map(({ uid }) => ratingHistoryPath(uid, instrument) + '/' + matchId),
  )
  const reason =
    outcome === 'resign' ? 'resigned' : outcome === 'disconnect' ? 'disconnected' : 'completed'
  const result = {
    matchId,
    instrument,
    participantUids: [player.uid, opponent.uid],
    normalizedScores:
      outcome === 'loss' ? [0.7, 0.9] : outcome === 'draw' ? [0.8, 0.8] : [0.9, 0.7],
    reason,
    forfeitingUid: reason === 'completed' ? null : player.uid,
  }
  const apply = async (): Promise<ResultEvent[]> => {
    const python =
      process.env.E2E_PYTHON ??
      resolve(
        '../backend/.venv',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
      )
    const { stdout } = await promisify(execFile)(
      python,
      [resolve('../backend/scripts/finalize_ui_match.py'), JSON.stringify(result)],
      {
        cwd: resolve('../backend'),
        timeout: 15_000,
        env: {
          ...process.env,
          FIRESTORE_EMULATOR_HOST: TEST_ENV.firestoreHost,
          FIREBASE_AUTH_EMULATOR_HOST: TEST_ENV.authHost,
          GCLOUD_PROJECT: TEST_ENV.projectId,
        },
      },
    )
    return JSON.parse(stdout) as ResultEvent[]
  }
  return { matchId, apply }
}

export async function rating(data: TestData, player: TestPlayer, instrument: Instrument = 'piano') {
  return data.read(skillRatingsPath(player.uid) + '/' + instrument)
}
