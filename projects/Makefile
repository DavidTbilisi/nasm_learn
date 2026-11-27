# Pure-assembly projects: 32-bit Linux, int 0x80 syscalls, no libc.
#   make          build all
#   make test     build + check against reference behaviour
PROGS = hexdump brainfuck

all: $(PROGS)

%: %.asm
	nasm -f elf32 -g -F dwarf $< -o $@.o
	ld -m elf_i386 $@.o -o $@
	rm -f $@.o

test: all
	./test.sh

clean:
	rm -f $(PROGS)

.PHONY: all test clean
