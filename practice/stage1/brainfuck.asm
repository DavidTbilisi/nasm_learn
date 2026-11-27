; STAGE 1 · brainfuck                                 grade: make test ONLY=brainfuck
; Write it from this blank file. Don't open projects/brainfuck.asm until you pass.
;
; ── SPEC (exactly what the grader checks) ─────────────────────────────────────
;   ./brainfuck FILE.bf     run the program; try ../../projects/hello.bf
;   Machine: 30,000 cells of 1 byte, all 0, pointer starts at cell 0.
;       +  cell += 1 (255 + 1 wraps to 0)       -  cell -= 1 (0 - 1 wraps to 255)
;       >  pointer += 1                         <  pointer -= 1
;       .  write the cell's byte to stdout      ,  read 1 byte from stdin into the cell;
;                                                  at EOF leave the cell UNCHANGED
;       [  if cell == 0, jump past the matching ]
;       ]  if cell != 0, jump back to the matching [
;       any other byte: comment, ignore it
;   Exit code 1 (and a message on stderr) when:
;     - no argument, or the file can't be opened
;     - the program is longer than 65,535 bytes
;     - a [ or ] has no partner (check this BEFORE running anything)
;     - the pointer moves left of cell 0 or right of cell 29,999
;
; ── SYSCALLS (32-bit: eax = number, args in ebx, ecx, edx, then int 0x80) ───────
;   exit 1    read 3 (fd, buf, len)    write 4 (fd, buf, len)    open 5 (path, flags=0)
;
; ── HINTS (read only when stuck) ──────────────────────────────────────────────
;   1. Two passes. Pass 1 matches brackets, pass 2 runs.
;   2. Matching: scan the program; on [ push its index, on ] pop. Popping from an empty
;      stack = unmatched ]. Anything left on the stack at the end = unmatched [.
;      The CPU stack works: remember esp before you start.
;   3. Store matches in a table: jumps[i] = index of the partner of bracket i.
;   4. Dispatch without a chain of cmp/je: a 256-entry table of handler addresses,
;      then `jmp [table + eax*4]`. NASM's %rep / %assign / %if can build it.
;   5. Read the file with a loop of read() calls: one call may not return all of it.

        global  _start
        section .text
_start:
        ; your code here

        mov     eax, 1                  ; exit(0): lets the stub build and run
        xor     ebx, ebx
        int     0x80
