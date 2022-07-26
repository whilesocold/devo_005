/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path");

const merge = require("webpack-merge").merge;

// plugins
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env) => {
    const config = {
        entry: "./src/index.ts",
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json"],
        },
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: [MiniCssExtractPlugin.loader, "css-loader"],
                    sideEffects: true,
                },
            ],
        },
        optimization: {
            splitChunks: {
                chunks: "all",
                name: false,
            },
            runtimeChunk: "single",
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: "./static/index.html",
            }) /*,
            new CopyPlugin({
                patterns: [
                    {
                        from: "res/**",

                        // if there are nested subdirectories , keep the hierarchy
                        transformPath(targetPath, absolutePath) {
                            const resPath = path.resolve(__dirname, "res");
                            const endPath = absolutePath.slice(resPath.length);

                            return Promise.resolve(`res/${endPath}`);
                        },
                    },
                ],
            })
            */,
        ],
    };
    const envConfig = require(path.resolve(__dirname, `./webpack.${env.mode}.js`))(env);

    const mergedConfig = merge(config, envConfig);

    return mergedConfig;
};
