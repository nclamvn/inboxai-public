'use client';

/**
 * Global Error Page
 * Handles unexpected errors in the application
 */
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Đã xảy ra lỗi
        </h1>

        {/* Description */}
        <p className="text-gray-500 dark:text-gray-400 mb-2">
          Rất tiếc, đã có lỗi xảy ra khi tải trang này.
        </p>

        {/* Error digest for debugging */}
        {error.digest && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 font-mono">
            Mã lỗi: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </button>
          <a
            href="/inbox"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Home className="w-4 h-4" />
            Về Hộp thư
          </a>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          Nếu lỗi vẫn tiếp tục, vui lòng liên hệ hỗ trợ.
        </p>
      </div>
    </div>
  );
}
