import type { Category, Priority } from '@/types'

interface PriorityInput {
  category: Category
  subject: string
  fromAddress: string
  bodyText: string
  hasAttachment: boolean
  isRepliedThread: boolean
  senderTrustLevel?: 'trusted' | 'neutral' | 'untrusted' | 'blocked'
}

// Priority mapping:
// 5 = Urgent/Critical - Need immediate attention
// 4 = High - Important, should address soon
// 3 = Normal - Regular priority
// 2 = Low - Can wait
// 1 = Very Low - Promotions, spam

/**
 * Determine email priority based on category and signals
 */
export function determinePriority(input: PriorityInput): Priority {
  const { category, subject, fromAddress, bodyText, hasAttachment, isRepliedThread, senderTrustLevel } = input
  const subjectLower = subject.toLowerCase()
  const textLower = `${subject} ${bodyText}`.toLowerCase()

  // SPAM and BLOCKED → Always priority 1
  if (category === 'spam' || senderTrustLevel === 'blocked') {
    return 1
  }

  // TRANSACTION category
  if (category === 'transaction') {
    // OTP, verification → Highest priority (time-sensitive)
    if (/otp|mã xác nhận|verification|xác thực|mã code|security code/i.test(subjectLower)) {
      return 5
    }
    // Bank alerts - account activity
    if (/biến động|alert|cảnh báo|security alert|fraud|unusual activity/i.test(subjectLower)) {
      return 5
    }
    // Payment due, bills
    if (/payment due|hạn thanh toán|hóa đơn|invoice due/i.test(subjectLower)) {
      return 4
    }
    // Order confirmation, delivery
    if (/đơn hàng|order|delivery|giao hàng|shipped|shipment/i.test(subjectLower)) {
      return 3
    }
    // Other transactions
    return 3
  }

  // WORK category
  if (category === 'work') {
    // Urgent keywords
    if (/urgent|gấp|khẩn|asap|deadline today|eod|immediately|quan trọng|critical/i.test(subjectLower)) {
      return 5
    }
    // Meeting invites for today
    if (/meeting.*today|họp.*hôm nay|cuộc họp.*ngay/i.test(textLower)) {
      return 5
    }
    // Deadline mentions
    if (/deadline|due date|hạn chót|trước ngày/i.test(subjectLower)) {
      return 4
    }
    // Review requests
    if (/review|phê duyệt|approval|xin ý kiến|for your review/i.test(subjectLower)) {
      return 4
    }
    // Is a reply in thread → Ongoing conversation
    if (isRepliedThread) {
      return 4
    }
    // Has attachment → Could be important document
    if (hasAttachment) {
      return 3
    }
    // From trusted sender
    if (senderTrustLevel === 'trusted') {
      return 3
    }
    // Regular work email
    return 3
  }

  // PERSONAL category
  if (category === 'personal') {
    // From trusted contacts
    if (senderTrustLevel === 'trusted') {
      return 3
    }
    // Is a reply → Active conversation
    if (isRepliedThread) {
      return 3
    }
    // Birthday, special occasions
    if (/sinh nhật|birthday|anniversary|kỷ niệm|wedding|đám cưới/i.test(subjectLower)) {
      return 3
    }
    // Regular personal
    return 3
  }

  // SOCIAL category
  if (category === 'social') {
    // Direct messages
    if (/message|tin nhắn|dm|direct/i.test(subjectLower)) {
      return 3
    }
    // Friend requests, mentions
    if (/friend|bạn bè|mention|tag|nhắc đến/i.test(subjectLower)) {
      return 2
    }
    // Other social notifications
    return 2
  }

  // NEWSLETTER category
  if (category === 'newsletter') {
    // From trusted newsletter sources
    if (senderTrustLevel === 'trusted') {
      return 2
    }
    // Regular newsletters
    return 2
  }

  // PROMOTION category
  if (category === 'promotion') {
    // From stores user has bought from (would be marked as trusted)
    if (senderTrustLevel === 'trusted') {
      return 2
    }
    // Regular promotions
    return 1
  }

  // Default
  return 3
}

