'use strict';

// ── NASM syntax mode for CodeMirror 5 ────────────────────────────────────────

CodeMirror.defineMode('nasm', function () {
  const INSTRUCTIONS = new RegExp(
    '^(mov[sz]?[bwd]?|add|adc|sub|sbb|mul|imul|div|idiv|inc|dec|neg' +
    '|and|or|xor|not|shl|sal|shr|sar|ror|rol|rcr|rcl' +
    '|push|pop|pushad|popad|pushfd|popfd' +
    '|call|ret|retn|retf|jmp' +
    '|je|jz|jne|jnz|jg|jnle|jge|jnl|jl|jnge|jle|jng' +
    '|ja|jnbe|jae|jnb|jb|jnae|jc|jbe|jna|jnc|js|jns|jo|jno|jpe|jpo' +
    '|loop|loope|loopne|loopz|loopnz' +
    '|cmp|test|int|hlt|nop|cld|std|clc|stc|cmc' +
    '|movsb|movsw|movsd|stosb|stosw|stosd|lodsb|lodsw|lodsd' +
    '|scasb|scasw|scasd|cmpsb|cmpsw|cmpsd' +
    '|rep|repe|repne|repz|repnz' +
    '|xchg|lea|xlat|xlatb|cbw|cwde|cdq|lahf|sahf' +
    '|setcc|seto|setno|setb|setnb|setz|setnz|setbe|setnbe' +
    '|sets|setns|setp|setnp|setl|setnl|setle|setnle' +
    '|bt|bts|btr|btc|bsf|bsr|bswap' +
    '|in|out|ins|outs' +
    ')\\b', 'i'
  );

  const REGISTERS = new RegExp(
    '^(r(ax|bx|cx|dx|si|di|sp|bp|8|9|1[0-5])[dwb]?' +
    '|e(ax|bx|cx|dx|si|di|sp|bp)' +
    '|[abcd][lh]|[abcd]x|sil|dil|spl|bpl' +
    '|[cdefgs]s|[ei]?p' +
    ')\\b', 'i'
  );

  const DIRECTIVES = new RegExp(
    '^(section|segment|global|extern|bits|default|org|cpu|float' +
    '|db|dw|dd|dq|dt|do|dy|dz' +
    '|resb|resw|resd|resq|rest|reso|resy|resz' +
    '|equ|times|align|alignb|incbin' +
    ')\\b', 'i'
  );

  const SIZE_SPECS = /^(byte|word|dword|qword|tword|oword|yword|zword|ptr)\b/i;

  return {
    startState: () => ({}),

    token(stream) {
      if (stream.eatSpace()) return null;

      // ── Comment ──────────────────────────────────────────────────────────
      if (stream.peek() === ';') { stream.skipToEnd(); return 'comment'; }

      // ── String / char literal ─────────────────────────────────────────────
      const q = stream.peek();
      if (q === "'" || q === '"' || q === '`') {
        stream.next();
        while (!stream.eol()) { if (stream.next() === q) break; }
        return 'string';
      }

      // ── Section names (.text .data .bss) ─────────────────────────────────
      if (stream.match(/\.[a-z_][a-z0-9_]*/i)) return 'meta';

      // ── $ current-address symbols ─────────────────────────────────────────
      if (stream.match(/\$\$?/)) return 'atom';

      // ── Numbers (hex, decimal, octal, binary, with NASM suffixes) ─────────
      if (stream.match(/0x[0-9a-f]+/i)) return 'number';
      if (stream.match(/[0-9][0-9a-f]*h\b/i)) return 'number';
      if (stream.match(/[01]+b\b/i)) return 'number';         // binary
      if (stream.match(/[0-7]+[oq]\b/i)) return 'number';     // octal
      if (stream.match(/[0-9]+\.?[0-9]*/)) return 'number';

      // ── Label definition (word immediately before colon) ──────────────────
      if (stream.match(/[a-z_\.@][a-z0-9_\.@]*(?=:)/i)) return 'def';

      // ── Size specifiers ───────────────────────────────────────────────────
      if (stream.match(SIZE_SPECS)) return 'type';

      // ── Registers ────────────────────────────────────────────────────────
      if (stream.match(REGISTERS)) return 'variable-2';

      // ── Directives ───────────────────────────────────────────────────────
      if (stream.match(DIRECTIVES)) return 'meta';

      // ── Instructions ─────────────────────────────────────────────────────
      if (stream.match(INSTRUCTIONS)) return 'keyword';

      // ── Other identifiers (labels used as operands, macros) ──────────────
      if (stream.match(/[a-z_\.@][a-z0-9_\.@]*/i)) return 'variable';

      // ── Operators and punctuation ─────────────────────────────────────────
      if (stream.match(/[+\-*\/,\[\]():]/)) return 'operator';

      stream.next();
      return null;
    },
  };
});

CodeMirror.defineMIME('text/x-nasm', 'nasm');

// ── Create editor instance ────────────────────────────────────────────────────
window.cmEditor = CodeMirror(document.getElementById('editor-host'), {
  mode: 'nasm',
  theme: 'nasm-dark',
  lineNumbers: true,
  tabSize: 4,
  indentWithTabs: false,
  autofocus: false,
  lineWrapping: false,
  extraKeys: { Tab: cm => cm.replaceSelection('    ') },
  viewportMargin: Infinity,
});
