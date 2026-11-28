#!/usr/bin/env python3
"""
Read a JSON test case from stdin, assemble it with Keystone, execute on
Unicorn (x86-32, Intel syntax, ring-3 user mode), and print the resulting
register and flag state as JSON on stdout.

Input shape:
    {
      "code":      "<NASM-style x86 source, no directives>",
      "regs":      { "eax": 0, "ebx": 0, ... },     # optional, defaults to 0
      "stack_top": 0x8000                            # optional
    }

Output shape:
    { "regs": { "eax": ..., ... }, "flags": { "cf": 0, "zf": 1, "sf": 0, "of": 0 } }

Exit codes:
    0  success
    2  assemble or execute error (details on stderr as JSON)
"""

import json
import os
import subprocess
import sys
import tempfile

try:
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_32, UC_MODE_64, UcError
    from unicorn import x86_const
    from unicorn.x86_const import (
        UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_EDX,
        UC_X86_REG_ESI, UC_X86_REG_EDI, UC_X86_REG_ESP, UC_X86_REG_EBP,
        UC_X86_REG_EFLAGS, UC_X86_REG_EIP,
    )
except ImportError as e:
    sys.stderr.write(json.dumps({"error": "missing-deps", "detail": str(e)}))
    sys.exit(3)


class AssembleError(Exception):
    pass


REGS = {
    "eax": UC_X86_REG_EAX, "ebx": UC_X86_REG_EBX,
    "ecx": UC_X86_REG_ECX, "edx": UC_X86_REG_EDX,
    "esi": UC_X86_REG_ESI, "edi": UC_X86_REG_EDI,
    "esp": UC_X86_REG_ESP, "ebp": UC_X86_REG_EBP,
}

# "bits": 64 cases run in long mode and compare all 16 GPRs (printed as hex strings,
# since JSON numbers lose precision past 2^53).
REGS64 = {n: getattr(x86_const, f"UC_X86_REG_{n.upper()}") for n in
          ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rsp", "rbp",
           "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"]}

CODE_BASE  = 0x1000
STACK_BASE = 0x4000
STACK_SIZE = 0x4000  # ends at 0x8000
DEFAULT_STACK_TOP = STACK_BASE + STACK_SIZE - 4


def assemble(source: str, bits: int = 32) -> bytes:
    # Use the real nasm binary so the harness validates exactly the dialect
    # the gym uses. Keystone's "NASM" syntax mode silently turns `mov eax, 10`
    # into `mov eax, 0x10` — wrong default radix — so it's unusable here.
    with tempfile.TemporaryDirectory() as d:
        asm_path = os.path.join(d, "snippet.asm")
        bin_path = os.path.join(d, "snippet.bin")
        with open(asm_path, "w", encoding="utf-8") as f:
            f.write(f"bits {bits}\n")
            f.write(source)
            f.write("\n")
        proc = subprocess.run(
            ["nasm", "-f", "bin", asm_path, "-o", bin_path],
            capture_output=True, text=True, timeout=10,
        )
        if proc.returncode != 0:
            raise AssembleError(proc.stderr.strip() or "nasm failed")
        with open(bin_path, "rb") as f:
            return f.read()


def run(case: dict) -> dict:
    bits = case.get("bits", 32)
    code = assemble(case["code"], bits)
    regs_in = case.get("regs", {}) or {}
    stack_top = case.get("stack_top", DEFAULT_STACK_TOP)
    regs = REGS64 if bits == 64 else REGS
    mask = (1 << bits) - 1
    sp, bp = ("rsp", "rbp") if bits == 64 else ("esp", "ebp")

    mu = Uc(UC_ARCH_X86, UC_MODE_64 if bits == 64 else UC_MODE_32)
    mu.mem_map(CODE_BASE, 0x1000)
    mu.mem_map(STACK_BASE, STACK_SIZE)
    mu.mem_write(CODE_BASE, code)

    # Default ESP to top of mapped stack if not provided.
    if sp not in regs_in:
        mu.reg_write(regs[sp], stack_top)
    if bp not in regs_in:
        mu.reg_write(regs[bp], stack_top)

    for name, val in regs_in.items():
        if name not in regs:
            raise ValueError(f"unknown register: {name}")
        mu.reg_write(regs[name], val & mask)

    mu.emu_start(CODE_BASE, CODE_BASE + len(code), timeout=2_000_000, count=10000)

    eflags = mu.reg_read(UC_X86_REG_EFLAGS)
    out_regs = {name: mu.reg_read(uc_id) & mask for name, uc_id in regs.items()}
    if bits == 64:
        out_regs = {name: hex(v) for name, v in out_regs.items()}
    flags = {
        "cf": (eflags >> 0)  & 1,
        "zf": (eflags >> 6)  & 1,
        "sf": (eflags >> 7)  & 1,
        "of": (eflags >> 11) & 1,
    }
    return {"regs": out_regs, "flags": flags}


def main() -> int:
    raw = sys.stdin.read()
    try:
        case = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.stderr.write(json.dumps({"error": "bad-json", "detail": str(e)}))
        return 2

    try:
        result = run(case)
    except (AssembleError, UcError, ValueError, subprocess.TimeoutExpired) as e:
        sys.stderr.write(json.dumps({"error": "runtime", "detail": str(e), "case": case}))
        return 2

    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
