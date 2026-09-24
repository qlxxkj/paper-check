package main

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// 字体文件 MIME 类型映射。Wails 默认用 embed.FS + http.ServeFile 按扩展名推断 MIME，
// 但部分版本对 .woff/.woff2 推断不准（返回 text/html），导致 Font Awesome 图标变方块。
// 这里用 Middleware 显式接管字体请求，保证 Content-Type 正确。
var fontMIMEs = map[string]string{
	".woff":  "font/woff",
	".woff2": "font/woff2",
	".ttf":   "font/ttf",
	".otf":   "font/otf",
	".eot":   "application/vnd.ms-fontobject",
}

func fontMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if mime, ok := fontMIMEs[strings.ToLower(ext(path))]; ok {
			data, err := fs.ReadFile(assets, path)
			if err == nil {
				w.Header().Set("Content-Type", mime)
				w.Header().Set("Cache-Control", "public, max-age=31536000")
				w.Write(data)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func ext(p string) string {
	i := len(p) - 1
	for i >= 0 && p[i] != '.' {
		i--
	}
	if i < 0 {
		return ""
	}
	return p[i:]
}

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "文档查重系统",
		Width:  1200,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: fontMiddleware,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
