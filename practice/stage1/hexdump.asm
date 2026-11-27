; STAGE 1 · hexdump                                   grade: make test ONLY=hexdump
; Write it from this blank file. Don't open projects/hexdump.asm until you pass.
;
; ── SPEC (exactly what the grader checks) ─────────────────────────────────────
;   ./hexdump FILE          dump FILE
;   cat FILE | ./hexdump    no argument: dump stdin
;   Output must be byte-for-byte identical to `hexdump -Cv FILE`. Compare while you work:
;       diff <(./hexdump x) <(hexdump -Cv x)
;   Format, 16 bytes per line:
;       00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a 41 42  |Hello, world!.AB|
;       00000010  00 7f ff                                          |...|
;       00000013
;     - offset: 8 lowercase hex digits, then 2 spaces
;     - each byte: 2 lowercase hex digits + 1 space; one extra space after the 8th byte
;     - a short last line is padded with spaces so the | column lines up
;     - ASCII column: bytes 0x20..0x7E as-is, everything else '.'
;     - final line: total byte count as 8 hex digits. Empty input prints NOTHING.
;   File can't be opened -> message on stderr (fd 2), exit code 1.
;
; ── SYSCALLS (32-bit: eax = number, args in ebx, ecx, edx, then int 0x80) ───────
;   exit 1 (status)    read 3 (fd, buf, len)    write 4 (fd, buf, len)    open 5 (path, flags=0)
;   At _start: [esp] = argc, [esp+4] = argv[0], [esp+8] = argv[1]
;   A failed syscall returns a NEGATIVE number in eax.
;
; ── HINTS (read only when stuck) ──────────────────────────────────────────────
;   1. A table `db "0123456789abcdef"` turns a nibble (0..15) into its character.
;   2. High nibble: shr 4. Low nibble: and 0xF.
;   3. read() on a pipe can return fewer bytes than you asked for. Loop until you have
;      16 bytes or read returns 0 (EOF).
;   4. Build each whole line in a buffer, then one write() per line.
;   5. `rol eax, 4` brings the top nibble to the bottom: 8 rotations = 8 digits, in order.

        global  _start
        section .text
_start:
        ; your code here

        mov     eax, 1                  ; exit(0): lets the stub build and run
        xor     ebx, ebx
        int     0x80
