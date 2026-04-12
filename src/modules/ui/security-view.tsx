'use client';

import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Level = 'safe' | 'info' | 'caution';

interface QA {
  q: string;
  a: string;
  level: Level;
  emoji: string;
}

interface Category {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  color: string;        // Tailwind bg color for accent
  borderColor: string;  // Tailwind border color
  items: QA[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'chat',
    emoji: '💬',
    title: '채팅 내용 보안',
    subtitle: '내가 AI와 나눈 대화는 어디에 저장되나요?',
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    items: [
      {
        emoji: '📱',
        q: '채팅 내용을 다른 사람이 볼 수 있나요?',
        a: '아니요! 채팅 내용은 오직 내 기기(핸드폰·컴퓨터)에만 저장돼요. 블렌드 서버에는 아무것도 저장되지 않아요. 내 일기장을 내 서랍에 넣어 두는 것과 같아요.',
        level: 'safe',
      },
      {
        emoji: '🔄',
        q: '채팅할 때 내 메시지가 어디로 가나요?',
        a: '내 메시지는 내가 선택한 AI 회사(OpenAI·Google·Anthropic 등)로 직접 전송돼요. 블렌드 서버를 거치지 않아요. 즉, 블렌드는 내 대화를 "볼 수 없어요".',
        level: 'safe',
      },
      {
        emoji: '🗑',
        q: '앱을 삭제하면 채팅 기록도 사라지나요?',
        a: '네! 블렌드는 내 기기의 브라우저 저장소(localStorage)를 사용해요. 브라우저 데이터를 지우거나 앱을 삭제하면 채팅 기록도 함께 사라져요.',
        level: 'info',
      },
      {
        emoji: '🌐',
        q: '같은 와이파이를 쓰는 옆 사람이 내 채팅을 볼 수 있나요?',
        a: 'AI 회사와의 통신은 모두 HTTPS(암호화)를 사용해요. 같은 와이파이를 쓰더라도 내 대화 내용은 암호화되어 있어서 볼 수 없어요.',
        level: 'safe',
      },
    ],
  },
  {
    id: 'docs',
    emoji: '📁',
    title: '문서·데이터 보안',
    subtitle: '내가 올린 파일은 안전한가요?',
    color: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    items: [
      {
        emoji: '📂',
        q: '내가 올린 문서를 다른 사람이 볼 수 있나요?',
        a: '아니요! 업로드한 파일은 내 기기의 브라우저 저장소(IndexedDB)에만 저장돼요. 블렌드 서버에는 파일이 업로드되지 않아요. 내 컴퓨터 하드 드라이브에 저장하는 것과 같아요.',
        level: 'safe',
      },
      {
        emoji: '🔍',
        q: '문서 내용이 AI에게 전달될 때 안전한가요?',
        a: 'AI가 문서를 참고할 때, 관련된 부분만 골라서 HTTPS 암호화 채널로 전달돼요. 전체 파일이 통째로 보내지는 게 아니에요.',
        level: 'safe',
      },
      {
        emoji: '☁️',
        q: '구글 드라이브·원드라이브 파일도 안전한가요?',
        a: '연결 후 파일 내용은 내 기기에 잠깐 읽어서 처리하고, 블렌드 서버에는 저장되지 않아요. 단, 해당 클라우드 서비스(Google·Microsoft)의 보안 정책을 따라요.',
        level: 'safe',
      },
      {
        emoji: '🔑',
        q: '구글/마이크로소프트 로그인 정보가 저장되나요?',
        a: '비밀번호는 절대 저장되지 않아요! OAuth 방식을 사용해서 임시 토큰(1시간 유효)만 내 기기에 잠시 저장돼요. 블렌드는 비밀번호를 알 수 없어요.',
        level: 'safe',
      },
    ],
  },
  {
    id: 'apikey',
    emoji: '🗝️',
    title: 'API 키 보안',
    subtitle: 'OpenAI·Google 등의 키는 어디에 저장되나요?',
    color: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    items: [
      {
        emoji: '🔐',
        q: 'API 키가 유출될 위험이 있나요?',
        a: 'API 키는 내 기기의 브라우저 저장소에만 저장돼요. 블렌드 서버에는 전송·저장되지 않아요. 단, 기기를 잃어버리거나 남이 내 브라우저를 쓰면 위험할 수 있어요.',
        level: 'info',
      },
      {
        emoji: '🚫',
        q: '블렌드가 내 API 키로 몰래 뭔가를 할 수 있나요?',
        a: '블렌드는 정적 웹사이트(서버 없음)예요. 내 키는 내 기기에서만 사용되고, 블렌드 팀이 접근하는 서버가 없어요. 소스 코드도 공개되어 있어요.',
        level: 'safe',
      },
      {
        emoji: '🔄',
        q: 'API 키를 주기적으로 바꿔야 하나요?',
        a: '보안을 위해 3~6개월마다 교체하는 것을 권장해요. 특히 공용 컴퓨터에서 사용했다면 바로 교체하세요!',
        level: 'caution',
      },
    ],
  },
  {
    id: 'network',
    emoji: '🌐',
    title: '네트워크 보안',
    subtitle: '인터넷으로 주고받는 데이터는 안전한가요?',
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    items: [
      {
        emoji: '🔒',
        q: '통신이 암호화되나요?',
        a: '네! 블렌드와 AI 회사 사이의 모든 통신은 HTTPS/TLS로 암호화돼요. 중간에서 가로채도 내용을 읽을 수 없어요. 우편을 봉투에 넣어 보내는 것과 같아요.',
        level: 'safe',
      },
      {
        emoji: '📡',
        q: '공공 와이파이에서 사용해도 되나요?',
        a: '암호화(HTTPS)가 되어 있어서 비교적 안전하지만, 공공 와이파이는 기본적으로 위험해요. 중요한 업무는 개인 핫스팟이나 집 와이파이를 사용하는 게 좋아요.',
        level: 'caution',
      },
      {
        emoji: '🛰',
        q: '블렌드 서버가 내 사용 데이터를 수집하나요?',
        a: '블렌드는 서버가 없는 정적 사이트예요. Vercel(호스팅 회사)의 기본 접속 로그(IP, 접속 시간)만 기록돼요. 내 채팅·문서·키는 수집되지 않아요.',
        level: 'safe',
      },
    ],
  },
  {
    id: 'server',
    emoji: '🖥',
    title: '서버·인프라 보안',
    subtitle: '블렌드 앱 자체는 어떻게 보호되고 있나요?',
    color: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    items: [
      {
        emoji: '🏗',
        q: '블렌드의 서버가 해킹될 수 있나요?',
        a: '블렌드는 서버 없는 정적 사이트예요! 해킹당할 서버가 없어요. 코드만 Vercel CDN에 배포되는 방식이라 공격 표면이 매우 작아요.',
        level: 'safe',
      },
      {
        emoji: '🔄',
        q: '블렌드 앱 코드는 안전한가요?',
        a: 'Vercel은 세계적인 클라우드 회사로, 자동 HTTPS·DDoS 방어·글로벌 CDN 보호를 제공해요. 앱 코드는 GitHub에 공개되어 누구나 검토할 수 있어요.',
        level: 'safe',
      },
      {
        emoji: '🔐',
        q: 'AI 회사들의 보안은 믿을 수 있나요?',
        a: 'OpenAI·Google·Anthropic은 모두 SOC2·ISO27001 등 국제 보안 인증을 받은 대형 기업이에요. 각 회사의 데이터 처리 방침에 따라 대화 내용이 처리돼요.',
        level: 'info',
      },
      {
        emoji: '📋',
        q: 'AI 회사가 내 대화를 학습에 사용하나요?',
        a: '회사마다 달라요. API를 통한 대화는 대부분 학습에 사용되지 않지만, 각 회사의 이용약관을 확인하세요. OpenAI API는 기본적으로 학습에 사용 안 해요.',
        level: 'info',
      },
    ],
  },
  {
    id: 'device',
    emoji: '📱',
    title: '내 기기 보안',
    subtitle: '내 기기에서 데이터를 지키는 방법',
    color: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    items: [
      {
        emoji: '👀',
        q: '가족·동료가 내 채팅을 볼 수 있나요?',
        a: '같은 기기·같은 브라우저를 쓰면 볼 수 있어요. 민감한 내용은 사용 후 "채팅 삭제"를 해주세요. 또는 시크릿 창(인코그니토)에서 사용하면 기록이 남지 않아요.',
        level: 'caution',
      },
      {
        emoji: '🔓',
        q: '기기를 잃어버리면 데이터가 유출되나요?',
        a: '기기에 잠금(핀·지문·얼굴 인식)이 있으면 안전해요. 잠금이 없는 기기를 분실하면 브라우저에 저장된 채팅·API 키가 노출될 수 있어요.',
        level: 'caution',
      },
      {
        emoji: '🧹',
        q: '데이터를 완전히 지우려면 어떻게 하나요?',
        a: '설정 → "모든 데이터 초기화" 또는 브라우저 설정에서 blend.ai4min.com의 사이트 데이터를 삭제하면 모든 채팅·문서·키가 완전히 지워져요.',
        level: 'info',
      },
    ],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: Level }) {
  if (level === 'safe') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <CheckCircle2 size={10} /> 안전
    </span>
  );
  if (level === 'caution') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <AlertTriangle size={10} /> 주의
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <Info size={10} /> 참고
    </span>
  );
}

