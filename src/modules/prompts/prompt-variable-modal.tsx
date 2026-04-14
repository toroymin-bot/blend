'use client';

// Blend - Prompt Variable Modal
// When a prompt contains {{varName}} patterns, show this modal so the user
// can fill in each variable before the prompt is inserted into the chat input.

import { useState, KeyboardEvent } from 'react';
import { X, Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface PromptVariableModalProps {
  title: string;
  variables: string[];
  onConfirm: (values: Record<string, string>) => void;
  onClose: () => void;
}

export function PromptVariableModal({ title, variables, onConfirm, onClose }: PromptVariableModalProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(variables.map((v) => [v, '']))
  );

  const handleConfirm = () => {
    onConfirm(values);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, isLast: boolean) => {
    if (e.key === 'Enter' && isLast) handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('prompts.variable_input')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Variable inputs */}
        <div className="space-y-3 mb-5">
          {variables.map((variable, idx) => (
            <div key={variable}>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {variable}
              </label>
              <input
                type="text"
                autoFocus={idx === 0}
                value={values[variable] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [variable]: e.target.value }))}
                onKeyDown={(e) => handleKeyDown(e, idx === variables.length - 1)}
                placeholder={t('prompts.variable_placeholder', { name: variable })}
                className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
          >
            <Check size={14} /> {t('prompts.insert')}
          </button>
        </div>
      </div>
    </div>
  );
}
