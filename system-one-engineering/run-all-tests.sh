#!/usr/bin/env bash
# Runs every project's test suite.
#
# Each project is self-contained: its modules live at the project root, so the
# tests must run from inside that directory. Running pytest from the repo root
# fails to import them, which is why this script exists.
#
# No API key is needed. Every project falls back to the offline fake.
set -uo pipefail

cd "$(dirname "$0")/projects"

total=0
failed=0

for project in p0*/; do
    printf '%-32s' "${project%/}"
    output=$(cd "$project" && python3 -m pytest -q 2>&1 | tail -1)
    echo "$output"

    if [[ "$output" == *"passed"* && "$output" != *"failed"* ]]; then
        count=$(echo "$output" | grep -oE '^[0-9]+')
        total=$((total + ${count:-0}))
    else
        failed=$((failed + 1))
    fi
done

echo
if (( failed )); then
    echo "FAILED: $failed project(s)"
    exit 1
fi
echo "All projects passing — $total tests."
