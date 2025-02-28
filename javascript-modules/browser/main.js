#! /usr/bin/env node

import path from "path";
import Builder from "@bookshop/builder";
import { Command } from "commander";
import sveltePlugin from "esbuild-svelte";
import svelteFixPlugin from "./lib/build/svelteFixPlugin.js";
import materialIconPlugin from "./lib/build/materialIconPlugin.js";
import { __dirname } from "./lib/build/util.js";
import BrowserServer from "./lib/build/browserServer.js";

export const runner = async (options) => {
    const bookshopDirs = options.bookshop.map(d => path.join(process.cwd(), d));
    const outputFile = options.output ? path.join(process.cwd(), options.output) : null;
    let port = options.port ?? null;
    let server = null;
    const watch = outputFile ? null : {
        onRebuild(error, result) {
            if (error) {
                console.error('📚 Renderer rebuild failed:', error)
            } else if (server && result?.outputFiles[0]) {
                server.pushNewFile(result?.outputFiles[0].text);
            }
        },
    };

    if (outputFile && port) {
        console.error(`Output file and port both specified — one or the other must be provided.`);
        process.exit(1);
    }

    if (!outputFile) {
        port = 30775;
    }

    const builderOptions = {
        esbuild: {
            plugins: [
                sveltePlugin({ compileOptions: { css: true } }),
                materialIconPlugin(),
                svelteFixPlugin
            ],
            loader: {
                ".svg": "text"
            },
            define: {
                BOOKSHOP_HMR_PORT: port ?? false
            },
            ...(outputFile ? { outfile: outputFile } : null),
            ...(watch ? { watch, write: false } : null),
            entryPoints: [path.join(__dirname(import.meta.url), 'lib/app/app.js')]
        },
        exclude: JSON.stringify(options.exclude || []),
        onlyEngines: options.onlyEngines,
        bookshopDirs: bookshopDirs,
        hosted: !!outputFile,
    }

    const output = await Builder(builderOptions);

    console.log(`Compiled bookshop.js with ${output.errors.length} errors and ${output.warnings.length} warnings.`);
    if (watch) {
        server = new BrowserServer({
            port: port,
            currentMemoryFile: output?.outputFiles?.[0]?.text
        });
    }
}
