// OneDrive File Picker — Tori 명세 16384118 §3.4 (+Q4 Personal 지원)
//
// Microsoft OneDrive File Picker SDK v8 — iframe + postMessage 기반.
// docs: https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/
//
// Personal/Business 동시 지원: account.tenant = 'common'
// (Personal 만 → 'consumers' / Business 만 → 'organizations' / 둘 다 → 'common')

import { makeSelection, MAX_TOTAL_SELECTIONS } from './picker-shared';
import type { DataSourceSelection } from '@/types';

interface OneDrivePickerItem {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number };
  parentReference?: { path?: string };
  webUrl?: string;
}

interface OneDriveOptions {
  accessToken: string;
  /** OneDrive Personal: 'consumers' / Business: 'organizations' / 둘 다: 'common' */
  tenant?: 'common' | 'consumers' | 'organizations';
  /** UI lang */
  locale?: 'ko' | 'en';
}

// Picker SDK는 `https://js.live.net/v7.2/OneDrive.js` 또는 v8 (organization) iframe URL.
// 가장 호환성 높은 방식: window.open으로 picker URL을 띄우고 postMessage 응답 받음.
//
// 단순화 — postMessage 기반 OneDrive Picker v8 endpoint 사용:
//   https://onedrive.live.com/picker?...     (Personal)
//   https://{tenant}.sharepoint.com/_layouts/15/Picker.aspx  (Business)
//
// 가장 간단한 cross-tenant 동작: Microsoft Graph 직접 검색 + 자체 selection UI.
// 하지만 명세대로 SDK 사용 — 제한적이지만 BYOK 호환.

const PICKER_BASE_PERSONAL = 'https://onedrive.live.com/picker';
const PICKER_BASE_ORG_TEMPLATE = 'https://{host}/_layouts/15/FilePicker.aspx';

function pickerUrl(tenant: 'common' | 'consumers' | 'organizations'): string {
  // Personal first — Business는 tenant host가 필요해서 별도 처리
  if (tenant === 'organizations') return PICKER_BASE_ORG_TEMPLATE; // 호출자가 host 채워야
  return PICKER_BASE_PERSONAL;
}

export async function openOneDrivePicker(opts: OneDriveOptions): Promise<DataSourceSelection[] | null> {
  const tenant = opts.tenant ?? 'common';

  // OneDrive Picker SDK v8 자체는 무거우므로 동적 import 패턴 권장.
  // 현재 npm에 정식 v8 wrapper가 없어 postMessage 통신을 직접 구현.
  return new Promise<DataSourceSelection[] | null>((resolve) => {
    const popup = window.open(
      pickerUrl(tenant),
      'onedrive-picker',
      'width=720,height=720,left=200,top=80'
    );
    if (!popup) {
      resolve(null);
      return;
    }

    let resolved = false;

    function onMessage(ev: MessageEvent) {
      // Microsoft Picker는 `https://onedrive.live.com` / `https://*.sharepoint.com` origin
      const ok =
        /onedrive\.live\.com$/.test(new URL(ev.origin).hostname) ||
        /sharepoint\.com$/.test(new URL(ev.origin).hostname);
      if (!ok) return;
      const data = ev.data as { type?: string; command?: string; items?: OneDrivePickerItem[] };
      if (!data) return;

      // initialize handshake
      if (data.type === 'initialize') {
        popup?.postMessage(
          {
            type: 'initialize',
            channelId: 'blend',
            apiVersion: '2.0',
            authentication: { token: opts.accessToken },
            uiOptions: { locale: opts.locale ?? 'ko' },
            selection: { mode: 'multiple', maxItems: MAX_TOTAL_SELECTIONS },
            allowedMimeTypes: ['application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          },
          ev.origin
        );
        return;
      }

      if (data.command === 'pick' && Array.isArray(data.items)) {
        const selections = data.items.map((it) =>
          makeSelection({
            id: it.id,
            kind: it.folder ? 'folder' : 'file',
            name: it.name,
            path: it.parentReference?.path ? `${it.parentReference.path}/${it.name}` : it.name,
            fileCount: it.folder?.childCount,
            approxBytes: it.size,
          })
        );
        resolved = true;
        cleanup();
        resolve(selections);
      } else if (data.command === 'cancel' || data.command === 'close') {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }

    function cleanup() {
      window.removeEventListener('message', onMessage);
      try { popup?.close(); } catch {}
    }

    window.addEventListener('message', onMessage);

    // 사용자가 popup 직접 닫은 경우 polling
    const closeWatch = setInterval(() => {
      if (popup.closed) {
        clearInterval(closeWatch);
        if (!resolved) {
          cleanup();
          resolve(null);
        }
      }
    }, 500);
  });
}
