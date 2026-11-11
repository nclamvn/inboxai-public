import Link from 'next/link'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const citation = z.object({ email: z.uuid(), v: z.string().regex(/^[0-9a-f]{64}$/) })

export default async function AskInboxSource({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')

  const input = citation.safeParse(await searchParams)
  let message = 'Nguồn không còn khả dụng trong hộp thư của bạn.'
  if (input.success) {
    const { data, error } = await client.rpc('ask_inbox_source_status', {
      p_email_id: input.data.email, p_version: input.data.v,
    }).abortSignal(AbortSignal.timeout(8_000))
    if (!error && data === 'current') redirect('/inbox?email=' + input.data.email)
    if (!error && data === 'changed') message = 'Email đã thay đổi kể từ lúc đối chiếu. Hãy chạy lại câu hỏi để kiểm tra bằng chứng hiện tại.'
    if (error) message = 'Chưa kiểm tra được phiên bản email. Hãy thử lại.'
  }

  return (
    <section className="mx-auto max-w-3xl space-y-3 px-4 py-8 sm:px-6">
      <h1 className="neo-title">Kiểm tra email nguồn</h1>
      <p className="text-sm text-[var(--foreground-secondary)]">{message}</p>
      <Link href="/search" className="neo-target inline-flex items-center text-sm font-medium text-[var(--accent-foreground)] underline">Về Ask Inbox</Link>
    </section>
  )
}
