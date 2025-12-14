'use client';

/**
 * AI Features Settings
 * Settings panel for configuring AI features
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  Star,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AIFeatureKey,
  EmailCategory,
  AI_FEATURES_INFO,
  CATEGORIES_INFO
} from '@/types/ai-features';

interface VipSender {
  id: string;
  sender_email?: string;
  sender_domain?: string;
  enable_all_ai: boolean;
  priority_boost: number;
}

interface UsageStats {
  totalEmails: number;
  totalCost: number;
  savingsEstimate: number;
}

export function AIFeaturesSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('work');
  const [defaults, setDefaults] = useState<Array<{
    category: string;
    feature_key: string;
    auto_enabled: boolean;
    button_visible: boolean;
  }>>([]);
  const [userOverrides, setUserOverrides] = useState<Record<string, Record<string, { auto?: boolean; button?: boolean }>>>({});
  const [vipSenders, setVipSenders] = useState<VipSender[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  // New VIP sender form
  const [newVipEmail, setNewVipEmail] = useState('');
  const [newVipDomain, setNewVipDomain] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/ai-features');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setDefaults(data.defaults || []);
      setUserOverrides(data.userOverrides || {});
      setVipSenders(data.vipSenders || []);
      setUsageStats(data.usageStats || null);
    } catch (error) {
      console.error('Error fetching AI settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateFeatureConfig = async (
    category: EmailCategory,
    featureKey: AIFeatureKey,
    field: 'autoEnabled' | 'buttonVisible',
    value: boolean
  ) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings/ai-features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          featureKey,
          [field]: value,
        }),
      });

      if (!response.ok) throw new Error('Failed to update');

      // Update local state
      setUserOverrides(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [featureKey]: {
            ...prev[category]?.[featureKey],
            [field === 'autoEnabled' ? 'auto' : 'button']: value,
          },
        },
      }));
    } catch (error) {
      console.error('Error updating config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addVipSender = async () => {
    if (!newVipEmail && !newVipDomain) return;

    try {
      const response = await fetch('/api/settings/vip-senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: newVipEmail || undefined,
          senderDomain: newVipDomain || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to add VIP sender');

      // Refresh list
      await fetchSettings();
      setNewVipEmail('');
      setNewVipDomain('');
    } catch (error) {
      console.error('Error adding VIP sender:', error);
    }
  };

  const removeVipSender = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/vip-senders?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove VIP sender');

      setVipSenders(prev => prev.filter(v => v.id !== id));
    } catch (error) {
      console.error('Error removing VIP sender:', error);
    }
  };

  const getFeatureConfig = (category: EmailCategory, featureKey: AIFeatureKey) => {
    // Check user override first
    const override = userOverrides[category]?.[featureKey];
    if (override) {
      return {
        autoEnabled: override.auto ?? false,
        buttonVisible: override.button ?? true,
      };
    }

    // Fall back to defaults
    const defaultConfig = defaults.find(
      d => d.category === category && d.feature_key === featureKey
    );
    return {
      autoEnabled: defaultConfig?.auto_enabled ?? false,
      buttonVisible: defaultConfig?.button_visible ?? true,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Usage Stats Summary */}
      {usageStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Emails processed"
            value={usageStats.totalEmails}
          />
          <StatCard
            label="Tổng chi phí"
            value={`$${usageStats.totalCost.toFixed(4)}`}
          />
          <StatCard
            label="Tiết kiệm"
            value={`$${usageStats.savingsEstimate.toFixed(4)}`}
            highlight
          />
          <StatCard
            label="% Tiết kiệm"
            value={`${Math.round((usageStats.savingsEstimate / (usageStats.totalCost + usageStats.savingsEstimate || 1)) * 100)}%`}
            highlight
          />
        </div>
      )}

      {/* Category Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex overflow-x-auto">
          {CATEGORIES_INFO.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeCategory === cat.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {cat.nameVi}
            </button>
          ))}
        </div>
      </div>

      {/* Features Config for Active Category */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Cài đặt AI cho {CATEGORIES_INFO.find(c => c.key === activeCategory)?.nameVi}
        </h3>

        <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
          {AI_FEATURES_INFO.filter(f => f.key !== 'classification').map(feature => {
            const config = getFeatureConfig(activeCategory, feature.key);

            return (
              <div key={feature.key} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-sm text-gray-900 dark:text-white">
                    {feature.nameVi}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{feature.descriptionVi}</p>
                </div>

                <div className="flex items-center gap-4">
                  {/* Auto Enable Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Tự động</span>
                    <input
                      type="checkbox"
                      checked={config.autoEnabled}
                      onChange={(e) => updateFeatureConfig(
                        activeCategory,
                        feature.key,
                        'autoEnabled',
                        e.target.checked
                      )}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  {/* Button Visible Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Nút bấm</span>
                    <input
                      type="checkbox"
                      checked={config.buttonVisible}
                      onChange={(e) => updateFeatureConfig(
                        activeCategory,
                        feature.key,
                        'buttonVisible',
                        e.target.checked
                      )}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={config.autoEnabled}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* VIP Senders */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          VIP Senders (Bật tất cả AI)
        </h3>

        {/* Add VIP Form */}
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="Email (vd: boss@company.com)"
            value={newVipEmail}
            onChange={(e) => setNewVipEmail(e.target.value)}
            className={cn(
              'flex-1 px-3 py-2 text-sm rounded-lg border',
              'bg-white border-gray-300 text-gray-900',
              'dark:bg-gray-800 dark:border-gray-700 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
          />
          <input
            type="text"
            placeholder="Hoặc domain (vd: company.com)"
            value={newVipDomain}
            onChange={(e) => setNewVipDomain(e.target.value)}
            className={cn(
              'flex-1 px-3 py-2 text-sm rounded-lg border',
              'bg-white border-gray-300 text-gray-900',
              'dark:bg-gray-800 dark:border-gray-700 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
          />
          <button
            onClick={addVipSender}
            disabled={!newVipEmail && !newVipDomain}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-blue-600 text-white hover:bg-blue-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* VIP List */}
        {vipSenders.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {vipSenders.map(vip => (
              <div key={vip.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {vip.sender_email || `*@${vip.sender_domain}`}
                  </span>
                </div>
                <button
                  onClick={() => removeVipSender(vip.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-4">
            Chưa có VIP sender nào
          </p>
        )}
      </div>

      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang lưu...
        </div>
      )}
    </div>
  );
}

// Helper component
function StatCard({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string | number;
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'p-4 rounded-lg',
      highlight
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
    )}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={cn(
        'text-lg font-semibold mt-1',
        highlight ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'
      )}>
        {value}
      </p>
    </div>
  );
}
