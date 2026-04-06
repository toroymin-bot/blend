'use client';

import { useState, useRef, useCallback } from 'react';
import { Play, Square, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface CodeRunnerProps {
  code: string;
  language?: string;
}

interface RunResult {
  logs: string[];
  error?: string;
  html?: string;
}

export function CodeRunner({ code, language }: CodeRunnerProps) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const runCode = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setShowOutput(true);

    const logs: string[] = [];

    const sandboxHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: monospace; font-size: 13px; background: #1a1a2e; color: #e0e0e0; padding: 8px; margin: 0; }
  </style>
</head>
<body>
<script>
  const _logs = [];
  const _console = {
    log: (...args) => { _logs.push(args.map(String).join(' ')); },
    error: (...args) => { _logs.push('[ERROR] ' + args.map(String).join(' ')); },
    warn: (...args) => { _logs.push('[WARN] ' + args.map(String).join(' ')); },
    info: (...args) => { _logs.push('[INFO] ' + args.map(String).join(' ')); },
  };
  window.console = _console;

  window.onerror = (msg, src, line, col, err) => {
    parent.postMessage({ type: 'error', error: msg + ' (line ' + line + ')' }, '*');
    return true;
  };

  try {
    ${code}
    parent.postMessage({ type: 'done', logs: _logs }, '*');
  } catch(e) {
    parent.postMessage({ type: 'error', logs: _logs, error: e.message }, '*');
  }
<\/script>
</body>
</html>`;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'done' || event.data?.type === 'error') {
        window.removeEventListener('message', handleMessage);
        setResult({
          logs: event.data.logs || [],
          error: event.data.error,
        });
        setIsRunning(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Safety timeout
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      if (isRunning) {
        setResult({ logs, error: '실행 시간 초과 (5초)' });
        setIsRunning(false);
      }
    }, 5000);

    const blob = new Blob([sandboxHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    if (iframeRef.current) {
      iframeRef.current.src = url;
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }, [code, isRunning]);

  const reset = () => {
    setResult(null);
    setShowOutput(false);
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
    }
  };

  const isJavaScript = !language || language === 'javascript' || language === 'js' || language === 'jsx' || language === 'ts' || language === 'tsx';

  if (!isJavaScript) return null;

  return (
    <div className="mt-1">
      {/* Hidden sandbox iframe */}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        className="hidden"
        title="code-sandbox"
      />

      <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 border-t border-gray-700">
        <button
          onClick={runCode}
          disabled={isRunning}
          className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
        >
          {isRunning ? <Square size={11} /> : <Play size={11} />}
          {isRunning ? '실행 중...' : '실행'}
        </button>
        {result && (
          <>
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RotateCcw size={11} /> 초기화
            </button>
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 ml-auto transition-colors"
            >
              {showOutput ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showOutput ? '출력 숨기기' : '출력 보기'}
            </button>
          </>
        )}
      </div>

      {showOutput && result && (
        <div className="bg-gray-950 rounded-b-lg px-4 py-3 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-2 font-mono">--- 실행 결과 ---</div>
          {result.logs.length > 0 ? (
            <div className="space-y-0.5">
              {result.logs.map((log, i) => (
                <div
                  key={i}
                  className={`text-xs font-mono ${
                    log.startsWith('[ERROR]') ? 'text-red-400' :
                    log.startsWith('[WARN]') ? 'text-yellow-400' :
                    'text-green-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600 font-mono">(출력 없음)</div>
          )}
          {result.error && (
            <div className="mt-2 text-xs text-red-400 font-mono border-t border-gray-800 pt-2">
              오류: {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
