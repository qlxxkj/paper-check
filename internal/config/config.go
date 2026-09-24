package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// AppConfig 对齐 config/config.json 的字段（与 main.ts 的 appConfig 默认值一致）
type AppConfig struct {
	MinMatchChars            int     `json:"minMatchChars"`
	Sensitivity              float64 `json:"sensitivity"`
	EnableRefFilter          bool    `json:"enableRefFilter"`
	FullDuplicateThreshold   float64 `json:"fullDuplicateThreshold"`
	PartialDuplicateThreshold float64 `json:"partialDuplicateThreshold"`
	DiffThreshold            float64 `json:"diffThreshold"`
	NgramLength              int     `json:"ngramLength"`
	MinSharedNgrams          int     `json:"minSharedNgrams"`
	ContextSize              int     `json:"contextSize"`
}

// 默认值（对齐 main.ts 顶部注释里的默认配置）
var Default = AppConfig{
	MinMatchChars:           13,
	Sensitivity:            0.05,
	EnableRefFilter:        true,
	FullDuplicateThreshold: 0.995,
	PartialDuplicateThreshold: 0.01,
	DiffThreshold:          0.01,
	NgramLength:            16,
	MinSharedNgrams:        5,
	ContextSize:            3,
}

// 配置文件路径：开发环境 ./config/config.json；打包后由调用方传入 exe 同目录
func ConfigPath() string {
	return filepath.Join("config", "config.json")
}

// LoadConfig 读 config.json；读不到或解析失败时返回默认值
func LoadConfig() AppConfig {
	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		return Default
	}
	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Default
	}
	// 补全零值字段为默认
	def := Default
	if cfg.NgramLength == 0 {
		cfg.NgramLength = def.NgramLength
	}
	if cfg.MinSharedNgrams == 0 {
		cfg.MinSharedNgrams = def.MinSharedNgrams
	}
	if cfg.MinMatchChars == 0 {
		cfg.MinMatchChars = def.MinMatchChars
	}
	if cfg.Sensitivity == 0 {
		cfg.Sensitivity = def.Sensitivity
	}
	if cfg.FullDuplicateThreshold == 0 {
		cfg.FullDuplicateThreshold = def.FullDuplicateThreshold
	}
	if cfg.PartialDuplicateThreshold == 0 {
		cfg.PartialDuplicateThreshold = def.PartialDuplicateThreshold
	}
	if cfg.DiffThreshold == 0 {
		cfg.DiffThreshold = def.DiffThreshold
	}
	if cfg.ContextSize == 0 {
		cfg.ContextSize = def.ContextSize
	}
	return cfg
}

// SaveConfig 写 config.json
func SaveConfig(cfg AppConfig) error {
	if err := os.MkdirAll("config", 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigPath(), data, 0o644)
}
