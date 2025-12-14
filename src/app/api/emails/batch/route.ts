/**
 * POST /api/emails/batch
 * Batch operations on multiple emails
 * Consolidates: mark-read, archive, delete, star, categorize
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type BatchOperation =
  | { action: 'mark_read'; emailIds: string[]; value: boolean }
  | { action: 'archive'; emailIds: string[] }
  | { action: 'unarchive'; emailIds: string[] }
  | { action: 'delete'; emailIds: string[] }
  | { action: 'restore'; emailIds: string[] }
  | { action: 'permanent_delete'; emailIds: string[] }
  | { action: 'star'; emailIds: string[]; value: boolean }
  | { action: 'categorize'; emailIds: string[]; category: string }
  | { action: 'set_priority'; emailIds: string[]; priority: number };

interface BatchRequest {
  operations: BatchOperation[];
}

interface BatchResult {
  operation: string;
  success: boolean;
  affected: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: BatchRequest = await request.json();

    if (!body.operations || !Array.isArray(body.operations)) {
      return NextResponse.json({ error: 'Invalid request: operations array required' }, { status: 400 });
    }

    if (body.operations.length === 0) {
      return NextResponse.json({ error: 'No operations provided' }, { status: 400 });
    }

    if (body.operations.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 operations per batch' }, { status: 400 });
    }

    const results: BatchResult[] = [];

    // Process each operation
    for (const op of body.operations) {
      // Validate emailIds
      if (!op.emailIds || !Array.isArray(op.emailIds) || op.emailIds.length === 0) {
        results.push({ operation: op.action, success: false, affected: 0, error: 'No emailIds provided' });
        continue;
      }

      if (op.emailIds.length > 100) {
        results.push({ operation: op.action, success: false, affected: 0, error: 'Maximum 100 emails per operation' });
        continue;
      }

      try {
        let result;
        const now = new Date().toISOString();

        switch (op.action) {
          case 'mark_read':
            result = await supabase
              .from('emails')
              .update({ is_read: op.value, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'archive':
            result = await supabase
              .from('emails')
              .update({ is_archived: true, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'unarchive':
            result = await supabase
              .from('emails')
              .update({ is_archived: false, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'delete':
            result = await supabase
              .from('emails')
              .update({ is_deleted: true, deleted_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'restore':
            result = await supabase
              .from('emails')
              .update({ is_deleted: false, deleted_at: null, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'permanent_delete':
            result = await supabase
              .from('emails')
              .delete()
              .eq('user_id', user.id)
              .eq('is_deleted', true) // Only allow permanent delete if already in trash
              .in('id', op.emailIds);
            break;

          case 'star':
            result = await supabase
              .from('emails')
              .update({ is_starred: op.value, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'categorize':
            result = await supabase
              .from('emails')
              .update({ category: op.category, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          case 'set_priority':
            result = await supabase
              .from('emails')
              .update({ priority: op.priority, updated_at: now })
              .eq('user_id', user.id)
              .in('id', op.emailIds);
            break;

          default:
            results.push({
              operation: (op as { action: string }).action,
              success: false,
              affected: 0,
              error: 'Unknown action'
            });
            continue;
        }

        if (result.error) {
          results.push({
            operation: op.action,
            success: false,
            affected: 0,
            error: result.error.message
          });
        } else {
          results.push({
            operation: op.action,
            success: true,
            affected: op.emailIds.length
          });
        }

      } catch (error) {
        results.push({
          operation: op.action,
          success: false,
          affected: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const totalAffected = results.reduce((sum, r) => sum + r.affected, 0);

    return NextResponse.json({
      success: successCount === results.length,
      results,
      summary: {
        totalOperations: results.length,
        successfulOperations: successCount,
        totalEmailsAffected: totalAffected,
        duration: `${duration}ms`
      }
    });

  } catch (error) {
    console.error('Batch operation error:', error);
    return NextResponse.json(
      { error: 'Batch operation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
