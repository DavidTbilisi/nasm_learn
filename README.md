# NASM Learn

An interactive x86 assembly learning environment that runs entirely in the browser — no install required.

**[Live demo →](https://davidtbilisi.github.io/nasm_learn/)**

## Live Tutorial

Open `tutorial/index.html` in any modern browser (or serve the directory):

```bash
npx serve tutorial
```

### Features

- **12 guided lessons** covering registers, arithmetic, flags, memory, the stack, loops, functions, strings, arrays, bitwise ops, and system calls
- **Step-by-step debugger** — run, step forward/backward through instructions, see registers, flags, and stack update live
- **Quiz mode** — multiple-choice and type-in questions with instant feedback and a progress bar
- **Gym mode** — timed drill workouts across 7 topic categories to build fluency under pressure
- **Resizable panels** — drag handles to reflow the editor/state/lesson layout; double-click any handle to reset; layout persists across sessions via `localStorage`
- **CodeMirror editor** with NASM syntax highlighting

### Simulator

The JavaScript simulator (`tutorial/simulator.js`) implements a subset of x86:

| Category | Instructions |
|---|---|
| Data movement | `mov`, `xchg`, `lea`, `push`, `pop` |
| Arithmetic | `add`, `sub`, `mul`, `imul`, `div`, `idiv`, `inc`, `dec`, `neg` |
| Logic | `and`, `or`, `xor`, `not`, `shl`, `shr`, `sar` |
| Comparison | `cmp`, `test` |
| Jumps | `jmp`, `je/jz`, `jne/jnz`, `jl/jnge`, `jle/jng`, `jg/jnle`, `jge/jnl`, `jb`, `jbe`, `ja`, `jae`, `js`, `jns` |
| Functions | `call`, `ret` |
| Output | `int 0x80` (Linux write/exit syscalls) |

Registers: `eax ebx ecx edx esi edi esp ebp`  
Flags: `ZF CF SF OF DF`

## Windows NASM (`main.asm`)

Standalone Win32 PE32 example that calls the Windows API directly:

```powershell
nasm -f win32 main.asm -o main.o
ld main.o -o main -lkernel32
./main
```

## Tests

[Playwright](https://playwright.dev/) end-to-end test suite — 55 tests covering page load, tab navigation, simulator run/step/reset, resize handles, quiz, and gym.

```bash
npm install
npx playwright install chromium
npm test
```

To run a single test by name:

```bash
npx playwright test --grep "error banner"
```
