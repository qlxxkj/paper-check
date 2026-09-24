// Wails frontend 开发构建：在 frontend/ 子目录执行开发模式 watch 构建。
const { execSync } = require('child_process');

execSync('npx webpack --mode development --watch', {
    stdio: 'inherit',
    cwd: __dirname
});
