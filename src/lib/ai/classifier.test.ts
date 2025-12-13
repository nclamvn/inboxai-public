// Test cases to validate classifier accuracy
// Run with: npx ts-node src/lib/ai/classifier.test.ts

import { classifyEmail } from './classifier'

interface TestCase {
  name: string
  from: string
  fromName?: string
  subject: string
  body?: string
  expectedCategory: string
  expectedMinConfidence?: number
}

export const TEST_CASES: TestCase[] = [
  // =========================================
  // TRANSACTION - Banks (Should be 100%)
  // =========================================
  {
    name: 'BIDV transaction alert',
    from: 'alert@bidv.com.vn',
    fromName: 'BIDV Bank',
    subject: 'Biến động số dư tài khoản',
    body: 'Tài khoản của bạn vừa có giao dịch chuyển khoản 5.000.000 VND',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.9,
  },
  {
    name: 'Vietcombank OTP',
    from: 'noreply@vietcombank.com.vn',
    fromName: 'Vietcombank',
    subject: 'Mã xác nhận giao dịch OTP',
    body: 'Mã OTP của bạn là 123456. Không chia sẻ với ai.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.9,
  },
  {
    name: 'Techcombank statement',
    from: 'notification@techcombank.com.vn',
    fromName: 'Techcombank',
    subject: 'Thông báo giao dịch chuyển khoản thành công',
    body: 'Giao dịch chuyển khoản số tiền 10.000.000 VND đã thành công.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.9,
  },
  {
    name: 'MB Bank alert',
    from: 'smartbanking@mbbank.com.vn',
    fromName: 'MB Bank',
    subject: 'Cảnh báo giao dịch bất thường',
    body: 'Có một giao dịch bất thường từ tài khoản của bạn. Vui lòng kiểm tra.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.9,
  },

  // =========================================
  // TRANSACTION - Fintech/Wallets
  // =========================================
  {
    name: 'MoMo payment',
    from: 'no-reply@momo.vn',
    fromName: 'MoMo',
    subject: 'Thanh toán thành công đơn hàng #12345',
    body: 'Bạn đã thanh toán thành công 150.000 VND cho đơn hàng.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },
  {
    name: 'ZaloPay transfer',
    from: 'notification@zalopay.vn',
    fromName: 'ZaloPay',
    subject: 'Xác nhận chuyển tiền',
    body: 'Bạn đã chuyển 500.000 VND cho Nguyễn Văn A thành công.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },

  // =========================================
  // TRANSACTION - Ecommerce Orders
  // =========================================
  {
    name: 'Shopee order confirmed',
    from: 'no-reply@shopee.vn',
    fromName: 'Shopee',
    subject: 'Đơn hàng #123456789 đã được xác nhận',
    body: 'Đơn hàng của bạn đã được xác nhận và đang chuẩn bị.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },
  {
    name: 'Lazada shipping update',
    from: 'notification@lazada.vn',
    fromName: 'Lazada',
    subject: 'Đơn hàng của bạn đang được giao',
    body: 'Đơn hàng #987654 đang trên đường giao đến bạn. Tracking: VN12345678',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },
  {
    name: 'Tiki delivery',
    from: 'orders@tiki.vn',
    fromName: 'Tiki',
    subject: 'Đã giao hàng thành công',
    body: 'Đơn hàng của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },

  // =========================================
  // TRANSACTION - Transport/Booking
  // =========================================
  {
    name: 'Vietnam Airlines e-ticket',
    from: 'booking@vietnamairlines.com',
    fromName: 'Vietnam Airlines',
    subject: 'E-ticket cho chuyến bay VN123',
    body: 'Đính kèm là vé điện tử cho chuyến bay của bạn từ HAN đến SGN.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },
  {
    name: 'Grab ride confirmation',
    from: 'noreply@grab.com',
    fromName: 'Grab',
    subject: 'Xác nhận đặt xe - Mã: ABC123',
    body: 'Chuyến xe của bạn đã được xác nhận. Tài xế sẽ đến trong 5 phút.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },
  {
    name: 'VeXeRe bus ticket',
    from: 'booking@vexere.com',
    fromName: 'VeXeRe',
    subject: 'Vé xe khách - Mã đặt chỗ: VXR123456',
    body: 'Vé xe khách từ Hà Nội đi Hải Phòng ngày 25/12/2024.',
    expectedCategory: 'transaction',
    expectedMinConfidence: 0.85,
  },

  // =========================================
  // WORK - Corporate emails
  // =========================================
  {
    name: 'Work meeting invite',
    from: 'boss@company.com',
    fromName: 'Nguyễn Văn A',
    subject: 'RE: Báo cáo Q4 - Cần review trước thứ 6',
    body: 'Anh em xem lại báo cáo Q4 và gửi feedback trước thứ 6 nhé. Deadline quan trọng.',
    expectedCategory: 'work',
    expectedMinConfidence: 0.7,
  },
  {
    name: 'HR announcement',
    from: 'hr@fpt.com.vn',
    fromName: 'FPT HR',
    subject: 'Thông báo nghỉ lễ Tết Nguyên Đán 2025',
    body: 'Thông báo lịch nghỉ Tết cho toàn thể nhân viên công ty.',
    expectedCategory: 'work',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Jira notification',
    from: 'jira@atlassian.net',
    fromName: 'Jira',
    subject: '[JIRA] Task ABC-123 assigned to you',
    body: 'You have been assigned a new task: Implement user authentication.',
    expectedCategory: 'work',
    expectedMinConfidence: 0.7,
  },
  {
    name: 'Slack notification',
    from: 'notification@slack.com',
    fromName: 'Slack',
    subject: 'New message in #project-alpha',
    body: 'John mentioned you in a thread about the deadline.',
    expectedCategory: 'work',
    expectedMinConfidence: 0.7,
  },
  {
    name: 'Government notice',
    from: 'thongbao@chinhphu.vn',
    fromName: 'Cổng TTĐT Chính phủ',
    subject: 'Thông báo về chính sách thuế mới',
    body: 'Thông báo về thay đổi chính sách thuế từ ngày 01/01/2025.',
    expectedCategory: 'work',
    expectedMinConfidence: 0.8,
  },

  // =========================================
  // PERSONAL
  // =========================================
  {
    name: 'Friend casual email',
    from: 'friend@gmail.com',
    fromName: 'Minh Trần',
    subject: 'Cuối tuần này cafe không?',
    body: 'Hey, lâu rồi không gặp. Cuối tuần này có rảnh không, mình đi cafe nhé?',
    expectedCategory: 'personal',
    expectedMinConfidence: 0.7,
  },
  {
    name: 'Family email',
    from: 'mom@yahoo.com',
    fromName: 'Mẹ',
    subject: 'Con ơi, mẹ gửi ảnh gia đình',
    body: 'Mẹ gửi con mấy tấm ảnh hôm gia đình mình họp mặt. Con xem đi nhé.',
    expectedCategory: 'personal',
    expectedMinConfidence: 0.7,
  },
  {
    name: 'Birthday wishes',
    from: 'colleague@company.com',
    fromName: 'Lan Nguyễn',
    subject: 'Chúc mừng sinh nhật!',
    body: 'Chúc mừng sinh nhật bạn! Chúc bạn một tuổi mới thật nhiều niềm vui.',
    expectedCategory: 'personal',
    expectedMinConfidence: 0.7,
  },

  // =========================================
  // NEWSLETTER
  // =========================================
  {
    name: 'Statista newsletter',
    from: 'newsletter@statista.com',
    fromName: 'Statista',
    subject: 'Statista Daily Data - Early Edition',
    body: 'Top stories today... Unsubscribe from this newsletter.',
    expectedCategory: 'newsletter',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Morning Brew digest',
    from: 'digest@morningbrew.com',
    fromName: 'Morning Brew',
    subject: 'Morning Brew - Your daily business news digest',
    body: 'Good morning! Here are today\'s top stories... View in browser | Unsubscribe',
    expectedCategory: 'newsletter',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Substack weekly',
    from: 'author@substack.com',
    fromName: 'Tech Insights',
    subject: 'Weekly Tech Roundup - Issue #42',
    body: 'This week in tech: AI advancements, new releases... Unsubscribe',
    expectedCategory: 'newsletter',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'VnExpress news',
    from: 'newsletter@vnexpress.net',
    fromName: 'VnExpress',
    subject: 'Bản tin sáng - Tin tức nổi bật hôm nay',
    body: 'Các tin tức nổi bật trong ngày... Hủy đăng ký bản tin',
    expectedCategory: 'newsletter',
    expectedMinConfidence: 0.8,
  },

  // =========================================
  // PROMOTION
  // =========================================
  {
    name: 'Shopee flash sale',
    from: 'marketing@shopee.vn',
    fromName: 'Shopee',
    subject: '🔥 FLASH SALE - Giảm 50% chỉ hôm nay!',
    body: 'Ưu đãi cực sốc! Giảm giá 50% cho tất cả sản phẩm. Mua ngay!',
    expectedCategory: 'promotion',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Lazada voucher',
    from: 'deals@lazada.vn',
    fromName: 'Lazada',
    subject: 'Voucher 100K cho bạn - Dùng ngay!',
    body: 'Bạn có voucher giảm giá 100.000 VND. Áp dụng cho đơn từ 200.000 VND.',
    expectedCategory: 'promotion',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Black Friday sale',
    from: 'promo@thegioididong.com',
    fromName: 'Thế Giới Di Động',
    subject: 'BLACK FRIDAY - Sale up to 70%!',
    body: 'Chương trình khuyến mãi Black Friday với ưu đãi lên đến 70%.',
    expectedCategory: 'promotion',
    expectedMinConfidence: 0.8,
  },

  // =========================================
  // SOCIAL
  // =========================================
  {
    name: 'Facebook notification',
    from: 'notification@facebook.com',
    fromName: 'Facebook',
    subject: 'Minh Trần đã tag bạn trong một bài viết',
    body: 'Minh Trần đã tag bạn trong một bài viết. Xem ngay.',
    expectedCategory: 'social',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'LinkedIn connection',
    from: 'messages-noreply@linkedin.com',
    fromName: 'LinkedIn',
    subject: 'John Doe wants to connect with you',
    body: 'You have a new connection request from John Doe, CEO at TechCorp.',
    expectedCategory: 'social',
    expectedMinConfidence: 0.8,
  },
  {
    name: 'Instagram like',
    from: 'mail@instagram.com',
    fromName: 'Instagram',
    subject: 'friend123 liked your photo',
    body: 'friend123 and 15 others liked your photo.',
    expectedCategory: 'social',
    expectedMinConfidence: 0.8,
  },

  // =========================================
  // SPAM
  // =========================================
  {
    name: 'Lottery scam',
    from: 'xyz123abc@unknown.com',
    fromName: 'Lottery Winner',
    subject: 'YOU WON $1,000,000!!! CLAIM NOW!!!',
    body: 'Congratulations! You have been selected as our lottery winner. Click here immediately to claim your prize.',
    expectedCategory: 'spam',
    expectedMinConfidence: 0.75,
  },
  {
    name: 'Account suspended scam',
    from: 'noreply@suspicious.xyz',
    fromName: 'Security Team',
    subject: 'Urgent: Your account will be suspended',
    body: 'Act now or your account will be suspended. Verify immediately by clicking this link.',
    expectedCategory: 'spam',
    expectedMinConfidence: 0.75,
  },
  {
    name: 'Nigerian prince scam',
    from: 'prince123456789@randomdomain.top',
    fromName: 'Prince of Nigeria',
    subject: 'Urgent: $10 Million Inheritance',
    body: 'I am a Nigerian prince and I need your help to transfer $10 million. You will receive 40%.',
    expectedCategory: 'spam',
    expectedMinConfidence: 0.75,
  },
  {
    name: 'Make money fast scam',
    from: 'opportunity@workfromhome.click',
    fromName: 'Money Maker',
    subject: 'Make $5000/day from home - No experience needed!',
    body: 'Guaranteed income! Work from home and make thousands daily. 100% free to start!',
    expectedCategory: 'spam',
    expectedMinConfidence: 0.75,
  },
]

/**
 * Run classifier tests
 */
export async function runClassifierTests(): Promise<{
  passed: number
  failed: number
  accuracy: number
  results: Array<{
    name: string
    expected: string
    actual: string
    confidence: number
    passed: boolean
  }>
}> {
  console.log('=' .repeat(60))
  console.log('🎯 AI CLASSIFIER ACCURACY TEST')
  console.log('=' .repeat(60))
  console.log('')

  const results: Array<{
    name: string
    expected: string
    actual: string
    confidence: number
    passed: boolean
  }> = []

  let passed = 0
  let failed = 0

  for (const test of TEST_CASES) {
    try {
      const result = await classifyEmail({
        from_address: test.from,
        from_name: test.fromName,
        subject: test.subject,
        body_text: test.body,
      })

      const categoryMatch = result.category === test.expectedCategory
      const confidenceMatch = !test.expectedMinConfidence || result.confidence >= test.expectedMinConfidence
      const testPassed = categoryMatch && confidenceMatch

      if (testPassed) {
        passed++
        console.log(`✅ ${test.name}`)
        console.log(`   → ${result.category} (${(result.confidence * 100).toFixed(0)}%)`)
      } else {
        failed++
        console.log(`❌ ${test.name}`)
        console.log(`   Expected: ${test.expectedCategory} (≥${((test.expectedMinConfidence || 0) * 100).toFixed(0)}%)`)
        console.log(`   Actual: ${result.category} (${(result.confidence * 100).toFixed(0)}%)`)
      }

      results.push({
        name: test.name,
        expected: test.expectedCategory,
        actual: result.category,
        confidence: result.confidence,
        passed: testPassed,
      })

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100))
    } catch (error) {
      failed++
      console.log(`❌ ${test.name} - ERROR: ${error}`)
      results.push({
        name: test.name,
        expected: test.expectedCategory,
        actual: 'error',
        confidence: 0,
        passed: false,
      })
    }
  }

  const accuracy = (passed / TEST_CASES.length) * 100

  console.log('')
  console.log('=' .repeat(60))
  console.log(`📊 RESULTS: ${passed}/${TEST_CASES.length} passed (${accuracy.toFixed(1)}% accuracy)`)
  console.log('=' .repeat(60))

  // Category breakdown
  const categories = new Map<string, { passed: number; total: number }>()
  for (const result of results) {
    const cat = result.expected
    const stats = categories.get(cat) || { passed: 0, total: 0 }
    stats.total++
    if (result.passed) stats.passed++
    categories.set(cat, stats)
  }

  console.log('\n📈 CATEGORY BREAKDOWN:')
  for (const [category, stats] of categories) {
    const catAccuracy = (stats.passed / stats.total * 100).toFixed(0)
    const icon = stats.passed === stats.total ? '✅' : stats.passed >= stats.total * 0.7 ? '⚠️' : '❌'
    console.log(`   ${icon} ${category}: ${stats.passed}/${stats.total} (${catAccuracy}%)`)
  }

  return {
    passed,
    failed,
    accuracy,
    results,
  }
}

// Run tests if called directly
if (require.main === module) {
  runClassifierTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('Test runner failed:', error)
      process.exit(1)
    })
}
