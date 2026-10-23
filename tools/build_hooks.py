#!/usr/bin/env python3
"""
Statisches Hooking ohne JIT, OHNE lief/capstone (reine Standardbibliothek).

  python3 build_hooks.py <entschluesselte_Binary> <hooks.json> <out_Binary> <dylib_dir>

Was passiert:
  * Neue Segmente __KMTEXT (r-x, Caves) und __KMDATA (rw-, Slots) werden VOR __LINKEDIT eingefuegt.
    __LINKEDIT wird um 2 Seiten nach hinten verschoben, alle Datei-Offsets in den Load Commands werden angepasst.
    Der Linkedit-Inhalt (Rebase/Bind/Export/Symbole/Function-Starts) bleibt byteweise identisch.
  * Die alte Code-Signatur wird entfernt (Sideloadly/AltStore signieren neu).
  * Je Hook-Stelle wird die 1. Instruktion durch `b cave` ersetzt; die verdraengte Instruktion wird im Trampolin
    (kitmod_tramp.S) nachgebildet: normale Instruktionen 1:1, adrp, b, bl.
Erzeugt: <out_Binary>, <dylib_dir>/kitmod_gen.h, <dylib_dir>/kitmod_tramp.S
"""
import json, struct, sys

PAGE = 0x4000
CAVE = 16
SHIFT = 2 * PAGE
LC_SEGMENT_64 = 0x19
LC_CODE_SIGNATURE = 0x1d
OFF_FIELDS = {  # cmd -> [(Offset im Command, Groessenfeld oder None)]
    0x22: [(8, 12), (16, 20), (24, 28), (32, 36), (40, 44)],      # DYLD_INFO
    0x80000022: [(8, 12), (16, 20), (24, 28), (32, 36), (40, 44)],
    0x2: [(8, None), (16, None)],                                    # SYMTAB: symoff, stroff
    0xb: [(32, None), (40, None), (48, None), (56, None), (64, None), (72, None)],  # DYSYMTAB (siehe unten)
}
LINKEDIT_DATA = {0x1d, 0x1e, 0x26, 0x29, 0x2b, 0x2e, 0x80000033, 0x80000034}


def die(m):
    sys.exit("FEHLER: " + m)


def enc_b(src, dst):
    d = (dst - src) // 4
    if not -(1 << 25) <= d < (1 << 25):
        die(f"Sprung zu weit (0x{src:x} -> 0x{dst:x})")
    return 0x14000000 | (d & 0x3ffffff)


def enc_adrp(rd, src, dst):
    imm = ((dst & ~0xfff) - (src & ~0xfff)) >> 12
    return 0x90000000 | ((imm & 3) << 29) | (((imm >> 2) & 0x7ffff) << 5) | rd


