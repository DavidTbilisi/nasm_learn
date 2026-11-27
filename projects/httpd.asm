; httpd — a tiny web server in pure assembly. Serves one page with a visitor counter.
;
;   ./httpd          listen on http://127.0.0.1:8080/
;   ./httpd 9000     listen on http://127.0.0.1:9000/
;
; Only 127.0.0.1: reachable from this machine, not from your network.
; 32-bit Linux networking goes through ONE syscall, socketcall(102):
;   ebx = which call (socket, bind, ...), ecx = pointer to that call's argument array.
; shortcut: one client at a time, one read() per request — fine for a browser on localhost,
; a slow client blocks the next one. Upgrade path: fork() per connection.

SYS_EXIT      equ 1
SYS_READ      equ 3
SYS_WRITE     equ 4
SYS_CLOSE     equ 6
SYS_SOCKETCALL equ 102

SC_SOCKET     equ 1             ; socketcall sub-call numbers
SC_BIND       equ 2
SC_LISTEN     equ 4
SC_ACCEPT     equ 5
SC_SEND       equ 9
SC_SETSOCKOPT equ 14

AF_INET       equ 2
SOCK_STREAM   equ 1
SOL_SOCKET    equ 1
SO_REUSEADDR  equ 2
MSG_NOSIGNAL  equ 0x4000        ; client hung up? get EPIPE back instead of being killed by SIGPIPE

        section .data
; struct sockaddr_in: family, port (big-endian, patched at start), IPv4 address, padding
addr:       dw AF_INET
            dw 0
            db 127, 0, 0, 1
            times 8 db 0
one:        dd 1

hdr200:     db "HTTP/1.0 200 OK", 13, 10
            db "Content-Type: text/html; charset=utf-8", 13, 10
            db "Connection: close", 13, 10, 13, 10       ; no Content-Length: body ends when we close
            db "<!doctype html><meta charset=utf-8><title>asm httpd</title>"
            db "<body style='font:20px monospace;background:#111;color:#0f0;padding:2em'>"
            db "<h1>Served by pure x86 assembly</h1>"
            db "<p>No libc, no framework: socket, bind, listen, accept, send.</p>"
            db "<p>You are visitor #"
hdr200_l    equ $ - hdr200
tail200:    db "</p>", 10
tail200_l   equ $ - tail200

resp404:    db "HTTP/1.0 404 Not Found", 13, 10
            db "Content-Type: text/plain", 13, 10
            db "Connection: close", 13, 10, 13, 10
            db "not found", 10
resp404_l   equ $ - resp404

m_listen:   db "listening on http://127.0.0.1:"
m_listen_l  equ $ - m_listen
m_slash:    db "/", 10
e_sock:     db "httpd: cannot listen (port in use?)", 10
e_sock_l    equ $ - e_sock

        section .bss
args:       resd 5              ; argument array handed to socketcall
sfd:        resd 1              ; listening socket
cfd:        resd 1              ; current client
visitors:   resd 1
req:        resb 4096
numbuf:     resb 12

        section .text
        global _start
_start:
        mov     eax, 8080
        cmp     dword [esp], 2
        jl      .have_port
        mov     esi, [esp+8]            ; argv[1]
        call    atoi
