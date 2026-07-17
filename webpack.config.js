const path = require('path');

module.exports = [
    // 主进程
    {
        mode: 'development',
        entry: {
            main: './src/main/main.ts',
            preload: './src/main/preload.ts',
            importWorker: './src/main/worker/importWorker.ts'
        },
        target: 'electron-main',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js'
        },
        resolve: { extensions: ['.ts', '.js'] },
        module: {
            rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }]
        }
    },
    // 渲染进程
    {
        mode: 'development',
        entry: './src/renderer/index.tsx',
        target: 'electron-renderer',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'renderer.js'
        },
        resolve: { extensions: ['.ts', '.tsx', '.js'] },
        module: {
            rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }]
        }
    }
];