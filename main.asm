section .data
    hello db 'Hello, World!', 0    ; null-terminated string
    hello_len equ $ - hello - 1    ; length without the trailing NUL

section .bss
    written resd 1                 ; WriteFile stores the byte count here

section .text
    global _start
    extern GetStdHandle, WriteFile, ExitProcess
    extern GetProcessHeap, HeapAlloc, HeapFree

_start:
    ; Get the handle for stdout (STD_OUTPUT_HANDLE)
    push dword -11
    call GetStdHandle
    mov ebx, eax                   ; save the handle

    ; Write the message to stdout
    push dword 0                   ; lpOverlapped = NULL (5th arg, pushed first)
    push dword written             ; &bytes written (must be non-NULL when lpOverlapped is NULL)
    push dword hello_len           ; number of bytes to write
    push dword hello               ; message to write
    push dword ebx                 ; handle to stdout
    call WriteFile

    ; Heap: no CPU support, just ask the OS allocator for a pointer
    call GetProcessHeap            ; eax = handle to this process's heap
    mov esi, eax                   ; keep the heap handle

    push dword 64                  ; bytes wanted
    push dword 0                   ; flags
    push esi                       ; heap handle
    call HeapAlloc                 ; eax = pointer to 64 heap bytes (0 on failure)
    test eax, eax
    jz .exit                       ; allocation failed, nothing to use or free
    mov edi, eax

    mov dword [edi], 42            ; heap memory is used like any other memory
    mov dword [edi+4], 99

    push edi                       ; pointer to free
    push dword 0                   ; flags
    push esi                       ; heap handle
    call HeapFree

.exit:
    ; Exit the process
    push dword 0
    call ExitProcess
