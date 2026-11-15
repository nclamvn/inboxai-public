import type { ComposeFields, ComposeFile } from '../../src/lib/compose/contracts'

export type DeviceFile = Omit<ComposeFile, 'sha256'> & { local?: true; sha256?: string }
export type DeviceCommand = {
  id: string | null
  revision: number | null
  accountId: string
  sourceId: string | null
  fields: ComposeFields
  fileIds: string[]
}
export type DeviceCompose = {
  draftId: string | null
  revision: number | null
  sourceId: string | null
  accountId: string
  accounts: { id: string; address: string }[]
  fields: ComposeFields
  files: DeviceFile[]
  pending?: DeviceCommand
  updatedAt: number
}
export const composeFileLimit: number
export const composeFileCount: number
export function sameDraftFields(left: ComposeFields, right: ComposeFields): boolean
export function localFile(file: File): DeviceFile & { local: true }
export function validateDraftFiles(files: DeviceFile[]): void
