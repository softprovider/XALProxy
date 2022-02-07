//= Functions & Modules
// Others
import { XALProxyModule } from '@softprovider/xalproxy-modules-utils';

//= Structures & Data
// Others
import { XALProxyPathConfig, XALProxyDataHandlerResult, XALProxyOnDataHandler } from '@softprovider/xalproxy-modules-utils';

/**
 * The XALProxy class
 * @class
 */
export default class XALProxy {
    /**
     * Array holding all the modules
     * @private
     * 
     * @type {XALProxyModule[]}
     */
    private modules: XALProxyModule[];

    /**
     * Object for finding the index of a module, where the key is the module name
     * @private
     * 
     * @type { { key: [string]: number } }
     */
    private modulesByName: { [key: string]: number };

    /**
     * All the paths configured as an object where the key is the name of the path and the value is an object 
     * containing the module index and the onData handler
     * @private
     * 
     * @type { { [key: string]: { moduleIndex: number; onData: (data: any) => Promise<void> } } }
     */
    private paths: { [key: string]: { moduleIndex: number; onData: XALProxyOnDataHandler } };

    /**
     * Load a configuration into the proxy class and creates all the paths and set all the modules.
     * The modules used in the given config must exists before calling this function.
     * @public
     * 
     * @param { { [key: string]: any } } config The configuration to load
     */
    public setConfig(config: { [key: string]: any }) {
        const configKeys: string[] = Object.keys(config);
        for (const module of this.modules) {
            if (config[module.name]) {
                module.setGlobalConfig(config[module.name]);
                configKeys.splice(configKeys.indexOf(module.name), 1);
            }
        }

        for (const path of configKeys) {
            if (!this.setPath(path, config[path])) {
            }
        }
    }

    /**
     * Manually create a path to be proxied
     * @public
     *
     * @param {string} path The path
     * @param {XALProxyPathConfig} config The config of the path
     *
     * @returns {boolean} if the path was successfully added
     */
    public setPath(path: string, config: XALProxyPathConfig): boolean {
        for (const module of this.modules) {
            if (module.isPathFromThisModule(path)) {
                const moduleIndex = this.modulesByName[module.name];

                this.paths[path] = {
                    moduleIndex: moduleIndex,
                    onData: this.createOnDataHandler(path, config),
                };

                module.listenForData(path, config[path], this.paths[path].onData);

                return true;
            }
        }

        return false;
    }

    /**
     * Creates a onData handler for a specific path and configuration
     * @public
     *
     * @param {string} path The path
     * @param {XALProxyPathConfig} pathConfig The path configuration
     *
     * @return {XALProxyOnDataHandler} the onData handler for the given path and config 
     */
    public createOnDataHandler(path: string, pathConfig: XALProxyPathConfig): XALProxyOnDataHandler {
        const handlers: ((data: any) => Promise<XALProxyDataHandlerResult>)[] = [];
        if (pathConfig.send_to?.length) {
            for (let i = 0, length = pathConfig.send_to.length; i < length; ++i) {
                const sendToConfig = pathConfig.send_to[i];

                if (!sendToConfig.module) {
                    console.error(`send_to[${i}] of path "${path}" is missing 'module' entry. Skipping...`);
                    continue;
                }

                const sendToModuleIndex = this.modulesByName[sendToConfig.module];

                if (sendToModuleIndex == null) {
                    console.error(
                        `send_to[${i}] of path "${path}" requires the module "${sendToConfig.module}" which cannot be found. Skipping...`
                    );
                    continue;
                }

                handlers.push(this.modules[sendToModuleIndex].createProxyDataHandler(sendToConfig));
            }
        } else {
            console.warn(`Path ${path} doesn't have any 'send_to' array or is empty.`);
            return async () => { return []; };
        }

        return async (data: any) => {
            const promises = await Promise.allSettled(handlers.map((handler) => handler(data)));

            const results: any[] = [];
            for (const promise of promises) {
                if (promise.status == 'rejected') {
                    console.warn(`A send_to of path "${path}" has failed with reason: ${promise.reason}`);
                } else {
                    results.push(promise.value);
                }
            }

            return results;
        };
    }

    /**
     * Add or replace a module to the proxy class
     * @public
     *
     * @param {XALProxyModule} module The module to be added or replaced
     */
    public setModule(module: XALProxyModule) {
        const index = this.modulesByName[module.name];

        if (index != null) this.modules[index] = module;
        else {
            this.modulesByName[module.name] = this.modules.length;
            this.modules.push(module);
        }
    }

    /**
     * Run the proxy
     * @async
     * @public
     */
    public async run() {
        return Promise.all(this.modules.map((module) => module.run()));
    }
}
