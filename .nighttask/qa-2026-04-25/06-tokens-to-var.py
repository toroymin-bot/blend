"""
Convert all D1 component static `const tokens = { bg: '#fafaf9', ... }` to CSS var() refs.
This makes them respond to data-theme changes (light/dark) without hook plumbing.
"""
import re
import os
from pathlib import Path

ROOT = Path('/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/Blend')

D1_FILES = [
    'src/components/app-content-design1.tsx',
    'src/modules/chat/chat-view-design1.tsx',
    'src/modules/compare/compare-view-design1.tsx',
    'src/modules/billing/billing-view-design1.tsx',
    'src/modules/documents/documents-view-design1.tsx',
    'src/modules/models/models-view-design1.tsx',
    'src/modules/dashboard/dashboard-view-design1.tsx',
    'src/modules/agents/agents-view-design1.tsx',
    'src/modules/meeting/meeting-view-design1.tsx',
    'src/modules/datasources/datasources-view-design1.tsx',
    'src/modules/cost-savings/cost-savings-view-design1.tsx',
    'src/modules/security/security-view-design1.tsx',
    'src/modules/about/about-view-design1.tsx',
]

# Map raw color values to CSS variables
COLOR_TO_VAR = {
    "'#fafaf9'":                                  "'var(--d1-bg)'",
    "'#ffffff'":                                  "'var(--d1-surface)'",
    "'#f6f5f3'":                                  "'var(--d1-surface-alt)'",
    "'#0a0a0a'":                                  "'var(--d1-text)'",
    "'#6b6862'":                                  "'var(--d1-text-dim)'",
    "'#a8a49b'":                                  "'var(--d1-text-faint)'",
    "'#c65a3c'":                                  "'var(--d1-accent)'",
    "'rgba(198, 90, 60, 0.08)'":                  "'var(--d1-accent-soft)'",
    "'rgba(198, 90, 60, 0.10)'":                  "'var(--d1-accent-soft)'",
    "'rgba(10, 10, 10, 0.06)'":                   "'var(--d1-border)'",
    "'rgba(10, 10, 10, 0.10)'":                   "'var(--d1-border-mid)'",
    "'rgba(10, 10, 10, 0.12)'":                   "'var(--d1-border-strong)'",
    "'#c44'":                                     "'var(--d1-danger)'",
    "'#10a37f'":                                  "'var(--d1-success)'",
}

stats = {'files_changed': 0, 'replacements': 0}

for relpath in D1_FILES:
    fpath = ROOT / relpath
    if not fpath.exists():
        print(f'  SKIP (not found): {relpath}')
        continue

    text = fpath.read_text(encoding='utf-8')
    original = text
    file_repl = 0

    # Find the tokens object declaration only (avoid touching other usages)
    # Match: const tokens = { ... } as const;
    m = re.search(r"(const tokens\s*=\s*\{)([\s\S]*?)(\}\s*as const;)", text)
    if not m:
        print(f'  SKIP (no tokens block): {relpath}')
        continue

    block_pre, block_body, block_post = m.group(1), m.group(2), m.group(3)
    new_body = block_body
    for raw, repl in COLOR_TO_VAR.items():
        if raw in new_body:
            count = new_body.count(raw)
            new_body = new_body.replace(raw, repl)
            file_repl += count

    if file_repl > 0:
        new_block = block_pre + new_body + block_post
        text = text[:m.start()] + new_block + text[m.end():]
        fpath.write_text(text, encoding='utf-8')
        stats['files_changed'] += 1
        stats['replacements'] += file_repl
        print(f'  ✓ {relpath} ({file_repl} repl)')
    else:
        print(f'  - {relpath} (no matches)')

print()
print(f"Files changed: {stats['files_changed']}")
print(f"Total replacements: {stats['replacements']}")