.have_port:
        mov     edi, eax                ; keep host-order port for the banner
        xchg    al, ah                  ; htons: swap the two bytes -> network (big-endian) order
        mov     [addr+2], ax

        ; socket(AF_INET, SOCK_STREAM, 0)
        mov     dword [args],   AF_INET
        mov     dword [args+4], SOCK_STREAM
        mov     dword [args+8], 0
        mov     ebx, SC_SOCKET
        call    socketcall
        test    eax, eax
        js      fail
        mov     [sfd], eax

        ; setsockopt(sfd, SOL_SOCKET, SO_REUSEADDR, &one, 4): restart without "address in use"
        mov     [args], eax
        mov     dword [args+4],  SOL_SOCKET
        mov     dword [args+8],  SO_REUSEADDR
        mov     dword [args+12], one
        mov     dword [args+16], 4
        mov     ebx, SC_SETSOCKOPT
        call    socketcall

        ; bind(sfd, &addr, 16)
        mov     dword [args+4], addr
        mov     dword [args+8], 16
        mov     ebx, SC_BIND
        call    socketcall
        test    eax, eax
        js      fail

        ; listen(sfd, 16)
        mov     dword [args+4], 16
        mov     ebx, SC_LISTEN
        call    socketcall
        test    eax, eax
        js      fail

        mov     ecx, m_listen           ; banner: listening on http://127.0.0.1:PORT/
        mov     edx, m_listen_l
        call    print
        mov     eax, edi
        call    itoa
        call    print
        mov     ecx, m_slash
        mov     edx, 2
        call    print

; ── Serve forever ──
serve:
        mov     eax, [sfd]              ; accept(sfd, NULL, NULL)
        mov     [args], eax
        mov     dword [args+4], 0
        mov     dword [args+8], 0
        mov     ebx, SC_ACCEPT
        call    socketcall
        test    eax, eax
        js      serve                   ; transient accept error: try again
        mov     [cfd], eax

        mov     ebx, eax                ; read the request line
        mov     eax, SYS_READ
        mov     ecx, req
        mov     edx, 4096
        int     0x80
        cmp     eax, 6
        jl      .not_found
        cmp     dword [req], 'GET '     ; only "GET / " gets the page
        jne     .not_found
        cmp     word [req+4], '/ '
        jne     .not_found

        inc     dword [visitors]
        mov     ecx, hdr200
        mov     edx, hdr200_l
        call    send
        mov     eax, [visitors]
        call    itoa
        call    send
        mov     ecx, tail200
        mov     edx, tail200_l
        call    send
        jmp     .close
.not_found:
        mov     ecx, resp404
        mov     edx, resp404_l
        call    send
.close:
        mov     eax, SYS_CLOSE
        mov     ebx, [cfd]
        int     0x80
        jmp     serve

fail:
        mov     ecx, e_sock
        mov     edx, e_sock_l
        mov     eax, SYS_WRITE
        mov     ebx, 2
        int     0x80
        mov     eax, SYS_EXIT
        mov     ebx, 1
        int     0x80

; socketcall: ebx = sub-call, arguments already in `args`. Result in eax.
socketcall:
        mov     eax, SYS_SOCKETCALL
        mov     ecx, args
        int     0x80
        ret

; send: send(cfd, ecx, edx, MSG_NOSIGNAL). Errors ignored: the client is gone anyway.
send:
        mov     eax, [cfd]
        mov     [args], eax
        mov     [args+4], ecx
        mov     [args+8], edx
        mov     dword [args+12], MSG_NOSIGNAL
        mov     ebx, SC_SEND
        jmp     socketcall

; print: write(1, ecx, edx)
print:
        mov     eax, SYS_WRITE
        mov     ebx, 1
        int     0x80
        ret

; itoa: eax -> decimal digits in numbuf. Returns ecx = first digit, edx = length.
; Divides by 10 repeatedly; remainders come out last digit first, so fill backwards.
itoa:
        mov     ecx, numbuf + 12
        mov     ebx, 10
.div:
        xor     edx, edx
        div     ebx                     ; eax = eax / 10, edx = remainder
        add     dl, '0'
        dec     ecx
        mov     [ecx], dl
        test    eax, eax
        jnz     .div
        mov     edx, numbuf + 12
        sub     edx, ecx
        ret

; atoi: esi = decimal string -> eax. Stops at the first non-digit.
atoi:
        xor     eax, eax
.d:
        movzx   edx, byte [esi]
        sub     edx, '0'
        cmp     edx, 9
        ja      .end
        imul    eax, 10
        add     eax, edx
        inc     esi
        jmp     .d
.end:
        ret
