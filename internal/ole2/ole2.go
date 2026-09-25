// OLE2 (Compound File Binary) 纯 Go 最小实现：解析 CFB 头 + FAT，
// 找到指定名称的流，返回其字节内容。零依赖。
package ole2

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"hash/fnv"
	"io"
)

// 解析 OLE2/CFB 复合文档，按名称取流。
func OpenStream(r io.ReaderAt, name string) ([]byte, error) {
	hdr := make([]byte, 512)
	if _, err := r.ReadAt(hdr, 0); err != nil {
		return nil, err
	}
	if !bytes.Equal(hdr[:8], []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}) {
		return nil, fmt.Errorf("不是 OLE2 复合文档（magic 不匹配）")
	}
	// 版本（offset 24）仅合法性校验；扇区大小由 offset 28 的 2^power 决定
	_ = binary.LittleEndian.Uint16(hdr[24:26])
	sectorPower := int(hdr[28])
	if sectorPower < 7 || sectorPower > 12 {
		return nil, fmt.Errorf("非法扇区大小 2^%d", sectorPower)
	}
	sectorSize := 1 << sectorPower

	// 头 76..108 是 DIFAT（FAT 扇区号列表）
	fatSectors := int(binary.LittleEndian.Uint32(hdr[44:48]))

	// 读 FAT
	fat := make([]uint32, 0, fatSectors*sectorSize/4)
	for i := 0; i < fatSectors; i++ {
		off := 1<<sectorPower + uint32(i)*uint32(sectorSize)
		buf := make([]byte, sectorSize)
		if _, err := r.ReadAt(buf, int64(off)); err != nil {
			return nil, err
		}
		for j := 0; j < len(buf); j += 4 {
			fat = append(fat, binary.LittleEndian.Uint32(buf[j:j+4]))
		}
	}
	// 目录流：CFB 规范中目录流从固定 sector 0 开始，沿 FAT 链到 END。
	// 注意 FAT[0] 的值本身即"目录链的下一个 sector"，0xFFFFFFFD 表 FAT 自身不入目录链。
	dirChain := make([]byte, 0)
	pos := 0 // 目录流起始固定 sector 0
	for {
		sect := fat[pos]
		buf := make([]byte, sectorSize)
		off := 1<<sectorPower + uint32(pos)*uint32(sectorSize)
		if _, err := r.ReadAt(buf, int64(off)); err != nil {
			return nil, err
		}
		dirChain = append(dirChain, buf...)
		pos = int(sect)
		if pos >= len(fat) || pos == 0xFFFFFFFC || pos == 0xFFFFFFFD || pos == 0xFFFFFFFE {
			break
		}
	}
	// 解析目录项（128B 一项）找到 name + 记录真实流大小
	var streamStart, streamSize uint32
	for off := 0; off+128 <= len(dirChain); off += 128 {
		item := dirChain[off : off+128]
		if len(item) < 128 {
			break
		}
		nameRaw := item[:64]
		// 名称 UTF-16，结尾 0x0000
		var n []byte
		for i := 0; i < len(nameRaw); i += 2 {
			if nameRaw[i] == 0 && nameRaw[i+1] == 0 {
				n = nameRaw[:i]
				break
			}
		}
		var nm string
		if len(n) >= 2 {
			// UTF-16LE → string
			for i := 0; i+1 < len(n); i += 2 {
				r := rune(n[i]) | rune(n[i+1])<<8
				nm += string(r)
			}
		}
		if nm == name {
			streamStart = binary.LittleEndian.Uint32(item[116:120])
			streamSize = binary.LittleEndian.Uint32(item[120:124])
			break
		}
	}
	if streamStart == 0 {
		return nil, fmt.Errorf("未找到流: %s", name)
	}
	// 沿 FAT 链读流内容，按目录项记录的 size 截断（sector 可能比真实流长）
	var out []byte
	streamPos := int(streamStart)
	for streamPos >= 0 && streamPos < len(fat) {
		buf := make([]byte, sectorSize)
		off := 1<<sectorPower + uint32(streamPos)*uint32(sectorSize)
		if _, err := r.ReadAt(buf, int64(off)); err != nil {
			return nil, err
		}
		out = append(out, buf...)
		streamPos = int(fat[streamPos])
		if streamPos == 0xFFFFFFFC || streamPos == 0xFFFFFFFF {
			break
		}
	}
	// 按真实流大小截断（CFB 流以 sector 对齐，尾部可能有多余字节）
	if streamSize != 0 && int64(streamSize) < int64(len(out)) {
		out = out[:streamSize]
	}
	return out, nil
}

// FNV-1a hash（与 Go 内置不一致，保持与 .doc 内部 hash 对齐）
func FNV1a(data []byte) uint32 {
	h := fnv.New32a()
	_, _ = h.Write(data)
	return h.Sum32()
}
