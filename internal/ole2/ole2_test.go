package ole2

import (
	"bytes"
	"encoding/binary"
	"testing"
)

// 构造最小可解析 CFB：512B 扇区。
// 布局：头(512B) | sector0 目录 | sector1 FAT | sector2 流数据
func buildCFB(t *testing.T, streamName string, content []byte) []byte {
	const sec = 512
	out := make([]byte, 4*sec)
	off := 0

	// --- 头 ---
	copy(out[off:off+8], []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1})
	binary.LittleEndian.PutUint16(out[off+24:], 0x003E)    // 版本
	binary.LittleEndian.PutUint16(out[off+28:], 9)         // 扇区大小 2^9
	binary.LittleEndian.PutUint16(out[off+30:], 0)
	binary.LittleEndian.PutUint32(out[off+44:], 1)         // FAT 占 1 扇区
	binary.LittleEndian.PutUint32(out[off+48:], 0xFFFFFFFE)
	binary.LittleEndian.PutUint32(out[off+76:], 1)         // DIFAT[0]: FAT 在 sector 1
	off += sec

	// --- sector 0: 目录（Root + 流 两项，各 128B）---
	writeItem(out[off:], 0, "Root Entry", 0xFFFFFFFF, 0, 0)          // 根（start=END）
	writeItem(out[off:], 128, streamName, 2, len(content), 1)        // 流：start=sector2
	off += sec

	// --- sector 1: FAT ---
	// sector 0 (目录) 的下一 sector = FAT 自身 (1) → 2
	// sector 1 (FAT)  的下一 sector = END(-2)
	// sector 2 (数据) 的下一 sector = 结束
	// --- sector 1: FAT ---
	// 扇区布局：sector 0=目录，sector 1=FAT，sector 2=数据
	// FAT 数组索引 = 扇区号
	binary.LittleEndian.PutUint32(out[off+0:], 0xFFFFFFFE) // FAT[0](目录 sector0)=END，目录无后续
	binary.LittleEndian.PutUint32(out[off+4:], 0xFFFFFFFD) // FAT[1](FAT 自身)
	binary.LittleEndian.PutUint32(out[off+8:], 0xFFFFFFFC) // FAT[2](数据 sector2)=结束
	off += sec

	// --- sector 2: 数据 ---
	copy(out[off:off+sec], content)
	return out
}

// writeItem 写一个 128B 目录项
func writeItem(b []byte, off int, name string, start, size, children int) {
	item := b[off : off+128]
	for i, c := range name {
		if i*2 >= 63 {
			break
		}
		item[i*2] = byte(c)
		item[i*2+1] = byte(c >> 8)
	}
	item[64] = 1 // 流类型
	if start == -1 {
		binary.LittleEndian.PutUint32(item[116:], 0xFFFFFFFE) // END
	} else {
		binary.LittleEndian.PutUint32(item[116:], uint32(start))
	}
	binary.LittleEndian.PutUint32(item[120:], uint32(size))
	binary.LittleEndian.PutUint32(item[124:], uint32(children))
}

func TestOpenStream(t *testing.T) {
	want := []byte{0x11, 0x22, 0x33, 0x44}
	cfb := buildCFB(t, "WordDocument", want)
	got, err := OpenStream(bytes.NewReader(cfb), "WordDocument")
	if err != nil {
		t.Fatalf("OpenStream 失败: %v", err)
	}
	if len(got) < 4 || !bytes.Equal(got[:4], want) {
		t.Fatalf("流内容不符: got=%v want=%v", got[:min4(got)], want)
	}
	t.Log("OLE2 容器解析正确，取回流内容")
}

func min4(b []byte) int {
	if len(b) < 4 {
		return len(b)
	}
	return 4
}
