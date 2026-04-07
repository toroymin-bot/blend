'use client';

import { useState } from 'react';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
import { Agent } from '@/types';
import { DEFAULT_MODELS } from '@/modules/models/model-registry';
import { Plus, Trash2, Edit3, MessageSquare, X, Check, Copy } from 'lucide-react';

interface AgentsViewProps {
  onStartChat?: () => void;
}

export function AgentsView({ onStartChat }: AgentsViewProps) {
  const { agents, activeAgentId, addAgent, deleteAgent, duplicateAgent, setActiveAgent, updateAgent, incrementUsage } = useAgentStore();
  const { createChat, setSelectedModel } = useChatStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [newAgent, setNewAgent] = useState({
    name: '', description: '', systemPrompt: '', model: 'gpt-4o-mini', icon: '🤖',
  });

  const handleCreate = () => {
    if (!newAgent.name.trim() || !newAgent.systemPrompt.trim()) return;
    addAgent(newAgent);
    setNewAgent({ name: '', description: '', systemPrompt: '', model: 'gpt-4o-mini', icon: '🤖' });
    setShowCreateModal(false);
  };

  const handleStartChatWithAgent = (agent: Agent) => {
    incrementUsage(agent.id);
    setActiveAgent(agent.id);
    setSelectedModel(agent.model);
    createChat();
    onStartChat?.();
  };

  const handleSaveEdit = () => {
    if (!editingAgent) return;
    updateAgent(editingAgent.id, editingAgent);
    setEditingAgent(null);
  };

  const icons = ['🤖', '💻', '✍️', '📊', '🌐', '🎨', '📝', '🔬', '💡', '🎯', '📚', '🏗️'];

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">AI 에이전트</h1>
            <p className="text-sm text-on-surface-muted mt-1">특정 작업에 특화된 AI 어시스턴트를 만들고 사용하세요</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
          >
            <Plus size={16} /> 새 에이전트
          </button>
        </div>

        {/* Agent list */}
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`bg-surface-2 rounded-xl p-4 border-2 transition-colors ${
                activeAgentId === agent.id ? 'border-blue-500' : 'border-transparent hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{agent.icon || '🤖'}</span>
                  <div>
                    <h3 className="font-medium text-on-surface">{agent.name}</h3>
                    <p className="text-xs text-on-surface-muted">{agent.model}</p>
                  </div>
                </div>
                {activeAgentId === agent.id && (
                  <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                    <Check size={10} /> 활성
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface-muted mb-3 line-clamp-2">{agent.description}</p>
              {(agent.usageCount ?? 0) > 0 && (
                <p className="text-xs text-gray-600 mb-2">{agent.usageCount}회 사용</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStartChatWithAgent(agent)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg text-xs text-blue-400"
                >
                  <MessageSquare size={12} /> 대화 시작
                </button>
                <button
                  onClick={() => setActiveAgent(activeAgentId === agent.id ? null : agent.id)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                >
                  {activeAgentId === agent.id ? '비활성화' : '활성화'}
                </button>
                <button
                  onClick={() => setEditingAgent({ ...agent })}
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded"
                  title="수정"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => duplicateAgent(agent.id)}
                  className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded"
                  title="복제"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => deleteAgent(agent.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded"
                  title="삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingAgent) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {editingAgent ? '에이전트 수정' : '새 에이전트'}
                </h2>
                <button
                  onClick={() => { setShowCreateModal(false); setEditingAgent(null); }}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                {/* Icon selector */}
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">아이콘</label>
                  <div className="flex flex-wrap gap-2">
                    {icons.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => editingAgent
                          ? setEditingAgent({ ...editingAgent, icon })
                          : setNewAgent({ ...newAgent, icon })
                        }
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                          (editingAgent?.icon || newAgent.icon) === icon
                            ? 'bg-blue-600 ring-2 ring-blue-400'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  value={editingAgent?.name || newAgent.name}
                  onChange={(e) => editingAgent
                    ? setEditingAgent({ ...editingAgent, name: e.target.value })
                    : setNewAgent({ ...newAgent, name: e.target.value })
                  }
                  placeholder="에이전트 이름"
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={editingAgent?.description || newAgent.description}
                  onChange={(e) => editingAgent
                    ? setEditingAgent({ ...editingAgent, description: e.target.value })
                    : setNewAgent({ ...newAgent, description: e.target.value })
                  }
                  placeholder="설명"
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">기본 모델</label>
                  <select
                    value={editingAgent?.model || newAgent.model}
                    onChange={(e) => editingAgent
                      ? setEditingAgent({ ...editingAgent, model: e.target.value })
                      : setNewAgent({ ...newAgent, model: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {DEFAULT_MODELS.filter((m) => m.enabled).map((m) => (
                      <option key={m.id} value={m.id}>{m.name} (${m.inputPrice}/${m.outputPrice})</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={editingAgent?.systemPrompt || newAgent.systemPrompt}
                  onChange={(e) => editingAgent
                    ? setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })
                    : setNewAgent({ ...newAgent, systemPrompt: e.target.value })
                  }
                  placeholder="시스템 프롬프트 (이 에이전트의 역할과 행동 규칙을 정의하세요)"
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none resize-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowCreateModal(false); setEditingAgent(null); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
                >
                  취소
                </button>
                <button
                  onClick={editingAgent ? handleSaveEdit : handleCreate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
                >
                  {editingAgent ? '저장' : '생성'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
