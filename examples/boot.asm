; x86 boot sector: prints a message using the BIOS, then halts.
;
; Build & run:
;   nasm -f bin examples/boot.asm -o boot.bin
;   qemu-system-i386 -drive format=raw,file=boot.bin
;
; No OS, no libc, no syscalls. The BIOS loads these 512 bytes to
; address 0x7C00 and jumps here with the CPU in 16-bit real mode.
; Output uses BIOS video service int 0x10, AH=0x0E (teletype: print AL).

        bits    16
        org     0x7C00                  ; addresses below are relative to where the BIOS loads us

start:
        xor     ax, ax
        mov     ds, ax                  ; DS:SI must point at msg; BIOS doesn't guarantee DS=0
        mov     ss, ax
        mov     sp, 0x7C00              ; stack grows down from just below our code

        mov     si, msg
        mov     ah, 0x0E                ; BIOS teletype function
.next:
        lodsb                           ; AL = [DS:SI], SI++
        test    al, al
        jz      .halt                   ; NUL terminator: done
        int     0x10                    ; print AL
        jmp     .next

.halt:
        cli                             ; no interrupts can wake us
        hlt
        jmp     .halt                   ; in case an NMI does

msg:    db      "Hello from the boot sector!", 0

        times   510 - ($ - $$) db 0     ; pad to byte 510
        dw      0xAA55                  ; boot signature: bytes 55 AA at offset 510
