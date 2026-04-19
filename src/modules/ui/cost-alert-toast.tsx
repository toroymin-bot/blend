'use client';

// CostAlertToast — shows a warning banner when daily cost limit is reached.
// Mounts once at app level; checks usage on every addRecord call.

import { useEffect, useState } from 'react';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export function CostAlertToast() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [todayCost, setTodayCost] = useState(0);
  const { records, getTodayCost, checkDailyLimit, dailyLimitAlerted, resetDailyAlert } = useUsageStore();
  const { settings } = useSettingsStore();

  useEffect(() => {
    const limit = settings.dailyCostLimit ?? 0;
    if (limit <= 0) return;

    const cost = getTodayCost();
    setTodayCost(cost);

    if (checkDailyLimit(limit) && !dailyLimitAlerted) {
      // Mark alerted so we don't spam
      useUsageStore.setState({ dailyLimitAlerted: true });
      setVisible(true);
      // Auto-hide after 6 seconds
      const timer = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [records, settings.dailyCostLimit]);

  // Reset alert flag at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => resetDailyAlert(), msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const limit = settings.dailyCostLimit ?? 1;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 bg-yellow-500 text-yellow-950 rounded-xl shadow-lg text-sm font-medium max-w-sm w-full mx-4">
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">
        {t('chat.daily_limit_reached')} — {t('dashboard.today_cost')}: <strong>${Math.round(todayCost)}</strong> (limit: ${Math.round(limit)})
      </span>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 hover:text-yellow-800"
        aria-label={t('common.close')}
      >
        <X size={16} />
      </button>
    </div>
  );
}
