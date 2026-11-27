; life — Conway's Game of Life on a wrapping 80x23 grid, animated in the terminal.
;
;   ./life                  random start, animate (Ctrl-C to quit)
;   ./life gosper.life      start from a pattern file, animate
;   ./life gosper.life 100  print generation 100 once, no animation (used by tests)
;
; Pattern file: one line per row, '#' or 'O' = alive, anything else = dead.
;
; Two tricks keep the inner loop tiny:
;   1. The grid has a 1-cell border that mirrors the opposite edge (`wrap`), so the
;      8 neighbours of any cell are always at fixed offsets — no edge checks.
;   2. Next state = ((neighbours | self) == 3). That covers both
;      "dead + 3 neighbours = born" and "alive + 2 or 3 neighbours = survives".

SYS_EXIT      equ 1
SYS_READ      equ 3
SYS_WRITE     equ 4
SYS_OPEN      equ 5
SYS_NANOSLEEP equ 162
SYS_GETRANDOM equ 355

W     equ 80                    ; visible columns
H     equ 23                    ; visible rows (fits a 24-line terminal)
W2    equ W + 2                 ; row stride including border cells
CELLS equ W2 * (H + 2)

        section .data
limit:      dd -1               ; generations to run; -1 = animate forever
delay:      dd 0, 80000000      ; timespec {sec, nsec}: 80 ms per frame
clear:      db 27, "[2J"
clear_l     equ $ - clear
e_open:     db "life: cannot open pattern file", 10
e_open_l    equ $ - e_open

        section .bss
cur:        resb CELLS          ; 1 = alive, 0 = dead
nxt:        resb CELLS
filebuf:    resb 4096
frame:      resb 3 + H * (W + 1)

        section .text
        global _start
_start:
        mov     eax, [esp]              ; argc
        cmp     eax, 3
        jl      .no_count
        mov     esi, [esp+12]           ; argv[2]: decimal generation count
        call    atoi
        mov     [limit], eax
.no_count:
        cmp     dword [esp], 2
        jl      .random
        mov     ebx, [esp+8]            ; argv[1]: pattern file
        call    load_pattern
        jmp     .start

.random:
        mov     eax, SYS_GETRANDOM
        mov     ebx, cur
        mov     ecx, CELLS
        xor     edx, edx
        int     0x80
        mov     esi, cur                ; random byte -> alive with 1/4 chance
        mov     ecx, CELLS
.norm:
        test    byte [esi], 3
        setz    byte [esi]
        inc     esi
        loop    .norm

.start:
        cmp     dword [limit], -1
        jne     .gen
        mov     eax, SYS_WRITE          ; animation: clear the screen once
        mov     ebx, 1
        mov     ecx, clear
        mov     edx, clear_l
        int     0x80

; ── Main loop ──
.gen:
        mov     eax, [limit]
        cmp     eax, -1
        jne     .counted
        call    render
        mov     eax, SYS_NANOSLEEP
        mov     ebx, delay
        xor     ecx, ecx
        int     0x80
        jmp     .advance
.counted:
        test    eax, eax
        jz      .final
        dec     dword [limit]
.advance:
        call    wrap
        call    step
        mov     esi, nxt                ; cur = nxt
        mov     edi, cur
        mov     ecx, CELLS
        rep     movsb
        jmp     .gen
.final:
        call    render
        mov     eax, SYS_EXIT
        xor     ebx, ebx
        int     0x80

; ── wrap: copy opposite edges into the border ──
; Columns first (rows 1..H), then whole rows — that also fills the 4 corners.
wrap:
        mov     esi, cur + W2           ; start of row 1
        mov     ecx, H
.col:
        mov     al, [esi+W]             ; left border  = last visible column
        mov     [esi], al
        mov     al, [esi+1]             ; right border = first visible column
        mov     [esi+W+1], al
        add     esi, W2
        loop    .col
        mov     esi, cur + H*W2         ; top border row = row H
        mov     edi, cur
        mov     ecx, W2
        rep     movsb
        mov     esi, cur + W2           ; bottom border row = row 1
        mov     edi, cur + (H+1)*W2
        mov     ecx, W2
        rep     movsb
        ret

