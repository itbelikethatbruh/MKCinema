"""Joins thin Mach-O executables into one universal (fat) binary, like lipo -create. Usage: makefat.py OUT IN..."""
import struct, sys
def info(b):
    magic, cpu, sub, ft, ncmds, sz, flags = struct.unpack('<IiiIIII', b[:28])
    assert magic == 0xfeedfacf, 'not a 64-bit Mach-O'
    off, cmds = 32, []
    for _ in range(ncmds):
        c, l = struct.unpack('<II', b[off:off+8]); cmds.append(c); off += l
    return cpu, sub, cmds
out, ins = sys.argv[1], sys.argv[2:]
bins = [open(p, 'rb').read() for p in ins]
ALIGN = 14
hdr = struct.pack('>II', 0xcafebabe, len(bins))
off = 4096 * 4
slices, archs = [], b''
for b in bins:
    cpu, sub, cmds = info(b)
    print(hex(cpu & 0xffffffff), 'code signature' if 0x1d in cmds else 'NO SIGNATURE', len(b))
    off = (off + (1 << ALIGN) - 1) & ~((1 << ALIGN) - 1)
    archs += struct.pack('>iiIII', cpu, sub & 0x00ffffff, off, len(b), ALIGN)
    slices.append((off, b)); off += len(b)
data = bytearray(off)
data[:8 + len(archs)] = hdr + archs
for o, b in slices: data[o:o+len(b)] = b
open(out, 'wb').write(data)
