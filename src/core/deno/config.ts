import { config as dotEnvConfig } from "dotenv";
import * as system from "../../system.js";
import Log from "../log.js";
import EnvManager from "../env.js";

// In global scope.
declare global {
  // TypeScript must know type of every var / property. Extend Window
  // (globalThis) with declaration merging (archive.is/YUWh2) to define types
  // Ref: www.typescriptlang.org/docs/handbook/declaration-merging.html
  interface Window {
    envManager?: EnvManager;
    log?: Log;
    env?: any;
  }
}

((main) => {
  system.when("prepare").then(setup);
})();

function setup() {
  if (!Deno) throw new Error("failed loading deno-specific config");

  const isProd = Deno.env.get("DENO_ENV") === "production";

  // Load env variables from .env file to Deno.env (if file exists)
  try {
    dotEnvConfig({ export: true });
  } catch (e) {
    // throws without --allow-read flag
    console.warn(".env missing => ", e.name, e.message);
  }

  try {
    // override: if we are running this file, then we're on Deno
    Deno.env.set("RUNTIME", "deno");
  } catch (e) {
    // Warning: `set()` method is not available in Deno deploy.
    console.warn("Deno.env.set() => ", e.name, e.message);
  }

  window.envManager = new EnvManager();

  window.log = new Log(
    window.env.logLevel,
    isProd // set console level only in prod.
  );

  system.pub("ready");
}
