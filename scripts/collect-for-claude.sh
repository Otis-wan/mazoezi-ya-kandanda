#!/usr/bin/env bash
# Checks the project has every file it needs, then bundles all tracked source
# into one text file you can upload for review.
#
#   bash scripts/collect-for-claude.sh            (from the project folder)
#   bash scripts/collect-for-claude.sh /path/to/project
#
# Output: claude-bundle.txt in the project folder.
# It never reads .env, keys or lock files, and it hides secret-looking values.

set -u
ROOT="${1:-.}"
cd "$ROOT" || { echo "Project folder not found: $ROOT"; exit 1; }
OUT="claude-bundle.txt"

# ---- 1. Files the project needs ------------------------------------------
missing=0
need() { [ -e "$1" ] || { echo "MISSING   $1"; missing=$((missing + 1)); }; }
need_any() { for f in "$@"; do [ -e "$f" ] && return 0; done; echo "MISSING   one of: $*"; missing=$((missing + 1)); }
warn_ignore() { git check-ignore -q "$1" 2>/dev/null || echo "NOT IGNORED by git: $1  (add it to .gitignore)"; }

echo "== Required files =="
for f in package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json \
         vitest.config.ts vitest.config.e2e.ts prisma.config.ts prisma/schema.prisma \
         prisma/migrations/migration_lock.toml prisma/data/football_drill_library.json \
         prisma/data/football_drill_library.csv .env.example .gitignore .dockerignore \
         Dockerfile .github/workflows/ci.yml README.md DEPLOY.md test-ui/index.html; do
  need "$f"
done
need_any docker-compose.yml docker-compose.yaml compose.yml compose.yaml
[ "$missing" -eq 0 ] && echo "All required files are present."

echo
echo "== Secrets must stay out of git =="
for f in .env dev-private.pem dev-private-pkcs8.pem node_modules dist claude-bundle.txt; do warn_ignore "$f"; done
git ls-files --error-unmatch .env >/dev/null 2>&1 && echo "DANGER: .env is tracked by git. Remove it: git rm --cached .env"
echo "(nothing above means all clear)"

# ---- 2. Bundle -------------------------------------------------------------
redact() {
  sed -E \
    -e 's/((SECRET|PASSWORD|TOKEN|KEY|PRIVATE)[A-Z_]*[[:space:]]*[=:][[:space:]]*).*/\1<redacted>/I' \
    -e 's#(postgres(ql)?://[^:/@ ]+:)[^@ ]+@#\1<redacted>@#g' \
    -e 's/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/<jwt-redacted>/g'
}

skip() {
  case "$1" in
    package-lock.json|*.lock|*.pem|*.key|.env|.env.*|claude-bundle.txt) [ "$1" = ".env.example" ] && return 1; return 0 ;;
    src/generated/*|node_modules/*|dist/*|coverage/*) return 0 ;;
    prisma/data/*) return 0 ;;   # the drill library is data, not code
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.zip|*.pdf) return 0 ;;
  esac
  return 1
}

{
  echo "# Project bundle"
  echo "# Made: $(date -Is)   Node: $(node -v 2>/dev/null)   npm: $(npm -v 2>/dev/null)"
  echo
  echo "## git"
  git log --oneline -5 2>/dev/null
  git status --short 2>/dev/null
  echo
  echo "## Routes"
  grep -rnE "@(Controller|Get|Post|Put|Patch|Delete)\(" src --include=*.controller.ts 2>/dev/null
  echo
  echo "## Unused code report (npm run unused)"
  if [ -x node_modules/.bin/knip ]; then npx --no-install knip 2>&1 | head -80; else echo "(knip is not installed yet)"; fi
} > "$OUT"

count=0
while IFS= read -r f; do
  skip "$f" && continue
  [ -f "$f" ] || continue
  grep -Iq . "$f" 2>/dev/null || continue     # skip binary and empty files
  {
    echo
    echo "================================================================"
    echo "FILE: $f"
    echo "================================================================"
    redact < "$f"
  } >> "$OUT"
  count=$((count + 1))
done < <({ git ls-files; git ls-files --others --exclude-standard; } | sort -u)

echo
echo "Bundled $count files into $OUT ($(wc -c < "$OUT") bytes)."
echo "Look it over for anything private, then upload it."
