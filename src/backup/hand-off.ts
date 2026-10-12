/**
 * Getting the finished backup file out of the app (§10): the share sheet where
 * the browser can share files, a plain download otherwise. The app never holds a
 * cloud credential; "own cloud" is the user saving the file themselves.
 */
import { toISODate } from '../dates'

/** `ration-backup-YYYY-MM-DD.json`, by the local date: the one the user sees on their clock. */
export function backupFileName(at: number = Date.now()): string {
  return `ration-backup-${toISODate(at)}.json`
}

/**
 * - `shared`: the share sheet took it.
 * - `downloaded`: a download was started.
 * - `cancelled`: the user closed the share sheet. Nothing left the app, so the
 *   caller must not count it as a backup, and it is not an error either.
 */
export type HandOff = 'shared' | 'downloaded' | 'cancelled'

export async function handOffBackup(file: File): Promise<HandOff> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Ration backup' })

      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'

      // Any other refusal means the sheet never took the file. The usual one is
      // NotAllowedError: share() needs a recent tap, and encrypting first can use
      // that up. A download needs no tap, so it is the honest fallback.
    }
  }

  download(file)

  return 'downloaded'
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Revoked later, not now: some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
