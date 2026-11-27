# Reference Game of Life for test.sh: same 80x23 torus and file format as life.asm.
import sys
W, H = 80, 23
g = [[0] * W for _ in range(H)]
for y, line in enumerate(open(sys.argv[1]).read().split('\n')[:H]):
    for x, ch in enumerate(line[:W]):
        g[y][x] = ch in '#O'
for _ in range(int(sys.argv[2])):
    g = [[int(n == 3 or (n == 2 and g[y][x]))
          for x in range(W)
          for n in [sum(g[(y + dy) % H][(x + dx) % W]
                        for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)]]
         for y in range(H)]
print('\n'.join(''.join('#' if c else ' ' for c in row) for row in g))
