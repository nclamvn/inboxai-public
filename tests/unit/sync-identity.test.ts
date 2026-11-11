import { expect, it } from 'vitest';
import { matchesImapNamespace } from '@/lib/sync/imap-identity';
it.each([undefined, 'legacy', 'legacy:123', 'gmail', 'INBOX:456'])('rejects stale or unknown UID epoch %s', namespace => {
    expect(matchesImapNamespace(namespace, BigInt(123))).toBe(false);
});
it('accepts only the selected mailbox epoch', () => expect(matchesImapNamespace('INBOX:123', BigInt(123))).toBe(true));

import { boundedText } from '@/lib/sync/text'
it('does not split an emoji into an invalid stored Unicode surrogate',()=>{
 const text=boundedText('abc🔐tail',4)
 expect(text).toBe('abc')
 expect(Buffer.from(text).toString()).toBe(text)
})
it('preserves complete Unicode and Vietnamese within the storage boundary',()=>{
 expect(boundedText('🔐 thư',2)).toBe('🔐')
 expect(boundedText('Thư đã gửi',100)).toBe('Thư đã gửi')
})
