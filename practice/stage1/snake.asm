; STAGE 1 · snake                                     grade: make test ONLY=snake
; Write it from this blank file. Don't open projects/snake.asm until you pass.
;
; ── SPEC (exactly what the grader checks) ─────────────────────────────────────
;   Board: 30 x 16 cells, walls around it. Snake starts 3 cells long in row 8,
;   head at column 15 (both counted from 0), moving RIGHT. One food cell at random.
;   Every tick (100 ms):
;     1. draw a frame: it must START with ESC "[H"; draw the walls, snake, food, score
;     2. sleep 100 ms
;     3. read whatever keys were pressed (don't wait if none)
;     4. move one cell
;   Keys: w a s d, h j k l, arrows (they send ESC [ A/B/C/D: A up, B down, C right, D left)
;   A key that reverses the direction of the LAST MOVE is ignored (no U-turn into yourself).
;   q or Ctrl-C (byte 3): quit at once, without drawing another frame.
;   Head hits a wall or the snake's body: draw one final frame, print "GAME OVER\n", quit.
;   Eat food: grow by 1, score + 1, new food on a random empty cell.
;   On every exit, the LAST bytes written must be ESC "[?25h" (show the cursor again).
;   Frame count check: going straight right from column 15 = first frame + 14 moves +
;   final frame = 16 frames. Pressing w first = 1 + 8 + 1 = 10 frames.
;
; ── SYSCALLS (32-bit: eax = number, args in ebx, ecx, edx, then int 0x80) ───────
;   exit 1    read 3    write 4    ioctl 54 (fd, request, ptr)
;   nanosleep 162    getrandom 355
;   Terminal: ioctl(0, TCGETS=0x5401, &termios) reads settings, TCSETS=0x5402 writes.
;   struct termios is 36 bytes: c_lflag is the dword at offset 12, c_cc[] starts at 17,
;   c_cc[5] = VTIME, c_cc[6] = VMIN.
;   c_lflag bits: ISIG 1, ICANON 2, ECHO 8.
;
; ── HINTS (read only when stuck) ──────────────────────────────────────────────
;   1. Raw mode: save termios, clear ICANON|ECHO|ISIG, set VMIN = VTIME = 0, so read()
;      returns at once. With ISIG off, Ctrl-C arrives as byte 3 and YOU restore the
;      terminal before exiting.
;   2. The grader pipes keys in, so stdin is not a terminal and TCGETS fails. Then skip
;      raw mode and just play.
;   3. Body: a circular buffer of cell indices (head index, tail index). Plus a board
;      array (0 empty, 1 snake, 2 food) so collisions are one lookup.
;   4. Move the tail BEFORE checking for a self-hit: stepping into the cell the tail is
;      leaving is legal.
;   5. Walls with one compare: treat x as unsigned. x = -1 becomes huge, so
;      `cmp x, 30 / jae dead` catches both sides.

        global  _start
        section .text
_start:
        ; your code here

        mov     eax, 1                  ; exit(0): lets the stub build and run
        xor     ebx, ebx
        int     0x80
