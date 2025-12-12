import { createClient } from '@supabase/supabase-js'

// Use service role for server-side notification creation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type NotificationType = 'new_email' | 'sync_complete' | 'ai_classified' | 'important'

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message?: string,
  link?: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        link
      })

    if (error) {
      // Silently fail if table doesn't exist
      if (error.code !== '42P01') {
        console.error('Failed to create notification:', error)
      }
    }
  } catch (error) {
    console.error('Failed to create notification:', error)
  }
}

// Helper functions for common notification types
export async function notifyNewImportantEmail(
  userId: string,
  emailId: string,
  subject: string,
  sender: string
) {
  await createNotification(
    userId,
    'important',
    `Email quan trong tu ${sender}`,
    subject.slice(0, 100),
    `/inbox?email=${emailId}`
  )
}

export async function notifySyncComplete(userId: string, count: number) {
  if (count <= 0) return

  await createNotification(
    userId,
    'sync_complete',
    `Dong bo hoan tat`,
    `Da dong bo ${count} email moi`
  )
}

export async function notifyAiClassified(userId: string, count: number) {
  if (count <= 0) return

  await createNotification(
    userId,
    'ai_classified',
    `AI da phan loai xong`,
    `${count} email da duoc phan loai tu dong`
  )
}

export async function notifyNewEmail(
  userId: string,
  emailId: string,
  subject: string,
  sender: string
) {
  await createNotification(
    userId,
    'new_email',
    `Email moi tu ${sender}`,
    subject.slice(0, 100),
    `/inbox?email=${emailId}`
  )
}
