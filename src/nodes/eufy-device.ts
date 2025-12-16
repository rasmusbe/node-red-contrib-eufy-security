/**
 * Eufy Device Action Node
 *
 * Sends commands to Eufy devices (snooze, get properties, etc.)
 * Device and action can be configured in node or overridden via msg.payload
 */

import type { PropertyValue } from "eufy-security-client";
import type { Node, NodeAPI, NodeDef, NodeMessage } from "node-red";
import type { EufyConfigNode } from "./eufy-config";

interface EufyDeviceNodeDef extends NodeDef {
  config: string;
  device: string;
  station: string;
  targetType: "device" | "station";
  action: string;
  property?: string;
  customProperty?: string;
  propertyValue?: string;
  panTiltDirection?: string;
  panTiltSpeed?: string;
}

interface EufyDeviceNode extends Node {
  config: string;
  device: string;
  station: string;
  targetType: "device" | "station";
  action: string;
  property?: string;
  customProperty?: string;
  propertyValue?: string;
  panTiltDirection?: string;
  panTiltSpeed?: string;
  configNode: EufyConfigNode | null;
}

interface DeviceActionPayload {
  device?: string;
  station?: string;
  targetType?: "device" | "station";
  action?: string;
  options?: {
    duration?: number;
    property?: string;
    customProperty?: string;
    value?: unknown;
    direction?: string;
    speed?: number;
    [key: string]: unknown;
  };
}

interface OutputMessage extends NodeMessage {
  payload: {
    success: boolean;
    action: string;
    device?: string;
    station?: string;
    target?: string;
    targetType?: "device" | "station";
    result?: unknown;
    error?: string;
  };
}

type ActionType =
  | "snooze"
  | "unsnooze"
  | "getProperties"
  | "getProperty"
  | "setProperty"
  | "panTilt"
  | "setPanTiltSpeed";

