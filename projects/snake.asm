; snake — terminal Snake in pure assembly.
;
;   ./snake         move: wasd / hjkl / arrow keys     quit: q or Ctrl-C
;
; 32-bit Linux, no libc. How the terminal is tamed:
;   ioctl(TCGETS) saves the terminal settings, then TCSETS turns off
;     ICANON (wait for Enter), ECHO (print keys) and ISIG (Ctrl-C kills us),
;     with VMIN=VTIME=0 so read() returns at once even when no key was pressed.
;   On every exit path the saved settings are put back, so your shell is never left broken.
; If stdin is not a terminal (keys piped in by the tests) raw mode is skipped.

SYS_EXIT      equ 1
SYS_READ      equ 3
SYS_WRITE     equ 4
SYS_IOCTL     equ 54
SYS_NANOSLEEP equ 162
SYS_GETRANDOM equ 355

TCGETS        equ 0x5401
TCSETS        equ 0x5402
ISIG          equ 1             ; c_lflag bits
ICANON        equ 2
ECHO          equ 8
C_LFLAG       equ 12            ; offsets in the kernel's struct termios
C_CC          equ 17
VTIME         equ 5
VMIN          equ 6

W         equ 30                ; board size in cells (each cell = 2 columns on screen)
H         equ 16
N         equ W * H
START_LEN equ 3

        section .data
delay:      dd 0, 100000000     ; 100 ms per tick
cellch:     db "  []<>"         ; board value 0 empty, 1 snake, 2 food -> 2 chars each
s_init:     db 27, "[2J", 27, "[?25l"         ; clear screen, hide cursor
s_init_l    equ $ - s_init
s_score:    db "score: "
s_score_l   equ $ - s_score
s_help:     db "    wasd/hjkl/arrows  q quits", 10
s_help_l    equ $ - s_help
s_over:     db "GAME OVER", 10
s_over_l    equ $ - s_over
s_win:      db "YOU WIN", 10
s_win_l     equ $ - s_win
s_show:     db 27, "[?25h"                    ; show cursor again
s_show_l    equ $ - s_show
dirx:        dd 1                ; direction requested by keys
diry:        dd 0
movx:        dd 1                ; direction actually moved last tick
movy:        dd 0

        section .bss
saved:      resb 36             ; struct termios as it was before we started
raw:        resb 36
tty:        resb 1              ; 1 if we changed the terminal and must restore it
board:      resb N
ring:       resd N              ; snake cells, tail..head, as a circular buffer of board indices
head:       resd 1              ; ring index of the head
tail:       resd 1              ; ring index of the tail
hx:         resd 1
hy:         resd 1
score:      resd 1
rnd:        resd 1
keys:       resb 16
numbuf:     resb 12
frame:      resb 4096

        section .text
        global _start
_start:
        mov     eax, SYS_IOCTL          ; save terminal settings
        xor     ebx, ebx
        mov     ecx, TCGETS
        mov     edx, saved
        int     0x80
        test    eax, eax
        js      .no_tty                 ; not a terminal (e.g. a pipe): leave it alone
        mov     esi, saved
        mov     edi, raw
        mov     ecx, 36
        rep     movsb
        and     dword [raw+C_LFLAG], ~(ICANON | ECHO | ISIG)
        mov     byte [raw+C_CC+VTIME], 0
        mov     byte [raw+C_CC+VMIN], 0
        mov     eax, SYS_IOCTL
        xor     ebx, ebx
        mov     ecx, TCSETS
        mov     edx, raw
        int     0x80
        mov     byte [tty], 1
.no_tty:
        mov     ecx, s_init
        mov     edx, s_init_l
        call    print

        ; snake: START_LEN cells in the middle row, head at the centre, moving right
        mov     eax, (H/2)*W + W/2 - (START_LEN-1)
        xor     ecx, ecx
.seed:
        mov     [ring+ecx*4], eax
        mov     byte [board+eax], 1
        inc     eax
        inc     ecx
        cmp     ecx, START_LEN
        jb      .seed
        mov     dword [head], START_LEN-1
        mov     dword [hx], W/2
        mov     dword [hy], H/2
        call    place_food

; ── Game loop: draw, wait, read keys, move ──
tick:
        call    render
        mov     eax, SYS_NANOSLEEP
        mov     ebx, delay
        xor     ecx, ecx
        int     0x80

        mov     eax, SYS_READ           ; all keys pressed since last tick (or 0)
        xor     ebx, ebx
        mov     ecx, keys
        mov     edx, 16
        int     0x80
        mov     esi, keys
        lea     ebp, [keys+eax]         ; eax <= 0 puts the end at/before the start: loop skipped
