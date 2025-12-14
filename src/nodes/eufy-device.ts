/**
 * Eufy Device Action Node
 *
 * Sends commands to Eufy devices (snooze, get properties, etc.)
 * Device and action can be configured in node or overridden via msg.payload
 */

import type { Node, NodeAPI, NodeDef, NodeMessage } from "node-red";
import { PropertyName } from "../lib/eufy-client";
import type { EufyConfigNode } from "./eufy-config";

interface EufyDeviceNodeDef extends NodeDef {
  config: string;
  device: string;
  action: string;
}

interface EufyDeviceNode extends Node {
  config: string;
  device: string;
  action: string;
  configNode: EufyConfigNode | null;
}

interface DeviceActionPayload {
  device?: string;
  action?: string;
  options?: {
    duration?: number;
    [key: string]: unknown;
  };
}

interface OutputMessage extends NodeMessage {
  payload: {
    success: boolean;
    action: string;
    device: string;
    result?: unknown;
    error?: string;
  };
}

type ActionType =
  | "snooze"
  | "unsnooze"
  | "getProperties"
  | "enableNotificationCrying"
  | "disableNotificationCrying";

export default function (Red: NodeAPI): void {
  function EufyDeviceNodeConstructor(
    this: EufyDeviceNode,
    config: EufyDeviceNodeDef
  ): void {
    Red.nodes.createNode(this, config);

    this.config = config.config;
    this.device = config.device;
    this.action = config.action;
    this.configNode = Red.nodes.getNode(config.config) as EufyConfigNode | null;

    if (!this.configNode) {
      this.status({ fill: "red", shape: "ring", text: "not configured" });
      return;
    }

    // Update status based on connection
    const updateStatus = () => {
      const status = this.configNode?.getStatus();
      if (status?.connected) {
        this.status({ fill: "green", shape: "dot", text: "connected" });
      } else {
        this.status({ fill: "yellow", shape: "ring", text: "connecting..." });
      }
    };

    updateStatus();

    // Listen for status changes
    if (this.configNode.client) {
      this.configNode.client.on("statusChanged", updateStatus);
    }

    // Handle incoming messages
    this.on("input", async (msg: NodeMessage, send, done) => {
      try {
        const client = this.configNode?.getClient();
        if (!client?.isConnected()) {
          throw new Error("Not connected to Eufy Security");
        }

        // Get device and action from payload or node config
        const payload = (msg.payload || {}) as DeviceActionPayload;
        const deviceSerial = payload.device || this.device;
        const action = (payload.action || this.action) as ActionType;
        const options = payload.options || {};

        if (!deviceSerial) {
          throw new Error("No device specified");
        }

        if (!action) {
          throw new Error("No action specified");
        }

        this.status({ fill: "blue", shape: "dot", text: `${action}...` });

        let result: unknown;
        let success = true;

        switch (action) {
          case "snooze": {
            const duration = options.duration || 7200; // Default 2 hours
            success = await client.setSnooze(deviceSerial, duration);
            result = { snoozed: true, duration };
            break;
          }

          case "unsnooze": {
            success = await client.setSnooze(deviceSerial, 0);
            result = { snoozed: false };
            break;
          }

          case "getProperties": {
            const properties = await client.getDeviceProperties(deviceSerial);
            result = properties;
            break;
          }

          case "enableNotificationCrying": {
            success = await client.setDeviceProperty(
              deviceSerial,
              PropertyName.DeviceNotificationCrying,
              true
            );
            result = { notificationCrying: true };
            break;
          }

          case "disableNotificationCrying": {
            success = await client.setDeviceProperty(
              deviceSerial,
              PropertyName.DeviceNotificationCrying,
              false
            );
            result = { notificationCrying: false };
            break;
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }

        const output: OutputMessage = {
          ...msg,
          payload: {
            success,
            action,
            device: deviceSerial,
            result,
          },
        };

        send(output);
        this.status({
          fill: "green",
          shape: "dot",
          text: success ? "success" : "failed",
        });

        // Reset status after a delay
        setTimeout(updateStatus, 3000);

        if (done) done();
      } catch (err) {
        const error = err as Error;
        this.status({ fill: "red", shape: "dot", text: error.message });

        const output: OutputMessage = {
          ...msg,
          payload: {
            success: false,
            action: (msg.payload as DeviceActionPayload)?.action || this.action,
            device: (msg.payload as DeviceActionPayload)?.device || this.device,
            error: error.message,
          },
        };

        send(output);

        if (done) {
          done(error);
        } else {
          this.error(error.message, msg);
        }
      }
    });

    this.on("close", () => {
      if (this.configNode?.client) {
        this.configNode.client.off("statusChanged", updateStatus);
      }
    });
  }

  Red.nodes.registerType("eufy-device", EufyDeviceNodeConstructor);
}
