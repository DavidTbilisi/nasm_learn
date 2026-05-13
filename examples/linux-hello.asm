; Linux x86-64 Hello World using raw syscalls.
;
; Build & run:
;   nasm -f elf64 examples/linux-hello.asm -o linux-hello.o
;   ld linux-hello.o -o linux-hello
;   ./linux-hello
;
; No libc — calls the kernel directly:
;   sys_write(fd=1, buf=msg, count=len)   syscall number 1
;   sys_exit(status=0)                    syscall number 60

        global  _start

        section .data
msg:    db      "Hello, world!", 10        ; 10 = newline
msglen  equ     $ - msg

        section .text
_start:
        mov     rax, 1                     ; syscall: write
        mov     rdi, 1                     ; fd: stdout
        mov     rsi, msg                   ; buf
        mov     rdx, msglen                ; count
        syscall

        mov     rax, 60                    ; syscall: exit
        xor     rdi, rdi                   ; status = 0
        syscall
