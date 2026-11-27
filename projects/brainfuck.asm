; brainfuck — run a Brainfuck program on a 30,000-cell tape.
;
;   ./brainfuck hello.bf
;   echo hi | ./brainfuck cat.bf      (`,` reads stdin; EOF leaves the cell unchanged)
;
; 32-bit Linux, no libc. Two passes:
;   1. Match every [ with its ] using the CPU stack, store both directions in `jumps`.
;   2. Run: fetch one byte, jump through `optable` (256 entries, one per byte value).

SYS_EXIT  equ 1
SYS_READ  equ 3
SYS_WRITE equ 4
SYS_OPEN  equ 5

PROG_MAX  equ 65535
TAPE_SIZE equ 30000

        section .data
; Jump table built at assemble time: entry N = handler for byte value N.
optable:
%assign c 0
%rep 256
  %if c = 0
        dd op_end               ; NUL terminator after the program
  %elif c = '+'
        dd op_inc
  %elif c = '-'
        dd op_dec
  %elif c = '>'
        dd op_right
  %elif c = '<'
        dd op_left
  %elif c = '.'
        dd op_out
  %elif c = ','
        dd op_in
  %elif c = '['
        dd op_open
  %elif c = ']'
        dd op_close
  %else
        dd op_next              ; any other byte is a comment
  %endif
  %assign c c+1
%endrep

e_usage:    db "usage: brainfuck FILE.bf", 10
e_usage_l   equ $ - e_usage
e_open:     db "brainfuck: cannot open file", 10
e_open_l    equ $ - e_open
e_big:      db "brainfuck: program too large", 10
e_big_l     equ $ - e_big
e_match:    db "brainfuck: unmatched bracket", 10
e_match_l   equ $ - e_match
e_tape:     db "brainfuck: pointer left the tape", 10
e_tape_l    equ $ - e_tape

        section .bss
prog:   resb PROG_MAX + 1       ; +1 keeps a NUL after the longest program
jumps:  resd PROG_MAX           ; jumps[i] = index of the bracket matching prog[i]
tape:   resb TAPE_SIZE

        section .text
        global _start
_start:
        cmp     dword [esp], 2
        jl      err_usage
        mov     eax, SYS_OPEN
        mov     ebx, [esp+8]            ; argv[1]
        xor     ecx, ecx                ; O_RDONLY
        int     0x80
        test    eax, eax
        js      err_open
        mov     ebx, eax                ; ebx = fd

; ── Load the whole file into prog ──
        xor     esi, esi                ; esi = bytes loaded
.load:
        mov     eax, SYS_READ
        lea     ecx, [prog+esi]
        mov     edx, PROG_MAX + 1
        sub     edx, esi                ; ask for one byte more than allowed to detect "too large"
        jz      err_big
        int     0x80
        test    eax, eax
        jle     .loaded
        add     esi, eax
        jmp     .load
.loaded:
        cmp     esi, PROG_MAX
        ja      err_big

; ── Pass 1: bracket matching ──
        mov     ebp, esp                ; stack depth marker: esp back here = no open [
        xor     ecx, ecx                ; ecx = index
.scan:
        mov     al, [prog+ecx]
        test    al, al
        jz      .scanned
        cmp     al, '['
        jne     .not_open
        push    ecx
        jmp     .scan_next
.not_open:
        cmp     al, ']'
        jne     .scan_next
        cmp     esp, ebp
        je      err_match               ; ] with nothing open
        pop     edx                     ; edx = index of matching [
        mov     [jumps+edx*4], ecx
        mov     [jumps+ecx*4], edx
.scan_next:
        inc     ecx
        jmp     .scan
.scanned:
        cmp     esp, ebp
        jne     err_match               ; [ never closed

; ── Pass 2: interpret.  esi = instruction pointer, edi = data pointer ──
        mov     esi, prog
        mov     edi, tape
run:
        movzx   eax, byte [esi]
        jmp     [optable+eax*4]

op_inc:  inc    byte [edi]
         jmp    op_next
op_dec:  dec    byte [edi]              ; 0 - 1 wraps to 255
         jmp    op_next
op_right:
        inc     edi
        cmp     edi, tape + TAPE_SIZE
        jae     err_tape
        jmp     op_next
op_left:
        dec     edi
        cmp     edi, tape
        jb      err_tape
        jmp     op_next
op_out:
        mov     eax, SYS_WRITE
        mov     ebx, 1
        mov     ecx, edi
        mov     edx, 1
        int     0x80
        jmp     op_next
op_in:
        mov     eax, SYS_READ
        xor     ebx, ebx
        mov     ecx, edi
        mov     edx, 1
        int     0x80                    ; returns 0 at EOF and writes nothing
        jmp     op_next
op_open:
        cmp     byte [edi], 0
        jne     op_next
        jmp     op_jump                 ; cell is 0: skip past the matching ]
op_close:
        cmp     byte [edi], 0
        je      op_next                 ; cell is nonzero: back to the matching [
op_jump:
        mov     eax, esi
        sub     eax, prog
        mov     eax, [jumps+eax*4]
        lea     esi, [prog+eax]
op_next:
        inc     esi
        jmp     run

op_end:
        mov     eax, SYS_EXIT
        xor     ebx, ebx
        int     0x80

; ── Errors: print to stderr, exit 1 ──
err_usage: mov ecx, e_usage
           mov edx, e_usage_l
           jmp die
err_open:  mov ecx, e_open
           mov edx, e_open_l
           jmp die
err_big:   mov ecx, e_big
           mov edx, e_big_l
           jmp die
err_match: mov ecx, e_match
           mov edx, e_match_l
           jmp die
err_tape:  mov ecx, e_tape
           mov edx, e_tape_l
die:
        mov     eax, SYS_WRITE
        mov     ebx, 2
        int     0x80
        mov     eax, SYS_EXIT
        mov     ebx, 1
        int     0x80
