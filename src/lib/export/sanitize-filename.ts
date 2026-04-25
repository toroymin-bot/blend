// 파일명 안전 처리 (Tori 명세)
// 윈도우/Mac 금지 문자 제거 + 공백→언더스코어 + 길이 제한
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200) || 'meeting';
}

export function formatDateForFilename(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
