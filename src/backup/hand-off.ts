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
 * Whether the browser's share sheet will take this file. Asked before any slow
 * work, so the caller can split the export into "prepare" and "tap to share":
 * share() needs the transient activation of a tap, and the key derivation behind
 * a backup takes long enough to use that up.
 */
export function canShareFile(file: File): boolean {
  try {
    return navigator.canShare?.({ files: [file] }) === true
  } catch {
    return false
  }
}

/**
 * - `shared`: the share sheet took it.
 * - `downloaded`: a download was started.
 * - `fallback`: the share sheet refused the file (not a cancel), so it was
 *   downloaded instead. The caller says so rather than calling it a share.
 * - `cancelled`: the user closed the share sheet. Nothing left the app, so the
 *   caller must not count it as a backup, and it is not an error either.
 */
export type HandOff = 'shared' | 'downloaded' | 'fallback' | 'cancelled'

/**
 * Call this straight from the tap that asked for it, with nothing slow awaited
 * first, or the share sheet may refuse for want of a user gesture.
 */
export async function handOffBackup(file: File): Promise<HandOff> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: 'Ration backup' })

      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'

      // Any other refusal means the sheet never took the file. A download needs
      // no tap, so it is the honest fallback; the caller reports it as one.
      download(file)

      return 'fallback'
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
