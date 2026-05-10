'use strict';

const LESSONS = [
  {
    id: 1,
    title: 'Registers & Data Types',
    intro: `Registers are the CPU's fastest storage — tiny slots built directly into the processor. x86 has eight 32-bit general-purpose registers. Each holds a 32-bit (4-byte) unsigned integer, but you can also address their lower halves.`,
    concepts: [
      { name: 'EAX / EBX / ECX / EDX', desc: 'Accumulator, Base, Counter, Data — the four primary 32-bit registers.' },
      { name: 'ESI / EDI', desc: 'Source Index and Destination Index — often used for string/array operations.' },
      { name: 'Sub-registers', desc: 'AX = lower 16 bits of EAX.  AL = lower 8 bits.  AH = bits 8–15.' },
      { name: 'MOV dst, src', desc: 'Copy a value into a register or memory location. The destination is always first.' },
    ],
    diagram: `
  EAX (32 bits)
  ┌────────────────┬────────┬────────┐
  │   (high 16)    │   AH   │   AL   │
  │                │ 8 bits │ 8 bits │
  └────────────────┴────────┴────────┘
                   ◄── AX (16 bits) ──►
  ◄───────────── EAX (32 bits) ───────►`,
    code: `section .text
global _start

_start:
    mov eax, 42        ; EAX = 42
    mov ebx, eax       ; EBX = copy of EAX = 42
    mov ecx, 0xFF      ; ECX = 255  (hex literal)
    mov al,  0xAB      ; AL  = 0xAB (low byte of EAX)
    mov ah,  0x01      ; AH  = 0x01 (high byte of AX)
    ; EAX is now 0x000001AB
    mov edx, -1        ; EDX = 0xFFFFFFFF (all bits set)
    xor esi, esi       ; ESI = 0  (XOR with self clears a register)
    hlt`,
    exercise: {
      prompt: 'Modify the code so that EBX ends up holding the value 100 and ECX ends up holding 200. Then set EDX to the sum of EBX and ECX using ADD.',
      hint: 'Use MOV to load the constants, then ADD edx, ecx after setting both.',
    },
  },

  {
    id: 2,
    title: 'Arithmetic & Flags',
    intro: `Every arithmetic instruction silently updates the EFLAGS register. Four flags matter most: ZF (result was zero), SF (result was negative), CF (unsigned overflow/borrow), and OF (signed overflow). Conditional jumps read these flags.`,
    concepts: [
      { name: 'ADD / SUB', desc: 'Addition and subtraction. Both update all four flags.' },
      { name: 'INC / DEC', desc: 'Increment or decrement by 1. Updates ZF/SF/OF but NOT CF — important difference from ADD.' },
      { name: 'MUL reg', desc: 'Unsigned multiply: EAX × reg → EDX:EAX (64-bit result split across two registers).' },
      { name: 'XOR reg, reg', desc: 'Idiomatic zero-a-register trick. Smaller encoding than MOV reg, 0.' },
      { name: 'NEG reg', desc: 'Two\'s-complement negation: reg = 0 - reg.' },
    ],
    diagram: `
  EFLAGS (selected bits)
  ┌────┬────┬────┬────┐
  │ OF │ SF │ ZF │ CF │
  └────┴────┴────┴────┘
    │    │    │    └─ Carry / unsigned borrow
    │    │    └───── Zero (result == 0)
    │    └────────── Sign  (result < 0 in signed view)
    └─────────────── Overflow (signed result out of range)`,
    code: `section .text
global _start

_start:
    mov eax, 10
    mov ebx, 20
    add eax, ebx   ; EAX = 30  → ZF=0  SF=0
    sub eax, 5     ; EAX = 25
    inc eax        ; EAX = 26
    dec ebx        ; EBX = 19

    ; MUL example: 6 × 7
    mov eax, 6
    mov ecx, 7
    mul ecx        ; EAX = 42, EDX = 0

    ; Overflow: biggest uint32 + 1
    mov eax, 0xFFFFFFFF
    add eax, 1     ; EAX = 0, CF=1 (carry out)

    xor eax, eax   ; clear EAX (ZF=1 after this)
    hlt`,
    exercise: {
      prompt: 'Write code that computes 3 × (10 + 5) and leaves the final product in EAX. Use ADD for the sum and MUL for the product.',
      hint: 'ADD eax, 5 first (after setting EAX=10), then MOV ecx, 3 and MUL ecx.',
    },
  },

  {
    id: 3,
    title: 'Control Flow',
    intro: `Assembly has no if/while keywords — control flow is built from comparisons that set flags, followed by conditional jumps that read them. The LOOP instruction combines ECX decrement + branch into one opcode.`,
    concepts: [
      { name: 'CMP a, b', desc: 'Computes a−b and sets flags, but discards the result. Only the flags matter.' },
      { name: 'JMP label', desc: 'Unconditional jump to a label.' },
      { name: 'JE / JNE', desc: 'Jump if Equal (ZF=1) / Jump if Not Equal (ZF=0).' },
      { name: 'JG / JL / JGE / JLE', desc: 'Signed comparisons (Greater, Less). Use JA/JB for unsigned.' },
      { name: 'LOOP label', desc: 'Decrements ECX; jumps to label if ECX ≠ 0. Classic counted loop.' },
    ],
    diagram: `
  Typical if/else pattern          Counted loop pattern
  ──────────────────────           ──────────────────────
      cmp eax, 10                      mov ecx, 5
      jl  less_branch              top:
      ; "else" body                    ; loop body
      jmp done                         loop top
  less_branch:                     ; ecx == 0 here
      ; "if" body
  done:`,
    code: `section .text
global _start

_start:
    ; Sum 1+2+3+4+5 using LOOP
    mov ecx, 5     ; loop counter
    mov eax, 0     ; accumulator

sum_loop:
    add eax, ecx   ; EAX += ECX
    loop sum_loop  ; ECX--, jump if ECX != 0
    ; EAX = 15

    ; Signed comparison
    mov ebx, 7
    cmp ebx, 10
    jl  is_less    ; jump if EBX < 10
    mov edx, 0     ; EDX = 0  (EBX >= 10)
    jmp done
is_less:
    mov edx, 1     ; EDX = 1  (EBX < 10)
done:
    hlt`,
    exercise: {
      prompt: 'Write a loop that multiplies EAX by 2 exactly 4 times, starting from EAX=1. Use ADD eax, eax (doubling trick) inside the loop body.',
      hint: 'Set ECX=4 as the loop counter. Each iteration: ADD eax, eax. After the loop EAX should be 16.',
    },
  },

  {
    id: 4,
    title: 'Stack & Calling Conventions',
    intro: `The stack is a LIFO region of memory that grows downward — pushing decrements ESP, popping increments it. CALL pushes the return address then jumps; RET pops it and jumps back. The standard stack frame lets subroutines access their arguments and locals reliably.`,
    concepts: [
      { name: 'PUSH / POP', desc: 'ESP -= 4, write value; or read value, ESP += 4. Stack grows toward lower addresses.' },
      { name: 'CALL label', desc: 'Pushes the address of the next instruction (return address) then jumps to label.' },
      { name: 'RET', desc: 'Pops the return address off the stack and jumps to it.' },
      { name: 'Stack frame (cdecl)', desc: 'PUSH EBP / MOV EBP,ESP at start; POP EBP / RET at end. Arguments at [EBP+8], [EBP+12], …' },
      { name: 'Caller clean-up', desc: 'In cdecl the caller does ADD ESP, 4*N after the call to remove its arguments.' },
    ],
    diagram: `
  After CALL and frame setup       Memory addresses (grows ↓)
  ─────────────────────────        ──────────────────────────
  [EBP+8]  → first argument        high address
  [EBP+4]  → saved return addr
  [EBP+0]  → saved EBP     ← EBP  ← ESP (after PUSH EBP)
  [EBP-4]  → local var 1
  [EBP-8]  → local var 2           low address`,
    code: `section .text
global _start

_start:
    push 7         ; pass argument 7
    call square    ; call subroutine
    add  esp, 4    ; caller cleans up (cdecl)
    ; EAX = 49
    hlt

square:            ; returns argument² in EAX
    push ebp
    mov  ebp, esp
    mov  eax, [ebp+8]   ; load first argument
    imul eax, eax       ; EAX = EAX²
    pop  ebp
    ret`,
    exercise: {
      prompt: 'Add a second subroutine called "add_two" that takes two arguments and returns their sum in EAX. Call it with arguments 13 and 27. The result should be 40.',
      hint: 'Push the second argument first, then the first (right-to-left). Inside add_two: [EBP+8] is arg1, [EBP+12] is arg2.',
    },
  },

  {
    id: 5,
    title: 'Loop Patterns',
    intro: `Assembly has no for/while keywords. Every loop is a label you jump back to. Four patterns cover almost every case: counted (LOOP), while (CMP + conditional jump at top), do-while (conditional jump at bottom), and nested (two counters, two labels).`,
    concepts: [
      { name: 'Counted — LOOP label', desc: 'Decrements ECX, jumps if ECX ≠ 0. Fastest for a fixed number of iterations. Put the count in ECX before the loop.' },
      { name: 'While — CMP at top', desc: 'Test the condition before entering the body. If the condition is false immediately, the body never executes.' },
      { name: 'Do-While — CMP at bottom', desc: 'Body always runs at least once. Jump back to the top if the condition is still true.' },
      { name: 'Nested loops', desc: 'Save the outer counter (PUSH ECX / POP ECX) around the inner loop, because LOOP overwrites ECX.' },
      { name: 'Early exit (break)', desc: 'JMP to the label after the loop body. Works in any loop style.' },
    ],
    diagram: `
  Counted (LOOP)          While                   Do-While
  ──────────────          ──────────────           ──────────────
  mov ecx, N          top:                     top:
  top:                    cmp eax, limit           ; body
    ; body                jge done                 ; body
    loop top              ; body                   cmp eax, limit
  ; done                  jmp top              jl  top
                      done:                    ; done`,
    code: `section .text
global _start

_start:
    ; ── 1. Counted loop: sum 1..10 ──────────────────
    mov ecx, 10
    mov eax, 0
count_loop:
    add eax, ecx
    loop count_loop        ; EAX = 55

    ; ── 2. While loop: divide EBX by 2 until < 4 ───
    mov ebx, 64
while_top:
    cmp ebx, 4
    jl  while_done         ; exit when EBX < 4
    shr ebx, 1             ; EBX >>= 1  (divide by 2)
    jmp while_top
while_done:                ; EBX = 2

    ; ── 3. Do-while: count up from 1 to 5 ──────────
    mov edx, 0
do_top:
    inc edx
    cmp edx, 5
    jl  do_top             ; EDX = 5 when loop exits

    ; ── 4. Nested: 3×4 = 12 iterations, ESI = 12 ──
    mov esi, 0
    mov ecx, 3             ; outer counter
outer_loop:
    push ecx               ; save outer ECX
    mov  ecx, 4            ; inner counter
inner_loop:
    inc  esi
    loop inner_loop
    pop  ecx               ; restore outer ECX
    loop outer_loop        ; ESI = 12

    hlt`,
    exercise: {
      prompt: 'Write a loop that computes 2^8 (2 to the power of 8) and stores the result in EAX. Start with EAX=1 and double it 8 times using ADD eax, eax inside a counted loop.',
      hint: 'Set ECX=8, EAX=1. Each iteration: ADD eax, eax. After the loop EAX should be 256.',
    },
  },

  {
    id: 6,
    title: 'Data Sections & Syscalls',
    intro: `Real programs need named memory (strings, buffers, constants) and a way to talk to the OS. The .data section holds initialized data; .bss reserves zeroed space. The int 0x80 instruction hands control to the Linux kernel with arguments in registers — this is how every console program actually prints and exits.`,
    concepts: [
      { name: 'section .data', desc: 'Initialized read/write data. db stores bytes, dw words, dd dwords. String literals use single quotes.' },
      { name: 'db / dw / dd', desc: 'Define Byte / Word / Dword. db \'Hi\', 0x0A, 0 stores a newline-terminated, null-terminated string.' },
      { name: 'equ  ($ - label)', desc: '$  is the current address. Writing len equ $ - msg computes the byte length of msg at assemble time.' },
      { name: 'section .bss', desc: 'Uninitialized space — zero at program start. resb N reserves N bytes. Use for input buffers.' },
      { name: 'int 0x80 — Linux syscall', desc: 'EAX = syscall number, EBX/ECX/EDX = arguments. Result returned in EAX. Always the last step before exiting.' },
      { name: 'Key syscall numbers', desc: 'sys_read=3  sys_write=4  sys_exit=1. fd: 0=stdin 1=stdout 2=stderr.' },
    ],
    diagram: `
  sys_write (EAX=4)              sys_exit (EAX=1)
  ──────────────────────         ──────────────────
  EBX = file descriptor          EBX = exit code
  ECX = pointer to buffer        int  0x80
  EDX = number of bytes          (process terminates)
  int 0x80
  → EAX = bytes written

  Data segment layout (example)
  ──────────────────────────────────────────────────
  0x4000  msg:  48 65 6C 6C 6F 2C 20 57 6F 72 6C 64 21 0A
               'H' 'e' 'l' 'l' 'o' ',' ' ' 'W' 'o' 'r' 'l' 'd' '!' '\\n'
  0x400E  (msg_len equ $ - msg  →  14)`,
    code: `section .data
    msg     db 'Hello, World!', 0x0A  ; string + newline
    msg_len equ $ - msg               ; length = 14

section .bss
    buf resb 64                       ; 64-byte input buffer

section .text
global _start

_start:
    ; ── Write "Hello, World!" to stdout ──────────
    mov eax, 4          ; sys_write
    mov ebx, 1          ; fd = stdout
    mov ecx, msg        ; pointer to string
    mov edx, msg_len    ; byte count
    int 0x80            ; → printed in stdout panel

    ; ── Write a second message ───────────────────
    mov eax, 4
    mov ebx, 1
    mov ecx, msg2
    mov edx, msg2_len
    int 0x80

    ; ── Exit cleanly ─────────────────────────────
    mov eax, 1          ; sys_exit
    mov ebx, 0          ; exit code 0
    int 0x80

section .data
    msg2     db 'Goodbye!', 0x0A
    msg2_len equ $ - msg2`,
    exercise: {
      prompt: 'Change the program to print your own message instead of "Hello, World!". Then exit with code 42 instead of 0. Watch the stdout panel and exit code update.',
      hint: 'Edit the string after db (keep the quotes and trailing 0x0A for the newline). Change MOV EBX, 0 to MOV EBX, 42 before sys_exit. Update msg_len if your string length changed — or let equ recompute it automatically.',
    },
  },

  {
    id: 7,
    title: 'String Instructions',
    intro: `x86 has a set of instructions purpose-built for operating on memory buffers: MOVS (copy), STOS (fill), LODS (load), SCAS (scan/search), and CMPS (compare). Each comes in byte/word/dword variants and can be prefixed with REP, REPE, or REPNE to loop automatically using ECX as a counter.`,
    concepts: [
      { name: 'CLD / STD', desc: 'Clear/Set Direction Flag. CLD (DF=0): ESI and EDI increment after each step. STD (DF=1): they decrement. Always call CLD before string ops unless you explicitly want reverse direction.' },
      { name: 'REP strOP', desc: 'Repeat ECX times, decrement ECX each iteration. Use with MOVS, STOS, LODS.' },
      { name: 'REPNE SCASB', desc: 'Repeat while ZF=0 (not equal) and ECX≠0. Scans EDI for the byte in AL. Classic strlen / strchr pattern.' },
      { name: 'REPE CMPSB', desc: 'Repeat while ZF=1 (equal) and ECX≠0. Compares ESI with EDI byte-by-byte. Classic strcmp pattern.' },
      { name: 'MOVS — copy', desc: 'mem[EDI] = mem[ESI], then advance both. REP MOVSB copies ECX bytes (like memcpy).' },
      { name: 'STOS — fill', desc: 'mem[EDI] = AL/AX/EAX, then advance EDI. REP STOSB fills ECX bytes (like memset).' },
      { name: 'SCAS — scan', desc: 'Compare AL with mem[EDI], set flags, advance EDI. REPNE SCASB stops when it finds the byte.' },
      { name: 'CMPS — compare', desc: 'Compare mem[ESI] with mem[EDI], set flags, advance both. REPE CMPSB stops at first difference.' },
    ],
    diagram: `
  REP MOVSB  (memcpy)          REPNE SCASB  (strlen / strchr)
  ──────────────────────        ──────────────────────────────
  ESI → [source buffer]         EDI → [string to scan]
  EDI → [dest   buffer]         AL  = byte to find (0 for strlen)
  ECX = byte count              ECX = max length
  cld                           cld
  rep movsb                     repne scasb
  ; ESI, EDI advanced by ECX   ; EDI now points ONE PAST the match
  ; ECX = 0                     ; ECX = remaining count
                                ; length = original_ECX - ECX - 1

  REPE CMPSB  (strcmp)          REP STOSB   (memset)
  ──────────────────────        ──────────────────────────────
  ESI → string A                EDI → [buffer]
  EDI → string B                AL  = fill byte
  ECX = max length              ECX = count
  cld                           cld
  repe cmpsb                    rep stosb
  ; ZF=1 → strings equal        ; EDI advanced, ECX = 0
  ; ZF=0 → diverged at ESI-1`,
    code: `section .data
    src  db 'Hello', 0      ; source string (6 bytes incl. null)
    pat  db 'World', 0      ; for comparison

section .bss
    dst  resb 16            ; destination buffer

section .text
global _start

_start:
    ; ── 1. memcpy: copy src → dst ─────────────────────────────
    cld                     ; DF = 0: ESI/EDI increment
    mov  esi, src
    mov  edi, dst
    mov  ecx, 6             ; 5 chars + null
    rep  movsb              ; copy 6 bytes
    ; step through: watch ESI/EDI advance, mem at dst fills

    ; ── 2. strlen: find null in src with REPNE SCASB ──────────
    mov  edi, src           ; scan from start of src
    mov  al,  0             ; looking for null byte
    mov  ecx, 256
    repne scasb             ; scan until mem[EDI] == AL
    ; ECX = 256 - 6 = 250, EDI points just past the null
    mov  eax, 256
    sub  eax, ecx
    dec  eax                ; EAX = 5  (length of "Hello")

    ; ── 3. memset: fill dst with '*' ──────────────────────────
    mov  edi, dst
    mov  al,  0x2A          ; '*' = 42
    mov  ecx, 5
    rep  stosb              ; write '*' × 5 into dst

    ; ── 4. strcmp: compare src vs pat ─────────────────────────
    mov  esi, src           ; "Hello"
    mov  edi, pat           ; "World"
    mov  ecx, 6
    repe cmpsb              ; compare until mismatch or ECX=0
    ; ZF=0 after loop: strings differ
    ; ESI-1 points to 'H', EDI-1 points to 'W'

    hlt`,
    exercise: {
      prompt: 'Add a second string "Hello" in .data and use REPE CMPSB to compare it against src. After the loop, check ZF: if strings are equal ZF=1. Watch the flags panel — ZF should be 1 this time.',
      hint: 'Declare: copy db \'Hello\', 0. Then MOV ESI, src / MOV EDI, copy / MOV ECX, 6 / REPE CMPSB. Equal strings leave ZF=1.',
    },
  },

  {
    id: 8,
    title: 'Bitwise Operations',
    intro: `Bitwise instructions operate on individual bits of a value. They are the foundation of low-level programming: packing multiple values into one register, testing hardware flags, fast multiply/divide by powers of two, and cryptographic operations. Every bit matters here — step slowly and watch the register values change in binary.`,
    concepts: [
      { name: 'AND  — mask / clear bits', desc: 'Result bit = 1 only if both input bits are 1. Use a mask to isolate or zero out specific bits. AND clears CF and OF.' },
      { name: 'OR   — set bits', desc: 'Result bit = 1 if either input bit is 1. Use to force specific bits high without touching others.' },
      { name: 'XOR  — toggle / zero', desc: 'Result bit = 1 if inputs differ. XOR reg, reg is the fastest way to zero a register (smaller encoding than MOV reg, 0).' },
      { name: 'NOT  — invert all bits', desc: 'Flips every bit. Equivalent to XOR with 0xFFFFFFFF. Does not affect flags.' },
      { name: 'SHL / SHR', desc: 'Shift left = multiply by 2ⁿ. Shift right = divide by 2ⁿ (unsigned). SHL eax, 3 = EAX × 8. CF = last bit shifted out.' },
      { name: 'SAR  — arithmetic shift right', desc: 'Like SHR but copies the sign bit into vacated positions. Use for signed division by 2ⁿ: SAR eax, 1 = EAX ÷ 2 (signed).' },
      { name: 'ROL / ROR', desc: 'Rotate: bits shifted out one end reappear at the other. No bits are lost. CF = last bit rotated.' },
      { name: 'BT / BTS / BTR / BTC', desc: 'Bit Test (and optionally Set/Reset/Complement). CF = the tested bit\'s original value. Essential for flag registers and bitmasks.' },
    ],
    diagram: `
  AND — masking                OR — setting             XOR — toggling
  ─────────────────────        ───────────────          ──────────────────────
    1100 1010  (value)           1100 1010                1100 1010
  & 0000 1111  (mask 0x0F)     | 0011 0000              ^ 1010 1010
  ───────────────────          ────────────              ────────────
    0000 1010  low nibble        1111 1010  set bits 4,5  0110 0000

  SHL / SHR                    ROL / ROR (32-bit, count=1)
  ─────────────────────────    ──────────────────────────────────────
  shl eax, 2  → EAX × 4        rol: [b31 b30 … b1 b0] → [b30 … b0 b31]  CF=b31
  shr eax, 2  → EAX ÷ 4        ror: [b31 b30 … b1 b0] → [b0 b31 … b1]   CF=b0
  sar eax, 2  → EAX ÷ 4 (signed, sign bit copied)

  Bit Test (BT eax, 3)
  ─────────────────────────
  tests bit 3 → CF = (EAX >> 3) & 1   (EAX unchanged)
  BTS: also sets   bit to 1
  BTR: also clears bit to 0
  BTC: also flips  bit`,
    code: `section .text
global _start

_start:
    ; ── AND: isolate low byte (mask) ──────────────────────────────
    mov  eax, 0xDEADBEEF
    and  eax, 0x000000FF   ; EAX = 0xEF  (low byte only)

    ; ── OR: set bits 4 and 5 ──────────────────────────────────────
    mov  ebx, 0b00001010   ; EBX = 0x0A
    or   ebx, 0b00110000   ; EBX = 0x3A  (bits 4,5 set)

    ; ── XOR: toggle bits / zero register ─────────────────────────
    mov  ecx, 0b11001100
    xor  ecx, 0b10101010   ; ECX = 0x66 (toggled)
    xor  ecx, ecx          ; ECX = 0, ZF=1 (zero trick)

    ; ── NOT: bitwise invert ───────────────────────────────────────
    mov  edx, 0x0F0F0F0F
    not  edx               ; EDX = 0xF0F0F0F0

    ; ── SHL / SHR: fast multiply / divide ────────────────────────
    mov  eax, 7
    shl  eax, 3            ; EAX = 56  (7 × 2³)
    shr  eax, 1            ; EAX = 28

    ; ── SAR: signed divide (preserves sign) ──────────────────────
    mov  eax, -32          ; 0xFFFFFFE0
    sar  eax, 2            ; EAX = -8  (not 0x3FFFFFF8!)

    ; ── ROL / ROR: rotate ─────────────────────────────────────────
    mov  eax, 0x80000001   ; bit 31 and bit 0 set
    rol  eax, 1            ; EAX = 0x00000003, CF=1 (bit 31 wrapped)
    ror  eax, 4            ; EAX = 0x30000000, CF=0

    ; ── BT / BTS / BTR: bit manipulation ─────────────────────────
    mov  eax, 0b10110100
    bt   eax, 4            ; test bit 4 (=1) → CF=1, EAX unchanged
    btr  eax, 4            ; clear bit 4    → EAX = 0b10100100, CF=1
    bts  eax, 0            ; set   bit 0    → EAX = 0b10100101, CF=0

    hlt`,
    exercise: {
      prompt: 'Write code that packs two 4-bit values (nibbles) into one byte in EAX. Put the value 0xA into the high nibble and 0x5 into the low nibble. The result should be EAX = 0xA5. Use SHL to shift the first value, then OR to combine.',
      hint: 'MOV eax, 0xA / SHL eax, 4 → EAX = 0xA0. Then OR eax, 0x5 → EAX = 0xA5.',
    },
  },

  // ── Lesson 9 ──────────────────────────────────────────────────────────────────
  {
    id: 9,
    title: 'Memory Addressing Modes',
    intro: `Every memory access in x86 specifies an address using one of four patterns. Register-indirect lets you treat a register as a pointer. Base+offset adds a constant — perfect for struct fields and stack slots. Scaled-index multiplies a register by 1, 2, 4, or 8 to index arrays. LEA computes the address formula without reading memory and is also used as a fast multiply trick.`,
    concepts: [
      { name: '[reg]  — register-indirect', desc: 'The register holds the memory address. Load a pointer into a register, then dereference with brackets.' },
      { name: '[reg + N]  — base + offset', desc: 'N bytes past the address in reg. Access struct fields ([esi+8]), stack arguments ([ebp+8]), and local variables ([ebp-4]).' },
      { name: '[label + reg*scale]  — scaled index', desc: 'label is the array base; reg is the element index; scale is the element size (1, 2, 4, or 8). The CPU computes the full address.' },
      { name: 'LEA dst, [expr]  — Load Effective Address', desc: 'Stores the computed address in dst — no memory read occurs. Use it to take a pointer, or as a 3-operand add: LEA eax, [eax+ecx*4] is a cheap multiply.' },
      { name: 'XCHG a, b', desc: 'Swap the contents of two registers (or register and memory) atomically. No temporary register needed.' },
    ],
    diagram: `
  section .data
      arr dd 10, 20, 30, 40, 50

  Memory layout (DATA_BASE = 0x4000)
  Index:   0     1     2     3     4
  Offset: +0    +4    +8   +12   +16
         [ 10]  [20]  [30]  [40]  [50]

  Addressing each element:
    mov eax, [arr]         ; arr[0] = 10  (label = direct address)
    mov eax, [arr+8]       ; arr[2] = 30  (base + immediate offset)
    mov ecx, 3
    mov eax, [arr+ecx*4]   ; arr[3] = 40  (scaled index)
    lea edi, [arr+ecx*4]   ; EDI = address of arr[3], no read`,
    code: `section .data
    val  dd 99               ; single dword variable
    arr  dd 10, 20, 30, 40, 50

section .text
global _start

_start:
    ; ── 1. Direct: load/store a named variable ──────────────
    mov  eax, [val]          ; EAX = 99
    mov  dword [val], 42     ; write 42 back

    ; ── 2. Register-indirect ─────────────────────────────────
    lea  ebx, [arr]          ; EBX = address of arr  (no read)
    mov  eax, [ebx]          ; EAX = arr[0] = 10
    add  ebx, 4              ; advance pointer
    mov  eax, [ebx]          ; EAX = arr[1] = 20

    ; ── 3. Base + immediate offset ───────────────────────────
    mov  eax, [arr+8]        ; arr[2] = 30
    mov  eax, [arr+12]       ; arr[3] = 40

    ; ── 4. Scaled-index: arr[ecx] ────────────────────────────
    mov  ecx, 4
    mov  eax, [arr+ecx*4]    ; arr[4] = 50

    ; ── 5. LEA — address only, no memory read ────────────────
    lea  edi, [arr+ecx*4]    ; EDI = 0x4000 + 16 = address of arr[4]
    mov  eax, [edi]          ; EAX = 50  (read through the pointer)

    ; ── 6. LEA as cheap multiply: EAX × 3 ───────────────────
    mov  eax, 7
    lea  eax, [eax+eax*2]    ; EAX = 7 + 7×2 = 21  (no MUL needed)

    hlt`,
    exercise: {
      prompt: 'Load arr[4] (value 50) into EBX using scaled-index addressing. Then use LEA to compute the address of arr[4] and store it in ECX. Verify by reading [ECX] — it should equal EBX.',
      hint: 'MOV esi, 4 / MOV ebx, [arr+esi*4] for the value. LEA ecx, [arr+esi*4] for the address. MOV eax, [ecx] — EAX should be 50.',
    },
  },

  // ── Lesson 10 ─────────────────────────────────────────────────────────────────
  {
    id: 10,
    title: 'Signed Arithmetic & Division',
    intro: `x86 uses two's complement for signed integers — the same bit patterns, but bit 31 is the sign bit. The same ADD and SUB work for both signed and unsigned; the difference is which flags you check afterward (OF for signed overflow, CF for unsigned). IMUL, IDIV, and CDQ are the dedicated signed-math instructions. CDQ sign-extends EAX into EDX before a 64-bit ÷ 32-bit division.`,
    concepts: [
      { name: "Two's complement", desc: 'Negative numbers: -n = NOT n + 1. So -1 = 0xFFFFFFFF, -128 = 0xFFFFFF80. Sign bit (bit 31) = 1 means negative. Range: -2,147,483,648 to 2,147,483,647.' },
      { name: 'JL / JG vs JB / JA', desc: 'Signed comparisons: JL (less), JLE, JG (greater), JGE read SF and OF. Unsigned: JB (below), JBE, JA (above), JAE read CF. Use the right pair for your number type.' },
      { name: 'IMUL dst, src', desc: '2-operand: dst = dst × src (signed, lower 32 bits). Also IMUL dst, src, imm for a 3-operand form.' },
      { name: 'CDQ', desc: 'Convert Doubleword to Quadword: sign-extends EAX into EDX. If EAX is negative, EDX = 0xFFFFFFFF; else EDX = 0. Always call CDQ immediately before IDIV.' },
      { name: 'IDIV src', desc: 'Signed division: divides the 64-bit value in EDX:EAX by src. Quotient → EAX, remainder → EDX. Call CDQ first to prepare EDX.' },
      { name: 'SAR (arithmetic shift right)', desc: 'Copies the sign bit into vacated positions — correct for signed ÷ 2ⁿ. Compare: SAR eax, 1 on -8 gives -4; SHR gives +2,147,483,644.' },
    ],
    diagram: `
  Two's complement (32-bit)
  ─────────────────────────────────────────────
  0x00000000 =           0   (most positive even)
  0x7FFFFFFF =  2147483647   (most positive)
  0x80000000 = -2147483648   (most negative)
  0xFFFFFFFF =          -1

  Signed division workflow
  ─────────────────────────────────────────────
  mov  eax, -17    ; dividend (negative)
  cdq              ; EDX = 0xFFFFFFFF  (sign-extended)
  mov  ecx, 5      ; divisor
  idiv ecx         ; EAX = -3 (quotient)
                   ; EDX = -2 (remainder: -17 = -3×5 + (-2))

  IMUL forms
  ─────────────────────────────────────────────
  imul ecx              ; 1-op: EDX:EAX = EAX × ECX (64-bit)
  imul eax, ecx         ; 2-op: EAX     = EAX × ECX (32-bit)
  imul eax, ecx, -5     ; 3-op: EAX     = ECX × (-5)`,
    code: `section .text
global _start

_start:
    ; ── Signed vs unsigned: same bits, different meaning ────
    mov  eax, 0xFFFFFFFF   ; -1 signed, 4294967295 unsigned
    add  eax, 1            ; EAX = 0 — ADD works for both!
    ; CF=1 (unsigned overflow); OF=0 (no signed overflow from -1+1)

    ; ── IMUL: signed multiply ────────────────────────────────
    mov  eax, -6
    mov  ecx, 7
    imul eax, ecx          ; EAX = -42

    mov  ebx, 0
    imul ebx, ecx, -5      ; EBX = ECX × (-5) = -35

    ; ── CDQ: sign-extend EAX into EDX before IDIV ───────────
    mov  eax, -17
    cdq                    ; EDX = 0xFFFFFFFF (EAX was negative)
    mov  ecx, 5
    idiv ecx               ; EAX = -3  EDX = -2

    ; ── Positive dividend ────────────────────────────────────
    mov  eax, 100
    cdq                    ; EDX = 0  (EAX was positive)
    mov  ecx, 7
    idiv ecx               ; EAX = 14  EDX = 2

    ; ── SAR vs SHR on a negative value ───────────────────────
    mov  eax, -32          ; 0xFFFFFFE0
    sar  eax, 2            ; EAX = -8  (signed ÷4, correct)
    mov  eax, -32
    shr  eax, 2            ; EAX = 0x3FFFFFF8  (wrong for signed)

    ; ── Signed comparison ─────────────────────────────────────
    mov  eax, -5
    cmp  eax, 0
    jl   is_negative       ; jump if EAX < 0 (signed)
    mov  ebx, 0
    jmp  sign_done
is_negative:
    mov  ebx, 1            ; EBX = 1  (EAX is negative)
sign_done:
    hlt`,
    exercise: {
      prompt: 'Compute (-100) ÷ (-3) using CDQ and IDIV. What are the quotient (EAX) and remainder (EDX)? Hint: the mathematically correct answer has EAX = 33.',
      hint: 'MOV eax, -100 / CDQ / MOV ecx, -3 / IDIV ecx. Expected: EAX = 33, EDX = -1 (because 33 × (-3) = -99, and -100 − (-99) = -1).',
    },
  },

  // ── Lesson 11 ─────────────────────────────────────────────────────────────────
  {
    id: 11,
    title: 'Procedures & Local Variables',
    intro: `Lesson 4 covered call/ret. Real functions also need local variables — temporary scratch space that is private to each invocation and disappears on return. The technique is to subtract from ESP after saving EBP, carving space on the stack. Locals live at negative offsets from EBP; parameters are at positive offsets. This layout is called a stack frame.`,
    concepts: [
      { name: 'Function prologue', desc: 'PUSH EBP / MOV EBP, ESP — saves the caller\'s frame pointer and establishes a new one. EBP stays fixed for the whole function even as ESP moves.' },
      { name: 'Local variable allocation', desc: 'SUB ESP, N carves N bytes below EBP. Two dword locals need SUB ESP, 8. Access them as [EBP-4] and [EBP-8].' },
      { name: 'Caller parameters', desc: 'Arguments pushed right-to-left. After the prologue: [EBP+4]=return address, [EBP+8]=arg1, [EBP+12]=arg2, [EBP+16]=arg3.' },
      { name: 'Function epilogue', desc: 'MOV ESP, EBP discards locals by resetting the stack pointer. POP EBP restores the caller\'s frame. RET returns.' },
      { name: 'Callee-saved registers', desc: 'EBX, ESI, EDI, EBP must be preserved — push them on entry, pop before return. EAX, ECX, EDX may be freely clobbered.' },
    ],
    diagram: `
  Stack after prologue and "sub esp, 8"   (grows downward ↓)
  ─────────────────────────────────────────────────────────
  [EBP+12]  arg2          ← pushed first by caller
  [EBP+ 8]  arg1          ← pushed second (right-to-left)
  [EBP+ 4]  return addr   ← pushed by CALL
  [EBP+ 0]  saved EBP     ← EBP  (push ebp; mov ebp, esp)
  [EBP- 4]  local var 1
  [EBP- 8]  local var 2   ← ESP  (sub esp, 8)

  Epilogue: mov esp, ebp  → discards locals
            pop ebp       → restores caller's frame
            ret           → jumps back`,
    code: `section .text
global _start

_start:
    ; abs_diff(10, 3) → EAX = 7
    push 3          ; arg2 (pushed first — right-to-left)
    push 10         ; arg1
    call abs_diff
    add  esp, 8     ; caller cleans up 2 arguments

    ; abs_diff(5, 20) → EAX = 15
    push 20
    push 5
    call abs_diff
    add  esp, 8
    ; EAX = 15
    hlt

; abs_diff(a, b) → |a - b| in EAX
; Uses local variables to store copies of a and b
abs_diff:
    push ebp
    mov  ebp, esp
    sub  esp, 8          ; reserve: [ebp-4]=local_a, [ebp-8]=local_b

    mov  eax, [ebp+8]    ; load arg1 (a)
    mov  ecx, [ebp+12]   ; load arg2 (b)
    mov  [ebp-4], eax    ; local_a = a
    mov  [ebp-8], ecx    ; local_b = b

    ; compute a - b; negate if negative
    mov  eax, [ebp-4]
    sub  eax, [ebp-8]
    jns  ad_done         ; jump if result >= 0
    neg  eax             ; negate: EAX = |a - b|
ad_done:
    mov  esp, ebp        ; release locals
    pop  ebp
    ret`,
    exercise: {
      prompt: 'Write a "clamp(val, lo, hi)" function that returns val if lo ≤ val ≤ hi, lo if val < lo, or hi if val > hi. Call it with (25, 10, 20) — EAX should be 20. Then call it with (5, 10, 20) — EAX should be 10.',
      hint: '[EBP+8]=val, [EBP+12]=lo, [EBP+16]=hi. Load val into EAX. CMP eax, [ebp+12] / JGE check_hi. If below lo: MOV eax, [ebp+12] / JMP done. check_hi: CMP eax, [ebp+16] / JLE done. MOV eax, [ebp+16].',
    },
  },

  // ── Lesson 12 ─────────────────────────────────────────────────────────────────
  {
    id: 12,
    title: 'Arrays',
    intro: `An array is a sequence of same-sized elements packed contiguously in memory. The address of element i is: base + i × element_size. For a dword (4-byte) array, element 3 lives at arr+12. x86's scaled-index addressing — [arr+ecx*4] — computes this in one instruction. Traversal uses a register as either an index (scaled access) or a running pointer (add 4 each step).`,
    concepts: [
      { name: 'Array definition', desc: 'arr dd 10, 20, 30 allocates three consecutive dwords starting at label arr. db for bytes, dw for 16-bit words, dd for 32-bit dwords.' },
      { name: 'Element address', desc: 'address of arr[i] = arr + i × 4  (for dwords). Byte array: arr + i. Word array: arr + i × 2.' },
      { name: '[arr + ecx*4]  — scaled-index', desc: 'Direct array element access. The CPU multiplies ECX by 4 and adds the base address — no extra instruction needed.' },
      { name: 'Pointer traversal', desc: 'Put the base address in ESI/EDI with LEA or MOV. Add the element size each iteration. Avoids the multiply and is sometimes faster.' },
      { name: 'arrlen EQU N', desc: 'Declare the count as a compile-time constant. EQU labels have no storage — they substitute the number at assemble time.' },
    ],
    diagram: `
  section .data
      arr dd 3, 17, 8, 42, 11

  Memory (DATA_BASE = 0x4000)
  Index:   0     1     2     3     4
  Offset: +0    +4    +8   +12   +16
          [ 3]  [17]  [ 8]  [42]  [11]

  Access patterns:
    mov eax, [arr]        ; arr[0] = 3
    mov eax, [arr+8]      ; arr[2] = 8
    mov ecx, 3
    mov eax, [arr+ecx*4]  ; arr[3] = 42

  Pointer traversal:
    mov esi, arr    ; esi = &arr[0]
    mov eax, [esi]  ; read arr[0]
    add esi, 4      ; esi = &arr[1]
    mov eax, [esi]  ; read arr[1]`,
    code: `section .data
    arr    dd  3, 17, 8, 42, 11
    arrlen equ 5

section .text
global _start

_start:
    ; ── 1. Read individual elements ──────────────────────────
    mov  eax, [arr]          ; arr[0] = 3
    mov  eax, [arr+4]        ; arr[1] = 17
    mov  ecx, 2
    mov  eax, [arr+ecx*4]    ; arr[2] = 8

    ; ── 2. Sum all elements using pointer traversal ───────────
    mov  ecx, arrlen         ; loop counter
    mov  eax, 0              ; sum accumulator
    mov  esi, arr            ; esi = pointer to arr[0]
sum_loop:
    add  eax, [esi]          ; sum += *esi
    add  esi, 4              ; advance to next element
    loop sum_loop
    ; EAX = 3+17+8+42+11 = 81

    ; ── 3. Find the maximum using scaled-index ────────────────
    mov  ecx, arrlen
    dec  ecx                 ; compare arrlen-1 more elements
    mov  ebx, [arr]          ; current max = arr[0]
    mov  esi, 1              ; index = 1
max_loop:
    mov  edx, [arr+esi*4]    ; edx = arr[esi]
    cmp  edx, ebx
    jle  max_next            ; skip if not bigger
    mov  ebx, edx            ; new max
max_next:
    inc  esi
    loop max_loop
    ; EBX = 42

    ; ── 4. Write to an array element ─────────────────────────
    mov  ecx, 0
    mov  dword [arr+ecx*4], 99  ; arr[0] = 99
    mov  eax, [arr]          ; EAX = 99

    hlt`,
    exercise: {
      prompt: 'After the existing loops, count how many elements are greater than 10 and store the count in EDI. Expected: 3 (the values 17, 42, and 11 are all greater than 10).',
      hint: 'XOR edi, edi / MOV esi, arr / MOV ecx, arrlen. Loop: MOV edx, [esi] / CMP edx, 10 / JLE skip / INC edi. skip: ADD esi, 4 / LOOP ...',
    },
  },
];
