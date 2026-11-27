; STAGE 1 · life                                      grade: make test ONLY=life
; Write it from this blank file. Don't open projects/life.asm until you pass.
;
; ── SPEC (exactly what the grader checks) ─────────────────────────────────────
;   Grid: 80 columns x 23 rows. It WRAPS: the left neighbour of column 0 is column 79,
;   the row above row 0 is row 22 (a torus).
;   Rules each generation: a dead cell with exactly 3 live neighbours is born;
;   a live cell with 2 or 3 live neighbours survives; everything else is dead.
;
;   ./life FILE N    load FILE, run N generations, print the grid ONCE and exit.
;                    (this is the mode the grader uses)
;   ./life FILE      load FILE, animate forever          (not graded: make it look nice)
;   ./life           random start, animate forever       (not graded)
;
;   Pattern file: line = row, '#' or 'O' = alive, any other char = dead. The pattern
;   starts at the top-left; columns past 80 and rows past 23 are ignored.
;   Try ../../projects/gosper.life.
;
;   Printed grid (N mode): exactly 23 lines, each exactly 80 chars + '\n',
;   '#' = alive, ' ' = dead. Nothing else on stdout.
;   The grader compares you against ../../projects/life_ref.py:
;       diff <(./life g.life 30) <(python3 ../../projects/life_ref.py g.life 30)
;   FILE can't be opened -> exit code 1.
;
; ── SYSCALLS (32-bit: eax = number, args in ebx, ecx, edx, then int 0x80) ───────
;   exit 1    read 3    write 4    open 5
;   nanosleep 162 (ebx = pointer to {dd seconds, dd nanoseconds}, ecx = 0)
;   getrandom 355 (ebx = buf, ecx = len, edx = 0)
;   Animation: print ESC "[2J" once (clear), then ESC "[H" (cursor home) before each frame.
;
; ── HINTS (read only when stuck) ──────────────────────────────────────────────
;   1. N arrives as text ("30"). Convert: result = result*10 + (char - '0').
;   2. Compute the next generation into a SECOND grid, then copy it back. Updating in
;      place corrupts neighbours you haven't visited yet.
;   3. Wrapping without edge checks: give the grid a 1-cell border (82 x 25) and copy the
;      opposite edges into it before each step. Then every neighbour is a fixed offset.
;   4. One compare for both rules: next = ((neighbours | self) == 3). Check why it works.

        global  _start
        section .text
_start:
        ; your code here

        mov     eax, 1                  ; exit(0): lets the stub build and run
        xor     ebx, ebx
        int     0x80
