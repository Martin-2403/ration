/**
 * Takes the user to the export form that sits on the same Settings page: scrolls it
 * into view and puts the cursor in its first field. Used by the backup prompt's
 * `#backup` hash (#147) and by the restore's "Back up this device first" (#153),
 * which must not navigate, so that an opened backup and its confirm step stay put.
 *
 * Does nothing when the form is not on the page. `scrollIntoView` is optional-called
 * because jsdom does not implement it.
 */
export const BACKUP_FORM_ID = 'backup-export'
export const BACKUP_PASSPHRASE_ID = 'backup-passphrase'

export function focusBackupForm(): void {
  document.getElementById(BACKUP_FORM_ID)?.scrollIntoView?.({ block: 'start' })
  document.getElementById(BACKUP_PASSPHRASE_ID)?.focus({ preventScroll: true })
}
