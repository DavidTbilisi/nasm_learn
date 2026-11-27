#!/usr/bin/env bash
# Checks each project against reference behaviour.
#   make test                            test the binaries in projects/
#   BIN=/path/to/dir ./test.sh           test someone else's binaries (practice/stage1 uses this)
#   ONLY=hexdump ./test.sh               test one project
set -u
cd "$(dirname "$0")"                    # data files (hello.bf, gosper.life, ...) live here
BIN=${BIN:-.}
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1"; diff <(echo "$3") <(echo "$2") | head -5; fail=1; fi; }
want()  { [ -z "${ONLY:-}" ] || [ "$ONLY" = "$1" ]; }
# x PROG ARGS...: run a project binary; the timeout stops an unfinished one from hanging the suite
x() { local p=$1; shift; timeout 20 "$BIN/$p" "$@"; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# ── hexdump: must match `hexdump -Cv` exactly ──
if want hexdump; then
printf ''                     > "$tmp/empty"
printf 'A'                    > "$tmp/one"
printf 'Hello, world!\nAB\x00\x7f\xff' > "$tmp/mixed"
head -c 4099 /dev/urandom     > "$tmp/random"
for f in empty one mixed random; do
  check "hexdump $f" "$(x hexdump "$tmp/$f")" "$(hexdump -Cv "$tmp/$f")"
done
check "hexdump binary itself" "$(x hexdump "$BIN/hexdump")" "$(hexdump -Cv "$BIN/hexdump")"
check "hexdump stdin pipe" "$(cat "$tmp/random" | x hexdump)" "$(hexdump -Cv "$tmp/random")"
x hexdump /nonexistent 2>/dev/null; check "hexdump missing file exits 1" "$?" "1"
fi

# ── brainfuck ──
if want brainfuck; then
check "bf hello world" "$(x brainfuck hello.bf)" "Hello World!"
printf ',[.[-],]' > "$tmp/cat.bf"
check "bf cat via stdin" "$(x brainfuck "$tmp/cat.bf" < hexdump.asm | md5sum)" "$(md5sum < hexdump.asm)"
printf -- '-.' > "$tmp/wrap.bf"
check "bf cell wraps 0-1=255" "$(x brainfuck "$tmp/wrap.bf" | od -An -tu1 | tr -d ' ')" "255"
printf 'comments are ignored +++[->++<]>.' > "$tmp/c.bf"
check "bf loop + comments" "$(x brainfuck "$tmp/c.bf" | od -An -tu1 | tr -d ' ')" "6"
for bad in '[' ']' '[]]' '<'; do
  printf '%s' "$bad" > "$tmp/bad.bf"
  x brainfuck "$tmp/bad.bf" 2>/dev/null; check "bf rejects '$bad'" "$?" "1"
done
head -c 70000 /dev/zero | tr '\0' '+' > "$tmp/big.bf"
x brainfuck "$tmp/big.bf" 2>/dev/null; check "bf rejects oversized program" "$?" "1"
fi

# ── life: must match the Python reference on the same torus ──
if want life; then
printf '.#\n..#\n###\n' > "$tmp/glider.life"
for n in 0 4 7360; do
  check "life glider gen $n" "$(x life "$tmp/glider.life" $n)" "$(python3 life_ref.py "$tmp/glider.life" $n)"
done
for n in 1 30 200; do
  check "life gosper gen $n" "$(x life gosper.life $n)" "$(python3 life_ref.py gosper.life $n)"
done
x life /nonexistent 1 2>/dev/null; check "life missing file exits 1" "$?" "1"
fi

# ── httpd: real HTTP over localhost ──
if want httpd; then
port=$((20000 + RANDOM % 20000))
x httpd $port > "$tmp/httpd.log" & pid=$!
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && break; sleep 0.05; done
# the probe above may have counted as visitor 1, so compare two consecutive hits
a=$(curl -s "http://127.0.0.1:$port/" | grep -o 'visitor #[0-9]*' | tr -dc 0-9)
b=$(curl -s "http://127.0.0.1:$port/" | grep -o 'visitor #[0-9]*' | tr -dc 0-9)
check "httpd counter increments" "$((${b:-0} - ${a:-0}))" "1"
check "httpd 200 status" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")" "200"
check "httpd 404 for other paths" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/favicon.ico")" "404"
for _ in 1 2 3; do  # clients that hang up without reading must not kill the server (SIGPIPE)
  exec 3<>"/dev/tcp/127.0.0.1/$port" 2>/dev/null && { printf 'GET / HTTP/1.0\r\n\r\n' >&3; exec 3>&-; }
done
check "httpd survives hung-up clients" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")" "200"
check "httpd banner" "$(cat "$tmp/httpd.log")" "listening on http://127.0.0.1:$port/"
x httpd $port 2>/dev/null; check "httpd busy port exits 1" "$?" "1"
kill $pid 2>/dev/null; wait $pid 2>/dev/null
fi

# ── snake: keys piped in (no tty), count frames until the snake hits a wall ──
# Head starts at x=15,y=8 on a 30x16 board. frames = first draw + 1 per legal move + final draw.
if want snake; then
frames() { printf '%s' "$1" | x snake | grep -o $'\e\[H' | wc -l; }
check "snake straight right hits wall" "$(frames '')" "16"     # 14 moves to x=29
check "snake 'w' turns up"             "$(frames w)" "10"      # 8 moves to y=0
check "snake U-turn 'a' is ignored"    "$(frames a)" "16"
check "snake 'wa' in one tick: no U-turn" "$(frames wa)" "10"  # 'a' reverses the last MOVE (right): ignored
check "snake q quits at once"          "$(frames q)" "1"
out=$(x snake < /dev/null)
check "snake prints GAME OVER" "$(grep -c 'GAME OVER' <<<"$out")" "1"
check "snake restores cursor" "${out: -6}" $'\e[?25h'
fi

exit $fail
