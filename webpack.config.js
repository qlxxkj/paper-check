const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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
        },
        externals: {
            'better-sqlite3': 'commonjs better-sqlite3',
            'bindings': 'commonjs bindings'
        }
    },
    // 渲染进程（添加 CopyWebpackPlugin）
    {
        mode: 'development',
        entry:{
            renderer: './src/renderer/index.tsx',
        },
        target: 'electron-renderer',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js'
        },
        resolve: { extensions: ['.ts', '.tsx', '.js'] },
        module: {
            rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }]
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'src/renderer/index.html', to: 'index.html' },
                ]
            })
        ]
    }
];