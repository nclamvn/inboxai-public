/**
 * POST /api/ai/compose
 * AI-assisted email composition
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { aiLogger } from '@/lib/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ComposeAction = 'write' | 'improve' | 'shorter' | 'longer' | 'formal' | 'casual' | 'friendly';

interface ComposeRequest {
  action: ComposeAction;
  prompt?: string;        // For 'write' action
  currentText?: string;   // For other actions
  subject?: string;       // Context
  recipientName?: string; // Context
}

const ACTION_PROMPTS: Record<ComposeAction, string> = {
  write: `Bạn là trợ lý AI viết email chuyên nghiệp cho người Việt Nam.
Viết nội dung email dựa trên yêu cầu của người dùng.
- Viết tự nhiên, chuyên nghiệp
- Phù hợp văn hóa Việt Nam
- Có lời chào và kết thúc phù hợp
CHỈ trả về nội dung email, không giải thích.`,

  improve: `Bạn là editor chuyên nghiệp.
Cải thiện email sau để chuyên nghiệp hơn, rõ ràng hơn, mạch lạc hơn.
- Giữ nguyên ý chính
- Sửa lỗi chính tả, ngữ pháp
- Cải thiện cấu trúc câu
CHỈ trả về nội dung đã cải thiện, không giải thích.`,

  shorter: `Bạn là editor chuyên nghiệp.
Viết lại email sau ngắn gọn hơn, súc tích hơn.
- Giữ nguyên ý chính quan trọng
- Loại bỏ phần thừa
- Tối đa 50% độ dài hiện tại
CHỈ trả về nội dung đã rút gọn, không giải thích.`,

  longer: `Bạn là editor chuyên nghiệp.
Mở rộng email sau chi tiết hơn, đầy đủ hơn.
- Thêm chi tiết phù hợp
- Giữ nguyên ý chính
- Thêm lời chào, kết thúc nếu thiếu
CHỈ trả về nội dung đã mở rộng, không giải thích.`,

  formal: `Bạn là editor chuyên nghiệp.
Viết lại email sau với giọng văn trang trọng, chuyên nghiệp.
- Dùng kính ngữ phù hợp
- Cấu trúc formal
- Phù hợp môi trường công việc
CHỈ trả về nội dung đã chỉnh sửa, không giải thích.`,

  casual: `Bạn là editor chuyên nghiệp.
Viết lại email sau với giọng văn thân thiện, thoải mái hơn.
- Bớt formal
- Tự nhiên, gần gũi
- Vẫn giữ sự tôn trọng
CHỈ trả về nội dung đã chỉnh sửa, không giải thích.`,

  friendly: `Bạn là editor chuyên nghiệp.
Viết lại email sau với giọng văn thân thiện, ấm áp.
- Thể hiện sự quan tâm
- Tích cực, lạc quan
- Dễ gần, thân thiện
CHỉ trả về nội dung đã chỉnh sửa, không giải thích.`,
};

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ComposeRequest = await request.json();
    const { action, prompt, currentText, subject, recipientName } = body;

    if (!action || !ACTION_PROMPTS[action]) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Build the user message
    let userMessage = '';

    if (action === 'write') {
      if (!prompt) {
        return NextResponse.json({ error: 'Prompt required for write action' }, { status: 400 });
      }
      userMessage = `Yêu cầu: ${prompt}`;
      if (subject) userMessage += `\nTiêu đề email: ${subject}`;
      if (recipientName) userMessage += `\nNgười nhận: ${recipientName}`;
    } else {
      if (!currentText) {
        return NextResponse.json({ error: 'Current text required' }, { status: 400 });
      }
      userMessage = `Email hiện tại:\n---\n${currentText}\n---`;
      if (subject) userMessage += `\n\nTiêu đề: ${subject}`;
    }

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACTION_PROMPTS[action] },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const generatedText = response.choices[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      text: generatedText.trim(),
      action,
    });

  } catch (error) {
    aiLogger.error('[Compose] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}
