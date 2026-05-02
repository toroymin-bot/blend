#!/usr/bin/env python3
"""
Publish markdown drafts to Confluence Blend space.

Reads token from ~/.claude.json (where claude mcp add stored it).
Converts markdown → HTML → Confluence Storage Format → POST as new pages.

Usage:
  python3 publish.py                       # auto-pick newest YYYY-MM-DD-dev-log.md by mtime
  python3 publish.py 2026-05-03            # publish 2026-05-03-dev-log.md
  python3 publish.py 2026-05-03-dev-log.md # publish that file by name
  python3 publish.py file1.md file2.md     # publish multiple specific files

Title is auto-extracted from the first H1 (`# Title`) line. Filename pattern
must be `YYYY-MM-DD-dev-log.md` for safe defaults.
"""
import json
import re
import sys
from pathlib import Path
import requests
import markdown as md_lib

CLAUDE_CONFIG = Path.home() / ".claude.json"
DRAFTS_DIR = Path(__file__).parent

# From SKILL.md
SPACE_ID = "5079095"
PARENT_PAGE_ID = "9371649"

DEV_LOG_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2})-dev-log\.md$")


def load_creds():
    """Pull Atlassian creds from claude.json (env vars set during mcp add)."""
    cfg = json.loads(CLAUDE_CONFIG.read_text())
    for proj in cfg.get("projects", {}).values():
        srv = proj.get("mcpServers", {}).get("atlassian")
        if srv:
            env = srv.get("env", {})
            return {
                "url":      env["CONFLUENCE_URL"],         # https://ai4min.atlassian.net/wiki
                "username": env["CONFLUENCE_USERNAME"],
                "token":    env["CONFLUENCE_API_TOKEN"],
            }
    raise RuntimeError("Atlassian MCP creds not found in ~/.claude.json")


def md_to_storage(md_text: str) -> str:
    """Markdown → Confluence Storage Format (XHTML)."""
    html = md_lib.markdown(
        md_text,
        extensions=["tables", "fenced_code", "nl2br", "sane_lists"],
    )
    # Confluence storage format is XHTML; the markdown lib output is mostly compatible.
    # Wrap code blocks in <ac:structured-macro> for syntax highlighting (optional).
    return html


def get_existing_page(creds, title):
    """Check if a page with same title already exists under parent."""
    url = f"{creds['url']}/api/v2/pages"
    r = requests.get(
        url,
        params={"title": title, "space-id": SPACE_ID, "limit": 5},
        auth=(creds["username"], creds["token"]),
        headers={"Accept": "application/json"},
        timeout=20,
    )
    r.raise_for_status()
    results = r.json().get("results", [])
    for p in results:
        if p.get("title") == title:
            return p
    return None


def create_page(creds, title, body_storage):
    """POST a new Confluence page under PARENT_PAGE_ID."""
    url = f"{creds['url']}/api/v2/pages"
    payload = {
        "spaceId":  SPACE_ID,
        "status":   "current",
        "title":    title,
        "parentId": PARENT_PAGE_ID,
        "body": {
            "representation": "storage",
            "value":          body_storage,
        },
    }
    r = requests.post(
        url,
        json=payload,
        auth=(creds["username"], creds["token"]),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=30,
    )
    if r.status_code >= 400:
        sys.stderr.write(f"❌ {r.status_code}: {r.text[:600]}\n")
        r.raise_for_status()
    return r.json()


def update_page(creds, page, body_storage):
    """Bump version of an existing page."""
    pid = page["id"]
    current_version = page.get("version", {}).get("number", 1)
    url = f"{creds['url']}/api/v2/pages/{pid}"
    payload = {
        "id":      pid,
        "status":  "current",
        "title":   page["title"],
        "body":    {"representation": "storage", "value": body_storage},
        "version": {"number": current_version + 1, "message": "꼬미 자동 동기화"},
    }
    r = requests.put(
        url, json=payload,
        auth=(creds["username"], creds["token"]),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=30,
    )
    if r.status_code >= 400:
        sys.stderr.write(f"❌ {r.status_code}: {r.text[:600]}\n")
        r.raise_for_status()
    return r.json()


def extract_title(md_text: str, fallback: str) -> str:
    """First H1 line wins. Falls back to provided string if no H1 found."""
    for line in md_text.splitlines():
        m = re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            return m.group(1).strip()
    return fallback


def resolve_targets(args: list[str]) -> list[Path]:
    """Resolve CLI args (or auto-pick newest dev-log) into draft paths."""
    if args:
        targets: list[Path] = []
        for raw in args:
            # accept "2026-05-03" shorthand
            cand = raw if raw.endswith(".md") else f"{raw}-dev-log.md"
            p = (DRAFTS_DIR / cand).resolve()
            if not p.exists():
                sys.stderr.write(f"⚠ Missing: {p}\n")
                continue
            targets.append(p)
        return targets

    # No args → newest YYYY-MM-DD-dev-log.md by date in filename, tiebreak by mtime.
    candidates = []
    for p in DRAFTS_DIR.glob("*.md"):
        m = DEV_LOG_PATTERN.match(p.name)
        if m:
            candidates.append((m.group(1), p.stat().st_mtime, p))
    if not candidates:
        sys.stderr.write("⚠ No YYYY-MM-DD-dev-log.md drafts found.\n")
        return []
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [candidates[0][2]]


def main():
    creds = load_creds()
    print(f"Site: {creds['url']}  | User: {creds['username']}\n")

    args = sys.argv[1:]
    targets = resolve_targets(args)
    if not targets:
        sys.exit(1)

    for path in targets:
        md_text = path.read_text(encoding="utf-8")
        # date in filename → fallback "Blend 개발일지 — YYYY-MM-DD (새벽 nighttask)"
        m = DEV_LOG_PATTERN.match(path.name)
        fallback_title = (
            f"Blend 개발일지 — {m.group(1)} (새벽 nighttask)" if m else path.stem
        )
        title = extract_title(md_text, fallback_title)
        storage = md_to_storage(md_text)

        existing = get_existing_page(creds, title)
        if existing:
            print(f"↻ Updating: {title}  (id={existing['id']})")
            res = update_page(creds, existing, storage)
        else:
            print(f"+ Creating: {title}")
            res = create_page(creds, title, storage)

        webui = res.get("_links", {}).get("webui", "")
        print(f"   → {creds['url'].rsplit('/wiki', 1)[0]}/wiki{webui}\n")


if __name__ == "__main__":
    main()
