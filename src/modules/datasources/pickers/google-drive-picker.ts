// Google Drive Picker — Tori 명세 16384118 §3.3
//
// API: Google Picker JS SDK + GIS (Google Identity Services) gapi loader.
// 동작:
//   1. Picker SDK 로드 (1회)
//   2. accessToken + apiKey로 Picker 인스턴스 빌드
//   3. multiselect + folder enabled + mime type 화이트리스트
//   4. 선택 결과 → DataSourceSelection[] 변환

import { makeSelection, MAX_TOTAL_SELECTIONS, ALLOWED_MIME_TYPES } from './picker-shared';
import type { DataSourceSelection } from '@/types';

// Google Picker 글로벌 타입 — runtime-only. SDK fluent API라 chained method 시그니처를
// 정확히 잡기 어렵고, 실제 호출은 builder.set...().set...().build()로 chaining되므로
// 모든 setter 반환 타입을 self-referential로 잡는 대신 chainable proxy로 표현.
interface GooglePickerView { /* opaque */ }
interface GooglePickerBuilder {
  enableFeature(f: string): GooglePickerBuilder;
  setOAuthToken(t: string): GooglePickerBuilder;
  setDeveloperKey(k: string): GooglePickerBuilder;
  addView(v: GooglePickerView): GooglePickerBuilder;
  setMaxItems(n: number): GooglePickerBuilder;
  setCallback(cb: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface GooglePickerDocsView extends GooglePickerView {
  setIncludeFolders(b: boolean): GooglePickerDocsView;
  setSelectFolderEnabled(b: boolean): GooglePickerDocsView;
  setMimeTypes(m: string): GooglePickerDocsView;
}
interface GooglePickerNS {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new () => GooglePickerDocsView;
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}
declare global {
  interface Window {
    gapi?: { load: (api: string, cb: () => void) => void };
    google?: { picker?: GooglePickerNS };
  }
}

interface GooglePickerDoc {
  id: string;
  name: string;
  mimeType: string;
  type?: string;
  description?: string;
  sizeBytes?: number;
  parentId?: string;
}

interface GooglePickerCallbackData {
  action: string;
  docs?: GooglePickerDoc[];
}

const PICKER_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

let pickerLoadPromise: Promise<void> | null = null;

function loadPickerSDK(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoadPromise) return pickerLoadPromise;
  pickerLoadPromise = new Promise<void>((resolve, reject) => {
    // gapi script
    const existing = document.querySelector(`script[src="${PICKER_SCRIPT_SRC}"]`);
    const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
    if (!existing) {
      script.src = PICKER_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => loadPicker();
      script.onerror = () => reject(new Error('Failed to load Google Picker SDK'));
      document.head.appendChild(script);
    } else if (window.gapi) {
      loadPicker();
    } else {
      script.addEventListener('load', loadPicker);
      script.addEventListener('error', () => reject(new Error('Failed to load Google Picker SDK')));
    }
    function loadPicker() {
      if (!window.gapi) return reject(new Error('gapi missing'));
      window.gapi.load('picker', () => {
        if (window.google?.picker) resolve();
        else reject(new Error('google.picker missing after load'));
      });
    }
  });
  return pickerLoadPromise;
}

export async function openGoogleDrivePicker(opts: {
  accessToken: string;
  apiKey: string;
}): Promise<DataSourceSelection[] | null> {
  await loadPickerSDK();
  const picker = window.google!.picker!;
  return new Promise<DataSourceSelection[] | null>((resolve) => {
    const view = new picker.DocsView();
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(true);
    view.setMimeTypes(ALLOWED_MIME_TYPES.join(','));

    const builder = new picker.PickerBuilder();
    builder
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.apiKey)
      .addView(view)
      .setMaxItems(MAX_TOTAL_SELECTIONS)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const docs = data.docs ?? [];
          const selections = docs.map((d) =>
            makeSelection({
              id: d.id,
              kind: d.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
              name: d.name,
              path: d.name,
              fileCount: d.mimeType === 'application/vnd.google-apps.folder' ? undefined : 1,
              approxBytes: d.sizeBytes ? Number(d.sizeBytes) : undefined,
            })
          );
          resolve(selections);
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      });
    builder.build().setVisible(true);
  });
}
