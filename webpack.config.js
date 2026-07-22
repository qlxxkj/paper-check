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
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                },
                {
                    // 处理 CSS 文件
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader']
                },
                {
                    // 处理字体文件（Font Awesome 需要）
                    test: /\.(woff|woff2|eot|ttf|otf)$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'fonts/[name].[hash][ext]'
                    }
                }
            ]
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