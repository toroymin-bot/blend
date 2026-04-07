'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { CodeRunner } from '@/modules/plugins/code-runner';
import { usePluginStore } from '@/stores/plugin-store';

interface CodeBlockProps {
  children: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ children, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { isInstalled } = usePluginStore();
  const codeRunnerEnabled = isInstalled('code-runner');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunnable = codeRunnerEnabled && (
    !language ||
    language === 'javascript' ||
    language === 'js' ||
    language === 'jsx' ||
    language === 'ts' ||
    language === 'tsx'
  );

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between bg-gray-950 rounded-t-lg px-4 py-1.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {filename && <span className="text-xs text-gray-300 font-mono">{filename}</span>}
          <span className="text-xs text-gray-500">{language || 'code'}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">복사됨</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>복사</span>
            </>
          )}
        </button>
      </div>
      <pre className={`bg-gray-950 p-4 overflow-x-auto ${isRunnable ? '' : 'rounded-b-lg'}`}>
        <code className="text-sm text-gray-300 font-mono">{children}</code>
      </pre>
      {isRunnable && (
        <CodeRunner code={children} language={language} />
      )}
    </div>
  );
}