def enc_ldr_x(rt, rn, off):
    return 0xF9400000 | ((off // 8) << 10) | (rn << 5) | rt


BR_X16 = 0xD61F0200
NOP = 0xD503201F


def sx(v, bits):
    return v - (1 << bits) if v & (1 << (bits - 1)) else v


def classify(word, rva):
    """-> (kind, info, text). kind: plain | b | bl | adrp ; sonst Abbruch bei PC-relativen Instruktionen."""
    if (word >> 26) == 0b000101:
        return "b", rva + sx(word & 0x3ffffff, 26) * 4, "b"
    if (word >> 26) == 0b100101:
        return "bl", rva + sx(word & 0x3ffffff, 26) * 4, "bl"
    if (word & 0x9f000000) == 0x90000000:
        imm = sx((((word >> 5) & 0x7ffff) << 2) | ((word >> 29) & 3), 21)
        return "adrp", (word & 0x1f, ((rva & ~0xfff) + (imm << 12))), "adrp"
    if (word & 0x9f000000) == 0x10000000:
        die(f"RVA 0x{rva:x}: adr als erste Instruktion nicht unterstuetzt")
    if (word & 0x3b000000) == 0x18000000:
        die(f"RVA 0x{rva:x}: ldr (literal) als erste Instruktion nicht unterstuetzt")
    if (word & 0x7e000000) == 0x34000000 or (word & 0x7e000000) == 0x36000000 or (word & 0xff000010) == 0x54000000:
        die(f"RVA 0x{rva:x}: cbz/cbnz/tbz/tbnz/b.cond als erste Instruktion nicht unterstuetzt")
    regs = {word & 31, (word >> 5) & 31, (word >> 10) & 31, (word >> 16) & 31}
    if (word & 0x1f000000) == 0x11000000:      # add/sub immediate: Bits 10-21 sind der Immediate
        regs = {word & 31, (word >> 5) & 31}
    if 16 in regs or 17 in regs:
        print(f"  WARNUNG RVA 0x{rva:x}: Instruktion 0x{word:08x} enthaelt evtl. x16/x17 (Trampolin nutzt beide)")
    return "plain", None, "plain"


def main():
    if len(sys.argv) != 5:
        die(__doc__)
    src, hjson, out, ddir = sys.argv[1:]
    hooks = json.load(open(hjson))["hooks"]
    d = bytearray(open(src, "rb").read())
    magic, cpu, sub, ft, ncmds, sizeofcmds, flags, _ = struct.unpack_from("<8I", d, 0)
    if magic != 0xfeedfacf or cpu != 0x0100000c:
        die("keine arm64-Mach-O (Fat-Binary? vorher mit lipo -thin arm64 extrahieren)")
    # ---- Load Commands lesen
    cmds = []
    off = 32
    for _ in range(ncmds):
        cmd, cs = struct.unpack_from("<II", d, off)
        cmds.append([cmd, bytearray(d[off:off + cs])])
        off += cs
    segs = []
    for cmd, b in cmds:
        if cmd == LC_SEGMENT_64:
            name = bytes(b[8:24]).rstrip(b"\0").decode()
            vm, vs, fo, fs = struct.unpack_from("<4Q", b, 24)
            segs.append((name, vm, vs, fo, fs))
    segd = {s[0]: s for s in segs}
    le = segd["__LINKEDIT"]
    base = segd["__TEXT"][1]
    if base != 0x100000000:
        print(f"Hinweis: Image-Base 0x{base:x}")
    le_vm, le_vs, le_fo, le_fs = le[1:]
    if le_fo + le_fs != len(d):
        print(f"Hinweis: Datei ({len(d):#x}) endet nicht exakt am Ende von __LINKEDIT ({le_fo + le_fs:#x})")
    # ---- Code-Signatur finden (muss am Ende von LINKEDIT liegen)
    sig = next((b for c, b in cmds if c == LC_CODE_SIGNATURE), None)
    new_end = le_fo + le_fs
    if sig is not None:
        so, sz = struct.unpack_from("<2I", sig, 8)
        if so + sz != le_fo + le_fs and so + sz != len(d):
            die("Code-Signatur liegt nicht am Ende - nicht unterstuetzt")
        new_end = so
    # ---- neue Segmente
    n = len(hooks)
    cave_size = max(PAGE, -(-n * CAVE // PAGE) * PAGE)
    data_size = max(PAGE, -(-n * 8 // PAGE) * PAGE)
    assert cave_size == PAGE and data_size == PAGE, "mehr als 1024 Hooks nicht vorgesehen"
    cave_va = le_vm
    slot_va = le_vm + cave_size
    cave_fo = le_fo
    slot_fo = le_fo + cave_size

    def mkseg(name, va, size, fo, prot):
        return bytearray(struct.pack("<II16sQQQQiiII", LC_SEGMENT_64, 72, name.encode(), va, size, fo, size, prot, prot, 0, 0))
    seg_t = mkseg("__KMTEXT", cave_va, cave_size, cave_fo, 5)
    seg_d = mkseg("__KMDATA", slot_va, data_size, slot_fo, 3)

    # ---- Offsets in den Commands verschieben
    def bump(b, o):
        v = struct.unpack_from("<I", b, o)[0]
        if v:
            struct.pack_into("<I", b, o, v + SHIFT)
    newcmds = []
    for cmd, b in cmds:
        if cmd == LC_CODE_SIGNATURE:
            continue
        if cmd == LC_SEGMENT_64:
            name = bytes(b[8:24]).rstrip(b"\0").decode()
            if name == "__LINKEDIT":
                vm, vs, fo, fs = struct.unpack_from("<4Q", b, 24)
                new_fs = new_end - le_fo
                new_vs = -(-new_fs // PAGE) * PAGE
                struct.pack_into("<4Q", b, 24, vm + SHIFT, new_vs, fo + SHIFT, new_fs)
                newcmds.append([None, seg_t]); newcmds.append([None, seg_d])
        elif cmd in (0x22, 0x80000022):
            for o in (8, 16, 24, 32, 40):
                bump(b, o)
        elif cmd == 0x2:
            bump(b, 8); bump(b, 16)
        elif cmd == 0xb:
            # dysymtab: tocoff@32 modtaboff@40 extrefsymoff@48 indirectsymoff@56 extreloff@64 locreloff@72
            for o in (32, 40, 48, 56, 64, 72):
                bump(b, o)
        elif cmd in LINKEDIT_DATA:
            bump(b, 8)
        newcmds.append([cmd, b])
    blob = b"".join(bytes(b) for _, b in newcmds)
    if 32 + len(blob) > 0x4ea0:
        pass
    # freier Platz im Header
    first_sect = min([struct.unpack_from("<I", d, 32 + 0)[0]] + [0x1 << 60])
    # ---- Datei zusammensetzen
    header = bytearray(d[:32])
    struct.pack_into("<II", header, 16, len(newcmds), len(blob))
    hdr_all = bytes(header) + blob
    old_hdr_end = 32 + sizeofcmds
    if len(hdr_all) > old_hdr_end:
        free = bytes(d[old_hdr_end:len(hdr_all)])
        if any(free):
            die("kein freier Platz hinter den Load Commands")
    nd = bytearray(d[:le_fo])
    nd[:len(hdr_all)] = hdr_all
    if len(hdr_all) < old_hdr_end:
        nd[len(hdr_all):old_hdr_end] = b"\0" * (old_hdr_end - len(hdr_all))
    # ---- Hooks patchen
    def va2fo(va):
        for name, vm, vs, fo, fs in segs:
            if name not in ("__PAGEZERO",) and vm <= va < vm + fs and fs:
                return va - vm + fo
        die(f"VA 0x{va:x} nicht in Datei gemappt")
    cave = bytearray(cave_size)
    asm = []
    print(f"__KMTEXT @ 0x{cave_va:x}, __KMDATA @ 0x{slot_va:x}, LINKEDIT +0x{SHIFT:x}")
    for i, h in enumerate(hooks):
        rva = int(h["rva"], 16)
        va = base + rva
        fo = va2fo(va)
        word = struct.unpack_from("<I", nd, fo)[0]
        kind, info, _ = classify(word, rva)
        asm.append((i, h, kind, info, word))
        c_va, s_va = cave_va + i * CAVE, slot_va + i * 8
        cave[i * CAVE:(i + 1) * CAVE] = struct.pack("<4I", enc_adrp(16, c_va, s_va), enc_ldr_x(16, 16, s_va & 0xfff), BR_X16, NOP)
        struct.pack_into("<I", nd, fo, enc_b(va, c_va))
        print(f"  {h['name']:<16} RVA 0x{rva:08x}  orig: 0x{word:08x} ({kind}{'' if kind=='plain' else ' ' + str(info if kind!='adrp' else hex(info[1]))})")
    nd += cave
    nd += bytes(data_size)
    nd += d[le_fo:new_end]
    open(out, "wb").write(nd)
    print("geschrieben:", out, f"({len(nd)} Bytes)")

    with open(f"{ddir}/kitmod_gen.h", "w") as f:
        f.write("// AUTO-GENERIERT von build_hooks.py\n#pragma once\n#include <stdint.h>\n")
        f.write(f"#define KM_NHOOKS {n}\n#define KM_SLOT_RVA 0x{slot_va - base:x}ULL\n")
        f.write("enum { " + ", ".join(f"KM_{h['name']}" for _, h, _, _, _ in asm) + " };\n")
        f.write("static const uint32_t KM_RVAS[KM_NHOOKS] = {" + ", ".join(h["rva"] for _, h, _, _, _ in asm) + "};\n")
        for i, *_ in asm:
            f.write(f"extern void km_tramp_{i}(void); extern void km_leave_{i}(void);\n")
        f.write("static void *const KM_TRAMPS[KM_NHOOKS] = {" + ", ".join(f"km_tramp_{i}" for i, *_ in asm) + "};\n")
        f.write("static void *const KM_LEAVES[KM_NHOOKS] = {" + ", ".join(f"km_leave_{i}" for i, *_ in asm) + "};\n")
    with open(f"{ddir}/kitmod_tramp.S", "w") as f:
        f.write(TRAMP_HEAD)
        for i, h, kind, info, word in asm:
            rva = int(h["rva"], 16)
            f.write(f"\n// ---- {h['name']} (RVA 0x{rva:x}, {kind}) ----\n")
            f.write(f".globl _km_tramp_{i}\n.p2align 2\n_km_tramp_{i}:\n    KM_SAVE\n    mov x0, #{i}\n    mov x1, sp\n    bl _kitmod_enter\n    mov x16, x0\n    KM_RESTORE\n")
            if kind == "bl":
                # Original: bl target -> x30 = Funktion+4, Sprung nach target (Leave-Umbiegen entfaellt)
                f.write(f"    KM_BL_BASE_PLUS 0x{info:x}, 0x{rva + 4:x}\n")
            else:
                f.write("    mov x30, x16\n")
                if kind == "plain":
                    f.write(f"    .inst 0x{word:08x}\n    KM_JUMP_BASE_PLUS 0x{rva + 4:x}\n")
                elif kind == "b":
                    f.write(f"    KM_JUMP_BASE_PLUS 0x{info:x}\n")
                elif kind == "adrp":
                    f.write(f"    KM_LOAD_BASE_PLUS {info[0]}, 0x{info[1]:x}\n    KM_JUMP_BASE_PLUS 0x{rva + 4:x}\n")
            f.write(f".globl _km_leave_{i}\n.p2align 2\n_km_leave_{i}:\n    KM_SAVE\n    mov x0, #{i}\n    mov x1, sp\n    bl _kitmod_leave\n    mov x16, x0\n    KM_RESTORE\n    br x16\n")
    print("kitmod_gen.h / kitmod_tramp.S erzeugt")


TRAMP_HEAD = r""".text
.macro KM_SAVE
    sub sp, sp, #0xA0
    stp x0, x1, [sp, #0]
    stp x2, x3, [sp, #16]
    stp x4, x5, [sp, #32]
    stp x6, x7, [sp, #48]
    str x8, [sp, #64]
    stp x29, x30, [sp, #72]
    stp d0, d1, [sp, #88]
    stp d2, d3, [sp, #104]
    stp d4, d5, [sp, #120]
    stp d6, d7, [sp, #136]
.endmacro
.macro KM_RESTORE
    ldp x0, x1, [sp, #0]
    ldp x2, x3, [sp, #16]
    ldp x4, x5, [sp, #32]
    ldp x6, x7, [sp, #48]
    ldr x8, [sp, #64]
    ldp x29, x30, [sp, #72]
    ldp d0, d1, [sp, #88]
    ldp d2, d3, [sp, #104]
    ldp d4, d5, [sp, #120]
    ldp d6, d7, [sp, #136]
    add sp, sp, #0xA0
.endmacro
// Register x\r = Binary-Base + \off
.macro KM_LOAD_BASE_PLUS r, off
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x16, #(\off & 0xffff)
    movk x16, #((\off >> 16) & 0xffff), lsl #16
    add  x\r, x17, x16
.endmacro
.macro KM_JUMP_BASE_PLUS off
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x16, #(\off & 0xffff)
    movk x16, #((\off >> 16) & 0xffff), lsl #16
    add  x16, x17, x16
    br   x16
.endmacro
.macro KM_BL_BASE_PLUS target, ret
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x30, #(\\ret & 0xffff)
    movk x30, #((\\ret >> 16) & 0xffff), lsl #16
    add  x30, x17, x30
    movz x16, #(\\target & 0xffff)
    movk x16, #((\\target >> 16) & 0xffff), lsl #16
    add  x16, x17, x16
    br   x16
.endmacro
"""


if __name__ == "__main__":
    main()
