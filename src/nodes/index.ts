/**
 * Node-RED Eufy Security Nodes
 *
 * Entry point that registers all nodes with Node-RED
 */

import type { NodeAPI } from "node-red";

// Import node modules
import eufyConfig from "./eufy-config";
import eufyDevice from "./eufy-device";
import eufyEvent from "./eufy-event";

export default function (Red: NodeAPI): void {
  // Register all nodes
  eufyConfig(Red);
  eufyDevice(Red);
  eufyEvent(Red);
}

// CommonJS compatibility for Node-RED
module.exports = (Red: NodeAPI): void => {
  eufyConfig(Red);
  eufyDevice(Red);
  eufyEvent(Red);
};
