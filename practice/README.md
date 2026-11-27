# Practice: the road to assembly fluency

You write the code; the tests tell you when it works. Reference solutions live in
`projects/` — open one only after your version passes.

| Stage | Issue | Status |
|---|---|---|
| 1. Rewrite the 5 projects from a blank file | #27 | skeletons in `stage1/` |
| 2. x86-64, gdb, C interop | #28 | added when stage 1 is done |
| 3. Processes, pipes, signals (mini shell) | #29 | added when stage 2 is done |
| 4. Async I/O with an epoll event loop | #30 | added when stage 3 is done |
| 5. Threads, atomics, futex | #31 | added when stage 4 is done |

## Stage 1

```bash
cd practice/stage1
make test ONLY=hexdump    # grade one project (start here)
make test                 # grade all five: done at 36 × ok
```

Each `.asm` file starts with the exact spec the grader checks, the syscalls you need,
and hints to read only when stuck.