/**
 * Extract deadline from email content
 */
export function extractDeadline(subject: string, bodyText: string): string | null {
  const text = `${subject} ${bodyText}`

  // Vietnamese date patterns
  const vnPatterns = [
    /trước\s*(ngày)?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/i,
    /hạn\s*(chót|cuối)?\s*[:\s]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/i,
    /deadline[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/i,
  ]

  // English date patterns
  const enPatterns = [
    /due\s*(by|date)?[:\s]+(\w+\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{4}?)/i,
    /deadline[:\s]+(\w+\s+\d{1,2},?\s*\d{4}?)/i,
    /by\s+(\w+\s+\d{1,2}(st|nd|rd|th)?)/i,
    /before\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ]

  // Relative dates
  const relativePatterns = [
    /today|hôm nay/i,
    /tomorrow|ngày mai/i,
    /this week|tuần này/i,
    /next week|tuần sau/i,
    /end of (week|day)|cuối (tuần|ngày)/i,
  ]

  // Try to find dates
  for (const pattern of [...vnPatterns, ...enPatterns]) {
    const match = text.match(pattern)
    if (match) {
      try {
        // Try to parse the date - return as ISO string
        const dateStr = match[0]
        // This is simplified - in production would need proper date parsing
        return dateStr
      } catch {
        continue
      }
    }
  }

  // Check relative dates
  for (const pattern of relativePatterns) {
    if (pattern.test(text)) {
      const now = new Date()
      if (/today|hôm nay/i.test(text)) {
        return now.toISOString().split('T')[0]
      }
      if (/tomorrow|ngày mai/i.test(text)) {
        now.setDate(now.getDate() + 1)
        return now.toISOString().split('T')[0]
      }
    }
  }

  return null
}

/**
 * Determine if email needs reply based on content
 */
export function needsReply(
  category: Category,
  subject: string,
  bodyText: string,
  fromAddress: string
): boolean {
  // Spam, newsletter, promotion → No reply needed
  if (['spam', 'newsletter', 'promotion', 'social'].includes(category)) {
    return false
  }

  // No-reply addresses → No reply expected
  if (/noreply|no-reply|donotreply|mailer-daemon|bounce/i.test(fromAddress)) {
    return false
  }

  const text = `${subject} ${bodyText}`.toLowerCase()

  // Transaction → Usually no reply needed
  if (category === 'transaction') {
    // Unless it's asking for action
    return /please (confirm|verify|respond)|vui lòng (xác nhận|phản hồi)/i.test(text)
  }

  // Work emails
  if (category === 'work') {
    // Questions → Need reply
    if (/\?|please (advise|confirm|let me know)|xin (ý kiến|phản hồi|cho biết)/i.test(text)) {
      return true
    }
    // Review requests → Need reply
    if (/for your (review|approval)|xin phê duyệt|review needed/i.test(text)) {
      return true
    }
    // Action required
    if (/action required|cần (xử lý|phản hồi)/i.test(text)) {
      return true
    }
  }

  // Personal → Usually needs reply if it's a question
  if (category === 'personal') {
    return /\?/.test(text)
  }

  return false
}

/**
 * Suggest action for email
 */
export function suggestAction(
  category: Category,
  priority: Priority,
  needsReply: boolean
): 'reply' | 'archive' | 'delete' | 'read_later' | 'none' {
  // High priority needs reply → Reply
  if (needsReply && priority >= 4) {
    return 'reply'
  }

  // Spam → Delete
  if (category === 'spam') {
    return 'delete'
  }

  // Low priority promotions → Archive or delete
  if (category === 'promotion' && priority <= 1) {
    return 'archive'
  }

  // Newsletters → Read later or archive
  if (category === 'newsletter') {
    return 'read_later'
  }

  // Transaction completed → Archive
  if (category === 'transaction') {
    return 'archive'
  }

  // Work/Personal needing reply
  if (needsReply) {
    return 'reply'
  }

  return 'none'
}
