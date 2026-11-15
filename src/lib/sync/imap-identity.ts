/** Legacy/other UID epochs must never fetch a newly reused UID's body or attachment. */
export function matchesImapNamespace(namespace: unknown, validity: bigint | undefined): boolean {
    return typeof namespace === 'string' && validity !== undefined && namespace === `INBOX:${validity}`;
}
