# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Personal learning repository for x86/x86-64 assembly language across multiple platforms (Windows and Linux) and assembler syntaxes (NASM Intel syntax, GAS AT&T syntax, MASM).

## Build Commands

### Windows NASM (this directory — `nasm_learn/`)

```powershell
# Assemble
nasm -f win32 main.asm -o main.o

# Link (requires ld or Visual Studio linker with kernel32.lib)
ld main.o -o main -lkernel32

# Run
./main
```

### Linux CMake project (`../assembly/Assembly_Lang/`)

```bash
mkdir build && cd build
cmake ..
make
./Assembly_Lang
```

### Visual Studio MASM (`../assembly/001_asm/`)

Open `001_asm.sln` in Visual Studio and build normally.

## Architecture

### `nasm_learn/main.asm` — Windows x86 (this repo)

Standalone NASM assembly targeting Win32 PE32. Uses the stdcall calling convention (arguments pushed right-to-left, callee cleans stack). Calls Windows API directly:
- `GetStdHandle(-11)` → stdout handle in EAX
- `WriteFile(handle, buf, len, &written, 0)` → writes to console
- `ExitProcess(0)` → terminates

Three sections: `.data` (initialized data), `.bss` (uninitialized), `.text` (code).

### `../assembly/Assembly_Lang/` — Linux x86 C + Assembly interop

C `main.c` calls assembly subroutines compiled with GCC/GAS (AT&T syntax, `.s` files). Assembly functions use the `_` prefix convention and return values in `%eax`. Each `.s` file demonstrates one concept: registers (`accum.s`), arithmetic (`add.s`), stack (`stack.s`), comparisons (`compare.s`), increment (`inc.s`).

### `../assembly/asm_x86/` — Reference and advanced examples

Independent git repo with a `README.md` covering x86 registers, CPU flags, stack frame layout, and calling conventions. Subdirectories cover arrays, loops, strings, integer-to-string conversion, and arithmetic.

## Syntax Quick Reference

| Assembler | Syntax style | Operand order | Register prefix |
|-----------|-------------|---------------|-----------------|
| NASM      | Intel       | `dst, src`    | none (`eax`)    |
| GAS       | AT&T        | `src, dst`    | `%` (`%eax`)    |
| MASM      | Intel       | `dst, src`    | none (`eax`)    |

AT&T size suffixes: `b` (byte), `w` (word), `l` (long/dword), `q` (quad).

## Calling Conventions

- **cdecl** (Linux/GCC default): caller cleans stack, return in EAX/RAX.
- **stdcall** (Windows API): callee cleans stack, return in EAX.
- Stack must be 16-byte aligned before a `call` on x86-64.
