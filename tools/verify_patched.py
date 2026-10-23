#!/usr/bin/env python3
"""python3 verify_patched.py <original> <patched> <hooks.json> -- prueft die gepatchte Mach-O unabhaengig (nur Standardbibliothek)."""
import json, struct, sys
O, P, HJ = sys.argv[1:4]
a, b = open(O, "rb").read(), open(P, "rb").read()
ok = True
def chk(n, c):
    global ok
    print(("OK   " if c else "FAIL ") + n); ok &= bool(c)
def parse(d):
    _, _, _, _, n, sz, _, _ = struct.unpack_from("<8I", d, 0); off = 32; out = []
    for _ in range(n):
        c, s = struct.unpack_from("<II", d, off); out.append((c, off, s)); off += s
    return out, 32 + sz
ca, ea = parse(a); cb, eb = parse(b)
def segs(d, cs):
    r = {}
    for c, o, s in cs:
        if c == 0x19:
            nm = d[o+8:o+24].rstrip(b"\0").decode(); r[nm] = struct.unpack_from("<4Q", d, o+24)
    return r
sa, sb = segs(a, ca), segs(b, cb)
order = [d[o+8:o+24].rstrip(b"\0").decode() for c, o, s in cb if c == 0x19 for d in [b]]
print("Segmente:", order)
for n in sa:
    if n != "__LINKEDIT": chk(f"Segment {n} unveraendert", sa[n] == sb[n])
le_a, le_b = sa["__LINKEDIT"], sb["__LINKEDIT"]
chk("KMTEXT direkt vor LINKEDIT, nahtlos", sb["__KMTEXT"][0] == le_a[0] and sb["__KMDATA"][0] == sb["__KMTEXT"][0] + sb["__KMTEXT"][1] and le_b[0] == sb["__KMDATA"][0] + sb["__KMDATA"][1])
chk("Dateioffsets nahtlos", sb["__KMTEXT"][2] == le_a[2] and sb["__KMDATA"][2] == sb["__KMTEXT"][2] + 0x4000 and le_b[2] == sb["__KMDATA"][2] + 0x4000)
chk("LINKEDIT endet exakt am Dateiende", le_b[2] + le_b[3] == len(b))
chk("Code-Signatur-Command entfernt", not any(c == 0x1d for c, _, _ in cb))
# Linkedit-Offsets pruefen: jedes Feld zeigt auf identische Bytes wie im Original
sh = le_b[2] - le_a[2]
def fields(d, cs):
    r = {}
    for c, o, s in cs:
        if c in (0x22, 0x80000022):
            f = struct.unpack_from("<10I", d, o+8)
            for i, k in enumerate(["rebase", "bind", "weak", "lazy", "export"]): r[k] = (f[2*i], f[2*i+1])
        elif c == 2:
            so, ns, sto, ss = struct.unpack_from("<4I", d, o+8); r["symtab"] = (so, ns*16); r["strtab"] = (sto, ss)
        elif c == 0xb:
            f = struct.unpack_from("<18I", d, o+8); r["indirect"] = (f[12], f[13]*4)
        elif c in (0x26, 0x29, 0x1d, 0x1e, 0x2b, 0x2e, 0x80000033, 0x80000034):
            r[hex(c)] = struct.unpack_from("<2I", d, o+8)
    return r
fa, fb = fields(a, ca), fields(b, cb)
for k, (off, size) in fa.items():
    if k == "0x1d" or size == 0: continue
    ob, sb_ = fb[k]
    chk(f"{k}: Offset +0x{sh:x}, Inhalt identisch ({size} B)", ob == off + sh and sb_ == size and b[ob:ob+size] == a[off:off+size])
# Textbereich: nur Hook-Woerter geaendert
hooks = json.load(open(HJ))["hooks"]; rv = {int(h["rva"], 16) for h in hooks}
n = le_a[2]
diff = sorted({i & ~3 for i in range(n) if a[i] != b[i]})
hdr = [i for i in diff if i < max(ea, eb)]
body = [i for i in diff if i >= max(ea, eb)]
chk("Aenderungen ausserhalb Header = genau die Hook-Stellen", set(body) == rv)
# Caves dekodieren
cave_fo, slot_va, cave_va = sb["__KMTEXT"][2], sb["__KMDATA"][0], sb["__KMTEXT"][0]
for i, h in enumerate(hooks):
    r = int(h["rva"], 16); w = struct.unpack_from("<I", b, r)[0]
    imm = ((w & 0x3ffffff) ^ 0x2000000) - 0x2000000
    tgt = 0x100000000 + r + imm * 4
    c = struct.unpack_from("<4I", b, cave_fo + i*16)
    adrp_imm = ((c[0] >> 5) & 0x7ffff) << 2 | ((c[0] >> 29) & 3)
    adrp_imm = (adrp_imm ^ 0x100000) - 0x100000
    page = ((cave_va + i*16) & ~0xfff) + (adrp_imm << 12)
    slot = page + ((c[1] >> 10) & 0xfff) * 8
    good = (w >> 26) == 5 and tgt == cave_va + i*16 and (c[0] & 0x9f00001f) == 0x90000010 and c[2] == 0xD61F0200 and slot == slot_va + i*8
    chk(f"Hook {h['name']}: b -> Cave -> Slot {slot_va + i*8:#x}", good)
print("ERGEBNIS:", "alles OK" if ok else "FEHLER"); sys.exit(0 if ok else 1)
