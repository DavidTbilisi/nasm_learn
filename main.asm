section .data
    hello db 'Hello, World!', 0    ; null-terminated string
    hello_len equ $ - hello        ; length of the string

section .bss

section .text
    global _start
    extern GetStdHandle, WriteFile, ExitProcess

_start:
    ; Get the handle for stdout (STD_OUTPUT_HANDLE)
    push dword -11
    call GetStdHandle
    mov ebx, eax                   ; save the handle

    ; Write the message to stdout
    push dword 0                   ; number of bytes written (output)
    push dword hello_len           ; number of bytes to write
    push dword hello               ; message to write
    push dword ebx                 ; handle to stdout
    call WriteFile

    ; Exit the process
    push dword 0
    call ExitProcess