.key:
        cmp     esi, ebp
        jae     .move
        lodsb
        cmp     al, 'q'
        je      quit
        cmp     al, 3                   ; Ctrl-C arrives as byte 3 because ISIG is off
        je      quit
        mov     ebx, 0                  ; ebx, edx = new (dirx, diry)
        mov     edx, -1
        cmp     al, 'w'
        je      .turn
        cmp     al, 'k'
        je      .turn
        cmp     al, 'A'                 ; arrow keys send ESC [ A..D; the letter is enough
        je      .turn
        mov     edx, 1
        cmp     al, 's'
        je      .turn
        cmp     al, 'j'
        je      .turn
        cmp     al, 'B'
        je      .turn
        mov     ebx, -1
        xor     edx, edx
        cmp     al, 'a'
        je      .turn
        cmp     al, 'h'
        je      .turn
        cmp     al, 'D'
        je      .turn
        mov     ebx, 1
        cmp     al, 'd'
        je      .turn
        cmp     al, 'l'
        je      .turn
        cmp     al, 'C'
        je      .turn
        jmp     .key
.turn:
        ; Reject a U-turn against the direction we last MOVED, not the last key:
        ; otherwise "up, left" inside one tick would turn the snake into its own neck.
        mov     eax, [movx]
        neg     eax
        cmp     eax, ebx
        jne     .accept
        mov     eax, [movy]
        neg     eax
        cmp     eax, edx
        je      .key
.accept:
        mov     [dirx], ebx
        mov     [diry], edx
        jmp     .key

.move:
        mov     eax, [dirx]
        mov     [movx], eax
        mov     ecx, [hx]
        add     ecx, eax                ; ecx = new x
        mov     eax, [diry]
        mov     [movy], eax
        mov     edx, [hy]
        add     edx, eax                ; edx = new y
        cmp     ecx, W                  ; unsigned: -1 looks huge, so one compare covers both walls
        jae     game_over
        cmp     edx, H
        jae     game_over
        mov     [hx], ecx
        mov     [hy], edx
        imul    edx, edx, W
        add     edx, ecx                ; edx = board index of new head
        cmp     byte [board+edx], 2
        je      .eat

        mov     eax, [tail]             ; no food: tail moves first, so chasing your tail is legal
        mov     ebx, [ring+eax*4]
        mov     byte [board+ebx], 0
        inc     eax
        cmp     eax, N
        jb      .tail_ok
        xor     eax, eax
.tail_ok:
        mov     [tail], eax
        cmp     byte [board+edx], 1
        je      game_over               ; bit yourself
        call    push_head
        jmp     tick
.eat:
        inc     dword [score]           ; grow: head moves, tail stays
        call    push_head
        cmp     dword [score], N - START_LEN
        je      win                     ; board full: nowhere left for food
        call    place_food
        jmp     tick

game_over:
        call    render
        mov     ecx, s_over
        mov     edx, s_over_l
        call    print
        jmp     quit
win:
        call    render
        mov     ecx, s_win
        mov     edx, s_win_l
        call    print
quit:
        mov     ecx, s_show
        mov     edx, s_show_l
        call    print
        cmp     byte [tty], 0
        je      .exit
        mov     eax, SYS_IOCTL          ; put the terminal back exactly as we found it
        xor     ebx, ebx
        mov     ecx, TCSETS
        mov     edx, saved
        int     0x80
.exit:
        mov     eax, SYS_EXIT
        xor     ebx, ebx
        int     0x80

; push_head: edx = board index. Marks it snake and appends it to the ring.
push_head:
        mov     byte [board+edx], 1
        mov     eax, [head]
        inc     eax
        cmp     eax, N
        jb      .ok
        xor     eax, eax
.ok:
        mov     [head], eax
        mov     [ring+eax*4], edx
        ret

; place_food: pick random cells until an empty one turns up.
place_food:
        mov     eax, SYS_GETRANDOM
        mov     ebx, rnd
        mov     ecx, 4
        xor     edx, edx
        int     0x80
        mov     eax, [rnd]
        xor     edx, edx
        mov     ecx, N
        div     ecx                     ; edx = random % N
        cmp     byte [board+edx], 0
        jne     place_food
        mov     byte [board+edx], 2
        ret

; render: redraw the whole screen from the top-left corner.
render:
        mov     edi, frame
        mov     byte [edi], 27          ; ESC [ H = cursor home
        mov     word [edi+1], '[H'
        add     edi, 3
        call    wall_row
        xor     esi, esi                ; esi = board index
        mov     ecx, H
.row:
        mov     ax, '##'
        stosw
        mov     edx, W
.cell:
        movzx   eax, byte [board+esi]
        mov     ax, [cellch+eax*2]
        stosw
        inc     esi
        dec     edx
        jnz     .cell
        mov     ax, '##'
        stosw
        mov     al, 10
        stosb
        loop    .row
        call    wall_row

        mov     esi, s_score
        mov     ecx, s_score_l
        rep     movsb
        mov     eax, [score]
        call    itoa
        mov     esi, ecx
        mov     ecx, edx
        rep     movsb
        mov     esi, s_help
        mov     ecx, s_help_l
        rep     movsb

        mov     edx, edi
        sub     edx, frame
        mov     ecx, frame
        jmp     print

wall_row:
        mov     ecx, (W+2)*2
        mov     al, '#'
        rep     stosb
        mov     al, 10
        stosb
        ret

; print: write(1, ecx, edx)
print:
        mov     eax, SYS_WRITE
        mov     ebx, 1
        int     0x80
        ret

; itoa: eax -> decimal digits in numbuf. Returns ecx = first digit, edx = length.
itoa:
        mov     ecx, numbuf + 12
        mov     ebx, 10
.div:
        xor     edx, edx
        div     ebx
        add     dl, '0'
        dec     ecx
        mov     [ecx], dl
        test    eax, eax
        jnz     .div
        mov     edx, numbuf + 12
        sub     edx, ecx
        ret
