# Stage 1: rewrite the 5 projects from a blank file (issue #27).
#   make test              grade all five
#   make test ONLY=life    grade one
# The grader is ../../projects/test.sh, the same one the reference solutions pass.
PROGS = hexdump brainfuck life httpd snake

all: $(PROGS)

%: %.asm
	nasm -f elf32 -g -F dwarf $< -o $@.o
	ld -m elf_i386 $@.o -o $@
	rm -f $@.o

test: all
	BIN=$(CURDIR) ONLY=$(ONLY) ../../projects/test.sh

clean:
	rm -f $(PROGS)

.PHONY: all test clean
