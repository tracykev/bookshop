import { Liquid, Context } from 'liquidjs';
import translateLiquid from './translateLiquid.js';

/**
 * LiquidJS plugins
 */
import unbind from './plugins/unbind.js';
import slug from './plugins/slug-plugin.js';
import markdownify from './plugins/markdownify.js';
import loopContext from './plugins/loop_context.js';
import urlFilterBuilder from './plugins/url.js';

export class Engine {
    constructor(options) {
        options = {
            name: "Eleventy",
            files: {},
            ...options,
        };

        this.key = 'eleventy';
        this.name = options.name;
        this.files = options.files;
        this.plugins = options.plugins || [];
        this.plugins.push(unbind, slug, loopContext, markdownify);

        this.meta = {};
        this.info = {};
        this.plugins.push(urlFilterBuilder(this.meta));

        this.initializeLiquid();
        this.applyLiquidPlugins();
    }

    initializeLiquid() {
        const eleventyEngine = this;
        this.liquid = new Liquid({
            fs: {
                readFileSync(file) {
                    return "LiquidJS readFileSync unimplemented"
                },
                async readFile(file) {
                    return await eleventyEngine.retrieveInclude(file);
                },
                existsSync() {
                    return true
                },
                async exists() {
                    return true
                },
                resolve(root, file, ext) {
                    return `${root}${file}`
                }
            }
        });
    }

    async retrieveInclude(file) {
        let content;
        if (/_bookshop_include_/.test(file)) {
            content = this.getShared(file.replace(/^.*_bookshop_include_/, ""));
        } else if (/_bookshop_/.test(file)) {
            content = this.getComponent(file.replace(/^.*_bookshop_/, ""));
        } else {
            content = this.files?.[file];
        }
        if (!content && content !== "") {
            console.warn(`[eleventy-engine] No file found for ${file}`);
            return "";
        }
        return translateLiquid(content);
    }

    applyLiquidPlugins() {
        this.plugins.forEach(plugin => {
            this.liquid.plugin(plugin);
        });
    }

    getShared(name) {
        const key = `shared/eleventy/${name}.eleventy.liquid`
        return this.files?.[key];
    }

    getComponentKey(name) {
        const base = name.split("/").reverse()[0];
        return `components/${name}/${base}.eleventy.liquid`;
    }

    getComponent(name) {
        const key = this.getComponentKey(name);
        return this.files?.[key];
    }

    hasComponent(name) {
        const key = this.getComponentKey(name);
        return !!this.files?.[key];
    }

    resolveComponentType(name) {
        if (this.getComponent(name)) return 'component';
        if (this.getShared(name)) return 'shared';
        return false;
    }

    // TODO: memoize parts of this that are expensive
    injectInfo(props) {
        return {
            collections: this.precomputed_collections,
            ...(this.info.data || {}),
            ...props,
            env_bookshop_live: true,
        };
    }

    async storeMeta(meta = {}) {
        this.meta.pathPrefix = meta.pathPrefix ? await this.eval(meta.pathPrefix) : undefined;
    }

    async storeInfo(info = {}) {
        this.info = info;

        const collections = this.info.collections || {};
        collections["all"] = [];
        for (const [key, val] of Object.entries(collections)) {
            collections[key] = val.map(item => {
                return {
                    inputPath: item.path, // Maybe not relative to the right location
                    outputPath: item.path, // Not correct
                    fileSlug: item.url.replace(/(\/|\.[^\/]+)$/, '').replace(/^.+([^\/]+)$/, '').toLowerCase(), // Not correct
                    url: item.url,
                    date: item.date ? new Date(item.date) : new Date(),
                    templateContent: "Content is not available when live editing",
                    data: item
                }
            });

            collections["all"] = [...collections["all"], ...collections[key]];
        }

        this.precomputed_collections = collections;
    }

    async render(target, name, props, globals, logger) {
        let source = this.getComponent(name);
        // TODO: Remove the below check and update the live comments to denote shared
        if (!source) source = this.getShared(name);
        if (!source) {
            console.warn(`[eleventy-engine] No component found for ${name}`);
            return "";
        }
        logger?.log?.(`Going to render ${name}, with source:`);
        logger?.log?.(source);
        source = translateLiquid(source);
        logger?.log?.(`Rewritten the template for ${name} to:`);
        logger?.log?.(source);
        if (!globals || typeof globals !== "object") globals = {};
        props = this.injectInfo({ ...globals, ...props });
        target.innerHTML = await this.liquid.parseAndRender(source || "", props);
        logger?.log?.(`Rendered ${name} as:`);
        logger?.log?.(target.innerHTML);
    }

    async eval(str, props = {}) {
        try {
            // Template values might have been parenthesised for parsing, 
            // so we remove outer parentheses.
            if (/^\([\s\S]+\)$/.test(str)) {
                str = str.replace(/^\(|\)$/g, '');
            }
            str = str.replace(/\n/g, ''); // TODO: Are there any cases where this breaks the eval?
            const ctx = new Context();
            ctx.push(this.injectInfo({}));
            if (Array.isArray(props)) {
                props.forEach(p => ctx.push(p));
            } else {
                ctx.push(props);
            }
            const [, value, index] = str.match(/^(.*?)(?:\[(\d+)\])?$/);
            let result = await this.liquid.evalValue(value, ctx);
            if (index && typeof result === 'object' && !Array.isArray(result)) {
                result = Object.entries(result);
            }
            return index ? result?.[index] : result;
        } catch (e) {
            console.warn(`Error evaluating \`${str}\` in the Eleventy engine`, e.toString());
            return '';
        }
    }

    loader() {
        // esbuild loader if required
    }
}
