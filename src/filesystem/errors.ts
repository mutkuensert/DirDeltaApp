export function explainReadError(error: unknown): { message: string; suggestion: string; code?: string } {
  const code = (error as NodeJS.ErrnoException | null)?.code
  switch (code) {
    case 'EACCES': case 'EPERM': return { code, message: 'Access to this item is denied.', suggestion: 'Check the read permissions for the file or folder and compare again.' }
    case 'ENOENT': return { code, message: 'The item may have been deleted, moved, or disconnected during the scan.', suggestion: 'Check that the item still exists and compare again.' }
    case 'ENOTDIR': return { code, message: 'The folder path is no longer valid; a folder may have been moved or replaced with a file.', suggestion: 'Check the folder structure and compare again.' }
    case 'EIO': return { code, message: 'The storage device could not read the data.', suggestion: 'Check the drive status and connection, then try again.' }
    case 'ENODEV': case 'ENXIO': case 'ESTALE': case 'ENOTCONN': case 'ETIMEDOUT': case 'EHOSTUNREACH': case 'ENETUNREACH': return { code, message: 'The drive or network location is unavailable.', suggestion: 'Check the external drive or network connection and compare again.' }
    case 'EBUSY': return { code, message: 'The item could not be read because it is currently in use.', suggestion: 'Wait for the process using the item to finish, then try again.' }
    case 'EMFILE': case 'ENFILE': return { code, message: 'The system limit for open files has been reached.', suggestion: 'Close unnecessary applications and try again.' }
    default: return { code, message: `Could not read item: ${error instanceof Error ? error.message : String(error)}`, suggestion: 'Check the path, access permissions, and drive connection, then compare again.' }
  }
}

