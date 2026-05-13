; macOS x86-64 Hello World using raw BSD syscalls.
;
; Build & run (macOS x86-64, requires Xcode CLT for `ld`):
;   nasm -f macho64 examples/macos-hello.asm -o macos-hello.o
;   ld -macos_version_min 10.13 -lSystem -o macos-hello macos-hello.o
;   ./macos-hello
;
; On macOS the syscall number is OR'd with the BSD class 0x2000000.
;   sys_write = 0x2000004
;   sys_exit  = 0x2000001

        global  _main

        section .data
msg:    db      "Hello, world!", 10
msglen  equ     $ - msg

        section .text
_main:
        mov     rax, 0x2000004             ; syscall: write
        mov     rdi, 1                     ; fd: stdout
        lea     rsi, [rel msg]             ; PIC-friendly load
        mov     rdx, msglen
        syscall

        mov     rax, 0x2000001             ; syscall: exit
        xor     rdi, rdi
        syscall