; ── step: compute nxt from cur ──
step:
        mov     esi, cur + W2 + 1       ; first visible cell
        mov     edi, nxt + W2 + 1
        mov     ecx, H
.row:
        mov     edx, W
.cell:
        mov     al, [esi-W2-1]          ; sum the 8 neighbours
        add     al, [esi-W2]
        add     al, [esi-W2+1]
        add     al, [esi-1]
        add     al, [esi+1]
        add     al, [esi+W2-1]
        add     al, [esi+W2]
        add     al, [esi+W2+1]
        or      al, [esi]               ; (sum | self) == 3  <=>  next state alive
        cmp     al, 3
        sete    [edi]
        inc     esi
        inc     edi
        dec     edx
        jnz     .cell
        add     esi, 2                  ; skip right border + next row's left border
        add     edi, 2
        dec     ecx
        jnz     .row
        ret

; ── render: draw the visible grid, '#' alive, ' ' dead ──
render:
        mov     edi, frame
        cmp     dword [limit], -1
        jne     .body
        mov     byte [edi], 27          ; ESC [ H = cursor to top-left, redraw in place
        mov     word [edi+1], '[H'
        add     edi, 3
.body:
        mov     esi, cur + W2 + 1
        mov     ecx, H
.r:
        mov     edx, W
.c:
        lodsb
        test    al, al
        mov     al, ' '                 ; MOV doesn't touch flags: test result survives
        jz      .put
        mov     al, '#'
.put:
        stosb
        dec     edx
        jnz     .c
        mov     al, 10
        stosb
        add     esi, 2
        loop    .r
        mov     edx, edi
        sub     edx, frame
        mov     eax, SYS_WRITE
        mov     ebx, 1
        mov     ecx, frame
        int     0x80
        ret

; ── load_pattern: ebx = path. Pattern lands at the top-left; extra rows/cols are cut. ──
load_pattern:
        mov     eax, SYS_OPEN
        xor     ecx, ecx
        int     0x80
        test    eax, eax
        js      .fail
        mov     ebx, eax
        mov     eax, SYS_READ           ; shortcut: reads one 4 KB chunk, plenty for hand-made patterns
        mov     ecx, filebuf
        mov     edx, 4096
        int     0x80
        test    eax, eax
        jle     .done
        mov     esi, filebuf
        lea     ebp, [filebuf+eax]      ; ebp = end of data
        mov     edi, cur + W2 + 1       ; edi = start of current row
        xor     edx, edx                ; edx = column
        xor     ebx, ebx                ; ebx = row
.ch:
        cmp     esi, ebp
        jae     .done
        lodsb
        cmp     al, 10
        jne     .not_nl
        inc     ebx
        cmp     ebx, H
        jae     .done
        add     edi, W2
        xor     edx, edx
        jmp     .ch
.not_nl:
        cmp     edx, W
        jae     .ch                     ; beyond the right edge: ignore
        cmp     al, '#'
        je      .alive
        cmp     al, 'O'
        jne     .next
.alive:
        mov     byte [edi+edx], 1
.next:
        inc     edx
        jmp     .ch
.done:
        ret
.fail:
        mov     eax, SYS_WRITE
        mov     ebx, 2
        mov     ecx, e_open
        mov     edx, e_open_l
        int     0x80
        mov     eax, SYS_EXIT
        mov     ebx, 1
        int     0x80

; ── atoi: esi = decimal string -> eax. Stops at the first non-digit. ──
atoi:
        xor     eax, eax
.d:
        movzx   edx, byte [esi]
        sub     edx, '0'
        cmp     edx, 9
        ja      .end                    ; unsigned compare also rejects bytes below '0'
        imul    eax, 10
        add     eax, edx
        inc     esi
        jmp     .d
.end:
        ret
