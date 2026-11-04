/** Saves bytes the app generated (a .mid export, a run's audio) as a file on the user's device. */

export function downloadBytes(bytes: Uint8Array | Blob, fileName: string, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next task: some browsers start the download only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A title made safe to use as a file name, keeping it readable. */
export function fileNameFor(title: string, fallback = 'scenario') {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
  return cleaned || fallback
}
