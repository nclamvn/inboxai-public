import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readMailAttachment } from '@/lib/compose/attachment-source'
import { SendError } from '@/lib/mail-send/contracts'
import { isRasterPreviewType, type RasterPreviewType } from '@/lib/email/attachment-preview'

export const maxDuration = 30

function matchesRasterSignature(type: RasterPreviewType, content: Buffer) {
  switch (type) {
    case 'image/gif': return ['GIF87a', 'GIF89a'].includes(content.toString('ascii', 0, 6))
    case 'image/jpeg': return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
    case 'image/png': return content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    case 'image/webp': return content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP'
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const file = await readMailAttachment(supabase, user.id, attachmentId)
    const type = file.contentType.toLowerCase()
    const preview = request.nextUrl.searchParams.get('preview') === '1' &&
      isRasterPreviewType(type) && matchesRasterSignature(type, file.content)
    return new NextResponse(new Uint8Array(file.content), { headers: {
      'Content-Type': preview ? type : 'application/octet-stream',
      'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': String(file.content.length),
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof SendError ? error.message : 'Attachment fetch failed' },
      { status: error instanceof SendError ? error.status : 500 })
  }
}