export default function (Red: NodeAPI): void {
  function EufyDeviceNodeConstructor(
    this: EufyDeviceNode,
    config: EufyDeviceNodeDef
  ): void {
    Red.nodes.createNode(this, config);

    this.config = config.config;
    this.device = config.device;
    this.station = config.station;
    this.targetType = config.targetType || "device";
    this.action = config.action;
    this.property = config.property;
    this.customProperty = config.customProperty;
    this.propertyValue = config.propertyValue;
    this.panTiltDirection = config.panTiltDirection;
    this.panTiltSpeed = config.panTiltSpeed;
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

        // Get target (device/station) and action from payload or node config
        const payload = (msg.payload || {}) as DeviceActionPayload;
        const targetType = payload.targetType || this.targetType;
        const deviceSerial = payload.device || this.device;
        const stationSerial = payload.station || this.station;
        const targetSerial =
          targetType === "station" ? stationSerial : deviceSerial;
        const action = (payload.action || this.action) as ActionType;
        const options = payload.options || {};

        if (!targetSerial) {
          throw new Error(
            targetType === "station"
              ? "No station specified"
              : "No device specified"
          );
        }

        if (!action) {
          throw new Error("No action specified");
        }

        this.status({ fill: "blue", shape: "dot", text: `${action}...` });

        let result: unknown;
        let success = true;

        switch (action) {
          case "snooze": {
            if (targetType === "station") {
              throw new Error("Snooze is only available for devices");
            }
            const duration = options.duration || 7200; // Default 2 hours
            success = await client.setSnooze(deviceSerial, duration);
            result = { snoozed: true, duration };
            break;
          }

          case "unsnooze": {
            if (targetType === "station") {
              throw new Error("Unsnooze is only available for devices");
            }
            success = await client.setSnooze(deviceSerial, 0);
            result = { snoozed: false };
            break;
          }

          case "getProperties": {
            if (targetType === "station") {
              const properties =
                await client.getStationProperties(stationSerial);
              result = properties;
            } else {
              const properties = await client.getDeviceProperties(deviceSerial);
              result = properties;
            }
            break;
          }

          case "getProperty": {
            // Get property from options or node config
            let propertyName = (options.property as string) || this.property;
            if (!propertyName) {
              throw new Error(
                "Property name required in options.property or node config"
              );
            }
            // Use custom property if property is set to __CUSTOM__
            if (propertyName === "__CUSTOM__") {
              propertyName =
                (options.customProperty as string) || this.customProperty;
              if (!propertyName) {
                throw new Error("Custom property name required");
              }
            }
            if (targetType === "station") {
              const propertyValue = await client.getStationProperty(
                stationSerial,
                propertyName
              );
              result = { property: propertyName, value: propertyValue };
            } else {
              const propertyValue = await client.getDeviceProperty(
                deviceSerial,
                propertyName
              );
              result = { property: propertyName, value: propertyValue };
            }
            break;
          }

          case "setProperty": {
            // Get property from options or node config
            let propertyName = (options.property as string) || this.property;
            let propertyValue = options.value;

            // If value not in options, try to parse from node config
            if (propertyValue === undefined && this.propertyValue) {
              const valueStr = this.propertyValue.trim();
              // Try to parse as boolean
              if (valueStr === "true") {
                propertyValue = true;
              } else if (valueStr === "false") {
                propertyValue = false;
              } else if (valueStr === "") {
                propertyValue = "";
              } else {
                const numValue = Number(valueStr);
                // Try to parse as number if it's a valid number
                if (!Number.isNaN(numValue) && valueStr !== "") {
                  propertyValue = numValue;
                } else {
                  // Use as string
                  propertyValue = valueStr;
                }
              }
            }

            if (!propertyName) {
              throw new Error(
                "Property name required in options.property or node config"
              );
            }
            // Use custom property if property is set to __CUSTOM__
            if (propertyName === "__CUSTOM__") {
              propertyName =
                (options.customProperty as string) || this.customProperty;
              if (!propertyName) {
                throw new Error("Custom property name required");
              }
            }
            if (propertyValue === undefined || propertyValue === null) {
              throw new Error(
                "Property value required in options.value or node config"
              );
            }
            if (targetType === "station") {
              success = await client.setStationProperty(
                stationSerial,
                propertyName,
                propertyValue as PropertyValue
              );
            } else {
              success = await client.setDeviceProperty(
                deviceSerial,
                propertyName,
                propertyValue as PropertyValue
              );
            }
            result = {
              property: propertyName,
              value: propertyValue,
              success,
            };
            break;
          }

          case "panTilt": {
            if (targetType === "station") {
              throw new Error("Pan/Tilt is only available for devices");
            }
            const direction =
              (options.direction as string) || this.panTiltDirection;
            if (!direction) {
              throw new Error(
                "Direction required in options.direction or node config (LEFT, RIGHT, UP, DOWN, ROTATE360)"
              );
            }
            const command = (options.command as number) || undefined;
            success = await client.panAndTilt(deviceSerial, direction, command);
            result = { direction, command, success };
            break;
          }

          case "setPanTiltSpeed": {
            if (targetType === "station") {
              throw new Error("Pan/Tilt speed is only available for devices");
            }
            let speed = options.speed as number;
            // Try to get from node config if not in options
            if (speed === undefined && this.panTiltSpeed) {
              const speedStr = this.panTiltSpeed.trim();
              const numSpeed = Number(speedStr);
              if (!Number.isNaN(numSpeed)) {
                speed = numSpeed;
              }
            }
            if (speed === undefined || speed === null) {
              throw new Error("Speed required in options.speed or node config");
            }
            success = await client.setPanAndTiltRotationSpeed(
              deviceSerial,
              speed
            );
            result = { speed, success };
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
            device: targetType === "device" ? targetSerial : undefined,
            station: targetType === "station" ? targetSerial : undefined,
            target: targetSerial,
            targetType,
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

        const payload = (msg.payload || {}) as DeviceActionPayload;
        const targetType = payload.targetType || this.targetType;
        const deviceSerial = payload.device || this.device;
        const stationSerial = payload.station || this.station;
        const targetSerial =
          targetType === "station" ? stationSerial : deviceSerial;

        const output: OutputMessage = {
          ...msg,
          payload: {
            success: false,
            action: payload.action || this.action,
            device: targetType === "device" ? targetSerial : undefined,
            station: targetType === "station" ? targetSerial : undefined,
            target: targetSerial,
            targetType,
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
