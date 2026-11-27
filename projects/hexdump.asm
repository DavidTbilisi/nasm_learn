; hexdump — print a file as offset | hex bytes | ASCII, byte-for-byte like `hexdump -Cv`.
;
;   ./hexdump FILE        dump FILE
;   cat FILE | ./hexdump  dump stdin
;
; 32-bit Linux, no libc: every I/O is an `int 0x80` syscall.
; Output line (16 bytes per line):
;   00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a 41 42  |Hello, world!.AB|

SYS_EXIT  equ 1
SYS_READ  equ 3
SYS_WRITE equ 4
SYS_OPEN  equ 5

        section .data
hexdigits:  db "0123456789abcdef"
errmsg:     db "hexdump: cannot open file", 10
errlen      equ $ - errmsg

        section .bss
inbuf:  resb 16                 ; one line of input
line:   resb 80                 ; one line of output (78 bytes max)

        section .text
        global _start
_start:
        xor     esi, esi                ; esi = fd, default 0 (stdin)
        cmp     dword [esp], 2          ; [esp] = argc
        jl      .have_fd
        mov     eax, SYS_OPEN
        mov     ebx, [esp+8]            ; argv[1]
        xor     ecx, ecx                ; O_RDONLY
        int     0x80
        test    eax, eax
        js      .open_fail              ; negative = -errno
        mov     esi, eax
.have_fd:
        xor     ebp, ebp                ; ebp = file offset of current line

; ── Read up to 16 bytes. Loop because read() on a pipe can return fewer. ──
.next_line:
        xor     edi, edi                ; edi = bytes in inbuf
.fill:
        mov     eax, SYS_READ
        mov     ebx, esi
        lea     ecx, [inbuf+edi]
        mov     edx, 16
        sub     edx, edi
        int     0x80
        test    eax, eax
        jle     .filled                 ; 0 = EOF, <0 = error: stop reading
        add     edi, eax
        cmp     edi, 16
        jb      .fill
.filled:
        test    edi, edi
        jz      .done

; ── Build the line in `line`, ecx = write cursor ──
        mov     ecx, line
        mov     eax, ebp
        call    put_offset
        mov     word [ecx], '  '
        add     ecx, 2

        xor     edx, edx                ; edx = byte index 0..15
.hex:
        cmp     edx, edi
        jae     .pad                    ; past end of data: blanks keep the | column aligned
        movzx   eax, byte [inbuf+edx]
        mov     ebx, eax
        shr     ebx, 4                  ; high nibble
        mov     bl, [hexdigits+ebx]
        mov     [ecx], bl
        and     eax, 0xF                ; low nibble
        mov     al, [hexdigits+eax]
        mov     [ecx+1], al
        jmp     .sep
.pad:
        mov     word [ecx], '  '
.sep:
        mov     byte [ecx+2], ' '
        add     ecx, 3
        cmp     edx, 7                  ; extra gap between the two 8-byte halves
        jne     .no_gap
        mov     byte [ecx], ' '
        inc     ecx
.no_gap:
        inc     edx
        cmp     edx, 16
        jb      .hex

        mov     word [ecx], ' |'
        add     ecx, 2
        xor     edx, edx
.ascii:
        mov     al, [inbuf+edx]
        cmp     al, 0x20                ; printable is 0x20..0x7E
        jb      .dot
        cmp     al, 0x7E
        jbe     .put
.dot:
        mov     al, '.'
.put:
        mov     [ecx], al
        inc     ecx
        inc     edx
        cmp     edx, edi
        jb      .ascii
        mov     word [ecx], `|\n`
        add     ecx, 2

        call    write_line
        add     ebp, edi
        cmp     edi, 16
        je      .next_line              ; short line means EOF was hit

; ── Final line: total length, only when there was any input ──
.done:
        test    ebp, ebp
        jz      .exit
        mov     ecx, line
        mov     eax, ebp
        call    put_offset
        mov     byte [ecx], 10
        inc     ecx
        call    write_line
.exit:
        mov     eax, SYS_EXIT
        xor     ebx, ebx
        int     0x80

.open_fail:
        mov     eax, SYS_WRITE
        mov     ebx, 2                  ; stderr
        mov     ecx, errmsg
        mov     edx, errlen
        int     0x80
        mov     eax, SYS_EXIT
        mov     ebx, 1
        int     0x80

; put_offset: write EAX as 8 lowercase hex digits at [ecx], advance ecx.
; Rotating left by 4 brings the top nibble to the bottom, most significant first.
put_offset:
        mov     edx, 8
.digit:
        rol     eax, 4
        mov     ebx, eax
        and     ebx, 0xF
        mov     bl, [hexdigits+ebx]
        mov     [ecx], bl
        inc     ecx
        dec     edx
        jnz     .digit
        ret

; write_line: write(1, line, ecx - line).
write_line:
        mov     edx, ecx
        sub     edx, line
        mov     eax, SYS_WRITE
        mov     ebx, 1
        mov     ecx, line
        int     0x80
        ret
