// Script để tạo mock emails cho testing
// Chạy trong Supabase SQL Editor

export const MOCK_EMAILS_SQL = `
-- Insert mock emails (tự động lấy user_id từ profiles table)
INSERT INTO public.emails (user_id, from_address, from_name, subject, body_text, snippet, received_at, priority, category, summary, needs_reply, is_read, direction)
VALUES
  -- Email quan trọng từ sếp
  ((SELECT id FROM profiles LIMIT 1), 'boss@company.com', 'Nguyễn Văn A', 'Báo cáo Q4 2024 - Cần review gấp',
   'Hi,

Cần bạn review báo cáo Q4 trước 5pm hôm nay. File đính kèm.

Thanks,
A',
   'Cần bạn review báo cáo Q4 trước 5pm hôm nay...',
   NOW() - INTERVAL '2 hours', 5, 'work', 'Sếp cần review báo cáo Q4 trước 5pm hôm nay', true, false, 'inbound'),

  -- Email giao dịch Shopee
  ((SELECT id FROM profiles LIMIT 1), 'no-reply@shopee.vn', 'Shopee', 'Đơn hàng #12345 đã được giao thành công',
   'Đơn hàng của bạn đã được giao thành công.

Mã đơn: #12345
Sản phẩm: iPhone Case

Cảm ơn bạn đã mua sắm!',
   'Đơn hàng của bạn đã được giao thành công...',
   NOW() - INTERVAL '5 hours', 2, 'transaction', 'Xác nhận đơn hàng #12345 đã giao', false, false, 'inbound'),

  -- Invoice Google Cloud
  ((SELECT id FROM profiles LIMIT 1), 'billing@google.com', 'Google Cloud', 'Your invoice for December 2024',
   'Your Google Cloud invoice for December 2024 is ready.

Amount: $45.67
Due date: Jan 15, 2025',
   'Your Google Cloud invoice for December 2024 is ready...',
   NOW() - INTERVAL '1 day', 3, 'transaction', 'Hóa đơn Google Cloud tháng 12: $45.67, hạn 15/1', false, true, 'inbound'),

  -- LinkedIn notification
  ((SELECT id FROM profiles LIMIT 1), 'notifications@linkedin.com', 'LinkedIn', '5 người đã xem hồ sơ của bạn tuần này',
   '5 người đã xem hồ sơ của bạn trong tuần này.

Xem chi tiết tại LinkedIn.',
   '5 người đã xem hồ sơ của bạn trong tuần này...',
   NOW() - INTERVAL '1 day', 1, 'social', '5 lượt xem profile LinkedIn tuần này', false, true, 'inbound'),

  -- Newsletter
  ((SELECT id FROM profiles LIMIT 1), 'newsletter@techcrunch.com', 'TechCrunch', 'Daily Tech News - AI Updates',
   'Top stories today:
1. OpenAI launches new model
2. Google announces Gemini 2.0
3. Meta AI updates',
   'Top stories today: OpenAI launches new model...',
   NOW() - INTERVAL '2 days', 2, 'newsletter', 'Tin tech: OpenAI, Google Gemini 2.0, Meta AI', false, true, 'inbound'),

  -- Email từ khách hàng
  ((SELECT id FROM profiles LIMIT 1), 'client@startup.io', 'Trần Thị B', 'Re: Proposal cho dự án mobile app',
   'Hi,

Đã review proposal, có vài điểm cần clarify:
1. Timeline phase 2?
2. Budget breakdown?

Thanks,
B',
   'Đã review proposal, có vài điểm cần clarify...',
   NOW() - INTERVAL '3 hours', 4, 'work', 'Khách hàng cần clarify timeline và budget cho proposal', true, false, 'inbound'),

  -- Promotion email
  ((SELECT id FROM profiles LIMIT 1), 'deals@tiki.vn', 'Tiki', 'Flash Sale 12.12 - Giảm đến 50%!',
   'FLASH SALE 12.12

Giảm đến 50% toàn bộ sản phẩm
Chỉ trong hôm nay!

Mua ngay >>',
   'FLASH SALE 12.12 - Giảm đến 50% toàn bộ sản phẩm...',
   NOW() - INTERVAL '6 hours', 1, 'promotion', 'Khuyến mãi Tiki 12.12 giảm 50%', false, true, 'inbound'),

  -- Email cá nhân
  ((SELECT id FROM profiles LIMIT 1), 'friend@gmail.com', 'Minh Hoàng', 'Cuối tuần này đi cafe không?',
   'Hey,

Cuối tuần này rảnh không? Đi cafe catch up nhé!

Minh',
   'Cuối tuần này rảnh không? Đi cafe catch up nhé...',
   NOW() - INTERVAL '4 hours', 3, 'personal', 'Bạn rủ đi cafe cuối tuần', false, false, 'inbound');
`;

// Copy đoạn SQL trên và chạy trong Supabase Dashboard → SQL Editor
