/**
 * Internal environment variables manager.
 *
 * Instantiation of EnvManager class will make a global variable `env` available
 * This class is recommended to globally available, as it can be instantiated
 * only once.
 * EnvManager.get() or EnvManager.set() allow manipulation of `env` object.
 * Environment variables of runtime (deno, node, worker) can be loaded via
 * EnvManager.loadEnv().
 *
 * @license
 * Copyright (c) 2021 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * "internal-name": is mapped to a runtime (deno | node | worker) specific
 * variable name. Right hand side can be a string (variable named the same on
 * all runtimes) or an object which can give it different names on different
 * runtimes or / and specify a type, if not string.
 */
const _ENV_VAR_MAPPINGS = {
  runTime: {
    name: "RUNTIME",
    type: "string",
    // no defaults, since it is set programmatically
  },
  runTimeEnv: {
    name: {
      worker: "WORKER_ENV",
      node: "NODE_ENV",
      deno: "DENO_ENV",
    },
    type: "string",
    default: {
      worker: "development",
      node: "development",
      deno: "development",
    },
  },
  cloudPlatform: {
    name: "CLOUD_PLATFORM",
    type: "string",
    // for local setups, platform is assumed to be fly.io since
    // the fly-vm is pretty close to a typical dev box setup
    default: "fly",
  },
  logLevel: {
    name: "LOG_LEVEL",
    type: "string",
    default: "debug",
  },
  blocklistUrl: {
    name: "CF_BLOCKLIST_URL",
    type: "string",
    default: "https://dist.rethinkdns.com/blocklists/",
  },
  latestTimestamp: {
    name: "CF_LATEST_BLOCKLIST_TIMESTAMP",
    type: "string",
    default: "1638959365361",
  },
  dnsResolverUrl: {
    name: "CF_DNS_RESOLVER_URL",
    type: "string",
    default: "https://cloudflare-dns.com/dns-query",
  },
  secondaryDohResolver: {
    name: "CF_DNS_RESOLVER_URL_2",
    type: "string",
    default: "https://dns.google/dns-query",
  },
  workerTimeout: {
    name: "WORKER_TIMEOUT",
    type: "number",
    default: "10000", // 10s
  },
  fetchTimeout: {
    name: "CF_BLOCKLIST_DOWNLOAD_TIMEOUT",
    type: "number",
    default: "5000", // 5s
  },
  tdNodecount: {
    name: "TD_NODE_COUNT",
    type: "number",
    default: "42112224",
  },
  tdParts: {
    name: "TD_PARTS",
    type: "number",
    default: "2",
  },
  cacheTtl: {
    name: "CACHE_TTL",
    type: "number",
    default: "1800",
  },
};

/**
 * Get runtime specific environment variables.
 * @param {String} runtime - Runtime name (deno, node, worker).
 * @return {Object} Runtime environment variables.
 */
function _getRuntimeEnv(runtime) {
  console.info("Loading env. from runtime:", runtime);

  const env = {};
  for (const [key, mappedKey] of Object.entries(_ENV_VAR_MAPPINGS)) {
    let name = null;
    let type = null;
    let val = null;

    if (typeof mappedKey !== "object") continue;

    if (typeof mappedKey.name === "object") {
      name = mappedKey.name[runtime];
    } else {
      name = mappedKey.name;
    }
    if (typeof mappedKey.default === "object") {
      val = mappedKey.default[runtime];
    } else {
      val = mappedKey.default;
    }

    type = mappedKey.type;

    if (!type) {
      console.debug(runtime, "untyped env mapping:", key, mappedKey);
      continue;
    }

    // Read environment variable
    if (runtime === "node") env[key] = process.env[name];
    else if (runtime === "deno") env[key] = name && Deno.env.get(name);
    else if (runtime === "worker") env[key] = globalThis[name];
    else throw new Error(`unsupported runtime: ${runtime}`);

    // assign default value when user-defined value is missing
    if (env[key] == null && val != null) {
      console.warn(key, "env[key] default value:", val);
      env[key] = val;
    }

    // env vars are strings by default, type cast as specified
    if (type === "boolean") env[key] = env[key] === "true";
    else if (type === "number") env[key] = Number(env[key]);
    else if (type === "string") env[key] = env[key] || "";
    else throw new Error(`unsupported type: ${type}`);

    console.debug("Added", key, env[key]);
  }

  return env;
}

function _determineRuntime() {
  if (typeof Deno !== "undefined") {
    return Deno.env.get("RUNTIME") || "deno";
  }

  if (typeof process !== "undefined") {
    // process also exists in Workers, where RUNTIME is defined
    if (globalThis.RUNTIME) return globalThis.RUNTIME;
    if (process.env) return process.env.RUNTIME || "node";
  }

  return null;
}

export default class EnvManager {
  /**
   * Initializes the env manager.
   */
  constructor() {
    this.runtime = _determineRuntime();
    this.envMap = new Map();
    this.load();
  }

  /**
   * Loads env variables from runtime env. and is made globally available
   * through `env` namespace. Existing env variables will be overwritten.
   */
  load() {
    const renv = _getRuntimeEnv(this.runtime);

    // On deno deploy, env variables can not be modified during execution,
    // so, Deno.env.get("RUNTIME") may return null, if programmatically set.
    if (this.runtime === "deno" && !renv.runTime) {
      renv.runTime = "deno";
      console.debug("Added", "runTime", renv.runTime);
    }

    globalThis.env = renv; // global `env` namespace.

    for (const [k, v] of Object.entries(renv)) {
      this.envMap.set(k, v);
    }

    console.debug("Env loaded: ", JSON.stringify(renv));
  }

  /**
   * @return {Map} - Map of env variables.
   */
  getMap() {
    return this.envMap;
  }

  /**
   * @return {Object} - Object of currently loaded env variables.
   */
  toObject() {
    return Object.fromEntries(this.envMap);
  }

  /**
   * @param {String} key - env variable name
   * @return {*} - env variable value
   */
  get(key) {
    const v = this.envMap.get(key);
    if (v) return v;

    if (this.runtime === "node") {
      return process.env[key];
    } else if (this.runtime === "deno") {
      return Deno.env.get(key);
    } else if (this.runtime === "worker") {
      return globalThis[key];
    }

    return null;
  }

  /**
   * @param {String} key - env variable name
   * @param {*} value - env variable value
   */
  set(key, value) {
    this.envMap.set(key, value);
    globalThis.env[key] = value;
  }
}
