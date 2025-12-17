/**
 * Toast Component
 * Enhanced toast with types, undo, queue management
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Undo2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'undo';

// Global toast event system for calling toast() outside of React components
type ToastEventHandler = (type: ToastType, message: string, description?: string, duration?: number) => void;
let globalToastHandler: ToastEventHandler | null = null;

/**
 * Standalone toast function for backwards compatibility
 * Can be called from anywhere in the app
 */
export function toast(type: ToastType, message: string, description?: string, duration?: number): void {
  if (globalToastHandler) {
    globalToastHandler(type, message, description, duration);
  } else {
    console.warn('Toast called before ToastProvider mounted. Message:', message);
  }
}

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  onUndo?: () => void;
  persistent?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  loading: (title: string, description?: string) => string;
  undo: (title: string, onUndo: () => void, duration?: number) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  update: (id: string, toast: Partial<Omit<Toast, 'id'>>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Toast icons
const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />,
  error: <XCircle className="h-5 w-5 text-[var(--error)]" />,
  warning: <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />,
  info: <Info className="h-5 w-5 text-[var(--info)]" />,
  loading: <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />,
  undo: <Undo2 className="h-5 w-5 text-[var(--primary)]" />,
};

// Default durations
const defaultDurations: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 4000,
  loading: 0, // Persistent
  undo: 5000,
};

// Generate unique ID
let toastCount = 0;
const generateId = () => `toast-${++toastCount}-${Date.now()}`;

/**
 * Toast Provider
 */
export function ToastProvider({
  children,
  maxToasts = 5,
  position = 'bottom-right',
}: {
  children: React.ReactNode;
  maxToasts?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add toast
  const show = useCallback((toastData: Omit<Toast, 'id'>): string => {
    const id = generateId();
    const newToast: Toast = { ...toastData, id };

    setToasts((prev) => {
      const updated = [...prev, newToast];
      // Remove oldest if exceeds max
      if (updated.length > maxToasts) {
        return updated.slice(-maxToasts);
      }
      return updated;
    });

    return id;
  }, [maxToasts]);

  // Register global toast handler for standalone toast() function
  useEffect(() => {
    globalToastHandler = (type, message, description, duration) => {
      show({ type, title: message, description, duration });
    };
    return () => {
      globalToastHandler = null;
    };
  }, [show]);

  // Shorthand methods
  const success = useCallback(
    (title: string, description?: string) =>
      show({ type: 'success', title, description }),
    [show]
  );

  const error = useCallback(
    (title: string, description?: string) =>
      show({ type: 'error', title, description }),
    [show]
  );

  const warning = useCallback(
    (title: string, description?: string) =>
      show({ type: 'warning', title, description }),
    [show]
  );

  const info = useCallback(
    (title: string, description?: string) =>
      show({ type: 'info', title, description }),
    [show]
  );

  const loading = useCallback(
    (title: string, description?: string) =>
      show({ type: 'loading', title, description, persistent: true }),
    [show]
  );

  const undo = useCallback(
    (title: string, onUndo: () => void, duration = 5000) =>
      show({ type: 'undo', title, onUndo, duration }),
    [show]
  );

  // Dismiss toast
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dismiss all
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Update toast
  const update = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  // Position classes
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  const value: ToastContextValue = {
    toasts,
    show,
    success,
    error,
    warning,
    info,
    loading,
    undo,
    dismiss,
    dismissAll,
    update,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container */}
      <div
        className={cn(
          'fixed z-[100] flex flex-col gap-2 pointer-events-none',
          positionClasses[position]
        )}
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Toast Item Component
 */
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const duration = toast.duration ?? defaultDurations[toast.type];
  const isPersistent = toast.persistent || duration === 0;

  // Auto dismiss timer
  useEffect(() => {
    if (isPersistent) return;

    const startTime = Date.now();
    startTimeRef.current = startTime;

    // Progress update
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
    }, 50);

    // Dismiss timer
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => {
      clearInterval(progressInterval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, isPersistent]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 150);
  };

  const handleUndo = () => {
    toast.onUndo?.();
    handleDismiss();
  };

  return (
    <div
      className={cn(
        'pointer-events-auto',
        'w-80 max-w-[calc(100vw-2rem)]',
        'bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg',
        'overflow-hidden',
        'transition-all duration-150',
        isExiting
          ? 'opacity-0 translate-x-4 scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right'
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {toastIcons[toast.type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">
              {toast.description}
            </p>
          )}

          {/* Action button */}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
            >
              {toast.action.label}
            </button>
          )}

          {/* Undo button */}
          {toast.type === 'undo' && toast.onUndo && (
            <button
              onClick={handleUndo}
              className="mt-2 text-sm font-medium text-[var(--info)] hover:underline transition-colors"
            >
              Undo
            </button>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 -m-1 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar for undo toast */}
      {toast.type === 'undo' && !isPersistent && (
        <div className="h-1 bg-[var(--secondary)]">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * useToast Hook
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastProvider;
