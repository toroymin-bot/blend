'use client';

// Blend - Chat Tags Component
// Displays tags for a chat and allows adding / removing them inline.

import { useState, KeyboardEvent } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import { useTranslation } from '@/lib/i18n';

interface ChatTagsProps {
  chatId: string;
  tags?: string[];
}

export function ChatTags({ chatId, tags = [] }: ChatTagsProps) {
  const { t } = useTranslation();
  const { addChatTag, removeChatTag } = useChatStore();
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      addChatTag(chatId, trimmed);
    }
    setInputValue('');
    setInputVisible(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') {
      setInputValue('');
      setInputVisible(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={12} className="text-gray-500 shrink-0" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded-full text-xs"
        >
          {tag}
          <button
            onClick={() => removeChatTag(chatId, tag)}
            className="hover:text-red-400 transition-colors"
            title={t('common.remove_tag')}
          >
            <X size={10} />
          </button>
        </span>
      ))}

      {inputVisible ? (
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          placeholder={t('common.tag_name')}
          className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-200 outline-none focus:ring-1 focus:ring-blue-500 w-24"
        />
      ) : (
        <button
          onClick={() => setInputVisible(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-full text-xs transition-colors"
          title={t('common.add_tag')}
        >
          <Plus size={10} /> {t('common.tag')}
        </button>
      )}
    </div>
  );
}
