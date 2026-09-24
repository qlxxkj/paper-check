// Wails frontend 构建脚本：在 frontend/ 子目录执行生产构建。
// Wails 的 frontend:build 命令在 frontend/ 目录下执行，
// 因此直接调用本地的 npx webpack，产物输出到 ./dist（即 frontend/dist）。
const { execSync } = require('child_process');

execSync('npx webpack --mode production', {
    stdio: 'inherit',
    cwd: __dirname
});