function QACard({ item }: { item: QA }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left bg-gray-800/60 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-xl shrink-0 mt-0.5">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-200 leading-snug">{item.q}</p>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <LevelBadge level={item.level} />
              {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-0">
          <div className={`ml-9 text-sm text-gray-300 leading-relaxed rounded-lg p-3 ${
            item.level === 'safe' ? 'bg-green-900/20 border border-green-700/30' :
            item.level === 'caution' ? 'bg-yellow-900/20 border border-yellow-700/30' :
            'bg-blue-900/20 border border-blue-700/30'
          }`}>
            {item.a}
          </div>
        </div>
      )}
    </button>
  );
}

function CategorySection({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-2xl border ${cat.borderColor} ${cat.color} overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {cat.emoji} {cat.title}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{cat.subtitle}</p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {cat.items.map((item, i) => <QACard key={i} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────

export function SecurityView() {
  const safeCount = CATEGORIES.flatMap((c) => c.items).filter((i) => i.level === 'safe').length;
  const totalCount = CATEGORIES.flatMap((c) => c.items).length;

  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <Shield size={20} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">보안 안내</h1>
              <p className="text-xs text-gray-400">내 데이터는 얼마나 안전한가요?</p>
            </div>
          </div>

          {/* Overall score banner */}
          <div className="mt-4 bg-green-900/20 border border-green-700/30 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="text-4xl">🛡️</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-300">총 {totalCount}개 항목 중 {safeCount}개가 "안전"이에요!</p>
              <p className="text-xs text-gray-400 mt-0.5">
                블렌드는 서버가 없는 앱이에요. 내 데이터는 내 기기 안에서만 저장·처리돼요.
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 size={12} /> <span>안전 — 걱정 안 해도 돼요</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-blue-400">
              <Info size={12} /> <span>참고 — 알아 두면 좋아요</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <AlertTriangle size={12} /> <span>주의 — 신경 써주세요</span>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.id} cat={cat} />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-6 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-400 mb-1">📌 한 줄 요약</p>
          <p>• 내 채팅·파일·API 키는 <span className="text-green-400 font-medium">내 기기 브라우저에만</span> 저장돼요</p>
          <p>• 블렌드 팀은 내 데이터를 볼 수 없어요 — 서버가 없거든요!</p>
          <p>• AI 회사(OpenAI 등)는 내 메시지를 받지만, 이건 AI를 쓰는 이상 피할 수 없어요</p>
          <p>• 공용 기기 사용 후엔 꼭 채팅 삭제하세요 🧹</p>
        </div>

      </div>
    </div>
  );
}
