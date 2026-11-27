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

# ── brainfuck ──
check "bf hello world" "$(./brainfuck hello.bf)" "Hello World!"
printf ',[.[-],]' > "$tmp/cat.bf"
check "bf cat via stdin" "$(./brainfuck "$tmp/cat.bf" < hexdump.asm | md5sum)" "$(md5sum < hexdump.asm)"
printf -- '-.' > "$tmp/wrap.bf"
check "bf cell wraps 0-1=255" "$(./brainfuck "$tmp/wrap.bf" | od -An -tu1 | tr -d ' ')" "255"
printf 'comments are ignored +++[->++<]>.' > "$tmp/c.bf"
check "bf loop + comments" "$(./brainfuck "$tmp/c.bf" | od -An -tu1 | tr -d ' ')" "6"
for bad in '[' ']' '[]]' '<'; do
  printf '%s' "$bad" > "$tmp/bad.bf"
  ./brainfuck "$tmp/bad.bf" 2>/dev/null; check "bf rejects '$bad'" "$?" "1"
done
head -c 70000 /dev/zero | tr '\0' '+' > "$tmp/big.bf"
./brainfuck "$tmp/big.bf" 2>/dev/null; check "bf rejects oversized program" "$?" "1"

# ── life: must match the Python reference on the same torus ──
printf '.#\n..#\n###\n' > "$tmp/glider.life"
for case in "glider.life 0" "glider.life 4" "glider.life 7360"; do
  set -- $case
  check "life $1 gen $2" "$(./life "$tmp/$1" "$2")" "$(python3 life_ref.py "$tmp/$1" "$2")"
done
for n in 1 30 200; do
  check "life gosper gen $n" "$(./life gosper.life $n)" "$(python3 life_ref.py gosper.life $n)"
done
./life /nonexistent 1 2>/dev/null; check "life missing file exits 1" "$?" "1"

exit $fail
