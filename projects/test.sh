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

# ── httpd: real HTTP over localhost ──
port=$((20000 + RANDOM % 20000))
./httpd $port > "$tmp/httpd.log" & pid=$!
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && break; sleep 0.05; done
# the probe above may have counted as visitor 1, so compare two consecutive hits
a=$(curl -s "http://127.0.0.1:$port/" | grep -o 'visitor #[0-9]*' | tr -dc 0-9)
b=$(curl -s "http://127.0.0.1:$port/" | grep -o 'visitor #[0-9]*' | tr -dc 0-9)
check "httpd counter increments" "$((b - a))" "1"
check "httpd 200 status" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")" "200"
check "httpd 404 for other paths" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/favicon.ico")" "404"
for _ in 1 2 3; do  # clients that hang up without reading must not kill the server (SIGPIPE)
  exec 3<>"/dev/tcp/127.0.0.1/$port"; printf 'GET / HTTP/1.0\r\n\r\n' >&3; exec 3>&-
done
check "httpd survives hung-up clients" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")" "200"
check "httpd banner" "$(cat "$tmp/httpd.log")" "listening on http://127.0.0.1:$port/"
./httpd $port 2>/dev/null; check "httpd busy port exits 1" "$?" "1"
kill $pid 2>/dev/null; wait $pid 2>/dev/null

# ── snake: keys piped in (no tty), count frames until the snake hits a wall ──
# Head starts at x=15,y=8 on a 30x16 board. frames = first draw + 1 per legal move + final draw.
frames() { printf '%s' "$1" | ./snake | grep -o $'\e\[H' | wc -l; }
check "snake straight right hits wall" "$(frames '')" "16"     # 14 moves to x=29
check "snake 'w' turns up"             "$(frames w)" "10"      # 8 moves to y=0
check "snake U-turn 'a' is ignored"    "$(frames a)" "16"
check "snake 'wa' in one tick: no U-turn" "$(frames wa)" "10"     # 'a' reverses the last MOVE (right): ignored
check "snake q quits at once"          "$(frames q)" "1"
out=$(./snake < /dev/null)
check "snake prints GAME OVER" "$(grep -c 'GAME OVER' <<<"$out")" "1"
check "snake restores cursor" "${out: -6}" $'\e[?25h'

exit $fail
