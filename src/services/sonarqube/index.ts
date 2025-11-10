import { TOOLS, createExecutor } from "./tools/index.js";
import { validateConfig } from "./config.js";

// Validate config on module load
validateConfig();

export default {
  tools: TOOLS,
  createExecutor,
};
