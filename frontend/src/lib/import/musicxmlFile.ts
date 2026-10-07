/**
 * Reads a MusicXML upload, in either of the two forms notation software writes.
 *
 * `.musicxml` and `.xml` are the score as plain text. `.mxl` is a ZIP archive
 * holding that same text plus a META-INF/container.xml naming it. The two are
 * told apart by their bytes rather than the file extension, since a renamed
 * file is a common way for an upload to go wrong.
 */
import { strFromU8, unzipSync } from 'fflate'

import { MusicXmlError, parseMusicXml } from '@/lib/import/musicxml'
import type { MusicXmlImport } from '@/lib/import/musicxml'

/** What the editor's file picker offers. */
export const MUSICXML_ACCEPT = '.mxl,.musicxml,.xml'

/** Far above any real score; keeps a mistaken upload from freezing the tab. */
const MAX_FILE_BYTES = 20 * 1024 * 1024

const CONTAINER_PATH = 'META-INF/container.xml'

export async function importMusicXmlFile(file: File): Promise<MusicXmlImport> {
  if (file.size > MAX_FILE_BYTES) {
    throw new MusicXmlError('That file is too large to be a MusicXML score.')
  }
  return parseMusicXml(musicXmlFromBytes(new Uint8Array(await file.arrayBuffer())))
}

/** The score XML inside an upload, unzipping it first when it is an .mxl. */
export function musicXmlFromBytes(bytes: Uint8Array): string {
  // Every ZIP archive opens with "PK".
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return decode(bytes)

  let scorePath: string | undefined
  try {
    const container = unzipSync(bytes, { filter: (entry) => entry.name === CONTAINER_PATH })[
      CONTAINER_PATH
    ]
    if (container) {
      scorePath =
        new DOMParser()
          .parseFromString(strFromU8(container), 'application/xml')
          .querySelector('rootfile')
          ?.getAttribute('full-path') ?? undefined
    }

    // Without a usable container, fall back to the first score-looking entry.
    const entries = unzipSync(bytes, {
      filter: (entry) =>
        scorePath
          ? entry.name === scorePath
          : !entry.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(entry.name),
    })
    const score = Object.values(entries)[0]
    if (score) return decode(score)
  } catch {
    throw new MusicXmlError('This .mxl archive could not be read.')
  }
  throw new MusicXmlError('This archive does not contain a MusicXML score.')
}

function decode(bytes: Uint8Array) {
  // Some Windows exporters write UTF-16, which announces itself with a BOM.
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}
