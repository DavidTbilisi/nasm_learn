#!/usr/bin/env bash
# Checks each project against reference behaviour. Run via `make test`.
set -u
cd "$(dirname "$0")"
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1"; diff <(echo "$3") <(echo "$2") | head -5; fail=1; fi; }

# ── hexdump: must match `hexdump -Cv` exactly ──
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf ''                     > "$tmp/empty"
printf 'A'                    > "$tmp/one"
printf 'Hello, world!\nAB\x00\x7f\xff' > "$tmp/mixed"
head -c 4099 /dev/urandom     > "$tmp/random"
for f in empty one mixed random; do
  check "hexdump $f" "$(./hexdump "$tmp/$f")" "$(hexdump -Cv "$tmp/$f")"
done
check "hexdump binary itself" "$(./hexdump hexdump)" "$(hexdump -Cv hexdump)"
check "hexdump stdin pipe" "$(cat "$tmp/random" | ./hexdump)" "$(hexdump -Cv "$tmp/random")"
./hexdump /nonexistent 2>/dev/null; check "hexdump missing file exits 1" "$?" "1"

exit $fail
