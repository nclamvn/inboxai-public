'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

interface BatchResult {
  success: boolean;
  results: { operation: string; success: boolean; affected: number; error?: string }[];
  summary: {
    totalOperations: number;
    successfulOperations: number;
    totalEmailsAffected: number;
    duration: string;
  };
}

async function executeBatch(operations: BatchOperation[]): Promise<BatchResult> {
  const response = await fetch('/api/emails/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Batch operation failed' }));
    throw new Error(error.error || 'Batch operation failed');
  }

  return response.json();
}

export function useEmailBatch() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: executeBatch,
    onSuccess: () => {
      // Invalidate all email-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-counts'] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  // Convenience methods for single operations
  const markRead = useCallback((emailIds: string[], value: boolean = true) => {
    return mutation.mutateAsync([{ action: 'mark_read', emailIds, value }]);
  }, [mutation]);

  const markAllRead = useCallback((emailIds: string[]) => {
    return markRead(emailIds, true);
  }, [markRead]);

  const markAllUnread = useCallback((emailIds: string[]) => {
    return markRead(emailIds, false);
  }, [markRead]);

  const archive = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([{ action: 'archive', emailIds }]);
  }, [mutation]);

  const unarchive = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([{ action: 'unarchive', emailIds }]);
  }, [mutation]);

  const deleteEmails = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([{ action: 'delete', emailIds }]);
  }, [mutation]);

  const restoreEmails = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([{ action: 'restore', emailIds }]);
  }, [mutation]);

  const permanentDelete = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([{ action: 'permanent_delete', emailIds }]);
  }, [mutation]);

  const star = useCallback((emailIds: string[], value: boolean = true) => {
    return mutation.mutateAsync([{ action: 'star', emailIds, value }]);
  }, [mutation]);

  const unstar = useCallback((emailIds: string[]) => {
    return star(emailIds, false);
  }, [star]);

  const categorize = useCallback((emailIds: string[], category: string) => {
    return mutation.mutateAsync([{ action: 'categorize', emailIds, category }]);
  }, [mutation]);

  const setPriority = useCallback((emailIds: string[], priority: number) => {
    return mutation.mutateAsync([{ action: 'set_priority', emailIds, priority }]);
  }, [mutation]);

  // Batch multiple operations at once (most efficient)
  const executeBatchOps = useCallback((operations: BatchOperation[]) => {
    return mutation.mutateAsync(operations);
  }, [mutation]);

  // Common combined operations
  const archiveAndMarkRead = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([
      { action: 'mark_read', emailIds, value: true },
      { action: 'archive', emailIds }
    ]);
  }, [mutation]);

  const deleteAndMarkRead = useCallback((emailIds: string[]) => {
    return mutation.mutateAsync([
      { action: 'mark_read', emailIds, value: true },
      { action: 'delete', emailIds }
    ]);
  }, [mutation]);

  return {
    // Single operations
    markRead,
    markAllRead,
    markAllUnread,
    archive,
    unarchive,
    deleteEmails,
    restoreEmails,
    permanentDelete,
    star,
    unstar,
    categorize,
    setPriority,

    // Combined operations
    archiveAndMarkRead,
    deleteAndMarkRead,

    // Batch operations
    executeBatch: executeBatchOps,

    // State
    isLoading: mutation.isPending,
    error: mutation.error,
    lastResult: mutation.data,

    // Reset
    reset: mutation.reset,
  };
}

export default useEmailBatch;
