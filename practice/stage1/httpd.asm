; STAGE 1 · httpd                                     grade: make test ONLY=httpd
; Write it from this blank file. Don't open projects/httpd.asm until you pass.
;
; ── SPEC (exactly what the grader checks) ─────────────────────────────────────
;   ./httpd PORT     listen on 127.0.0.1:PORT (no argument: 8080). 127.0.0.1 ONLY.
;   After listening, print exactly this line to stdout:
;       listening on http://127.0.0.1:PORT/
;   Request starting with "GET / "  -> "HTTP/1.0 200 OK" response, HTML body containing
;                                      "visitor #N", where N = 1, 2, 3... per page served
;   Any other request               -> "HTTP/1.0 404 Not Found" response
;   Close the connection after each response, then wait for the next client. Forever.
;   A client that hangs up before reading must NOT kill the server.
;   Port already in use -> message on stderr, exit code 1.
;   Try it: ./httpd 9000, then open http://127.0.0.1:9000/ in a browser.
;
; ── SYSCALLS (32-bit: eax = number, args in ebx, ecx, edx, then int 0x80) ───────
;   exit 1    read 3    write 4    close 6
;   socketcall 102: ALL networking goes through this one syscall.
;       ebx = sub-call, ecx = pointer to an array of dword arguments
;       socket 1 (AF_INET=2, SOCK_STREAM=1, 0)      bind 2 (fd, &sockaddr, 16)
;       listen 4 (fd, backlog)                      accept 5 (fd, 0, 0) -> client fd
;       send 9 (fd, buf, len, flags)                setsockopt 14 (fd, 1, 2, &one, 4)
;   struct sockaddr_in (16 bytes): dw 2 (AF_INET), dw port BIG-ENDIAN,
;                                  db 127,0,0,1, then 8 zero bytes
;
; ── HINTS (read only when stuck) ──────────────────────────────────────────────
;   1. Big-endian port: the CPU is little-endian, so swap the 2 bytes (xchg al, ah).
;   2. setsockopt SO_REUSEADDR (level 1, option 2) lets you restart without
;      "address in use" from the previous run.
;   3. Writing to a socket whose client left raises SIGPIPE, which kills you.
;      Use send with flags = MSG_NOSIGNAL (0x4000) instead of write.
;   4. HTTP/1.0 + "Connection: close": no Content-Length needed, the body ends at close.
;      Lines end with 13, 10 and the headers end with an empty line.
;   5. Number to text: divide by 10 repeatedly; remainders come out last digit first.

        global  _start
        section .text
_start:
        ; your code here

        mov     eax, 1                  ; exit(0): lets the stub build and run
        xor     ebx, ebx
        int     0x80
