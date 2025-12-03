/**
 * Eufy Event Listener Node
 *
 * Listens for events from Eufy devices (motion, person, crying, etc.)
 * Can filter by device and event type via config or runtime payload
 */

import type { Node, NodeAPI, NodeDef, NodeMessage } from "node-red";
import type { EufyEvent } from "../lib/eufy-client";
import type { EufyConfigNode } from "./eufy-config";

interface EufyEventNodeDef extends NodeDef {
  config: string;
  device: string;
  events: string[]; // Array of event types to listen for
}

interface EufyEventNode extends Node {
  config: string;
  device: string;
  events: string[];
  configNode: EufyConfigNode | null;
  runtimeFilter: {
    device?: string;
    events?: string[];
  };
}

interface EventOutputMessage extends NodeMessage {
  payload: EufyEvent;
  topic: string;
}

const ALL_EVENTS = [
  "motion",
  "personDetected",
  "petDetected",
  "cryingDetected",
  "soundDetected",
  "rings",
  "propertyChanged",
];

export default function (Red: NodeAPI): void {
  function EufyEventNodeConstructor(
    this: EufyEventNode,
    config: EufyEventNodeDef
  ): void {
    Red.nodes.createNode(this, config);

    this.config = config.config;
    this.device = config.device;
    this.events = config.events || [];
    this.configNode = Red.nodes.getNode(config.config) as EufyConfigNode | null;
    this.runtimeFilter = {};

    if (!this.configNode) {
      this.status({ fill: "red", shape: "ring", text: "not configured" });
      return;
    }

    // Update status based on connection
    const updateStatus = () => {
      const status = this.configNode?.getStatus();
      if (status?.connected) {
        const eventCount = this.events.length || ALL_EVENTS.length;
        this.status({
          fill: "green",
          shape: "dot",
          text: `listening (${eventCount} events)`,
        });
      } else {
        this.status({ fill: "yellow", shape: "ring", text: "connecting..." });
      }
    };

    updateStatus();

    // Event handler
    const handleEvent = (event: EufyEvent) => {
      // Apply filters
      const filterDevice = this.runtimeFilter.device || this.device;
      const filterEvents = this.runtimeFilter.events || this.events;

      // Check device filter
      if (filterDevice && event.device !== filterDevice) {
        return;
      }

      // Check event type filter
      if (filterEvents.length > 0 && !filterEvents.includes(event.event)) {
        return;
      }

      // Create output message
      const msg: EventOutputMessage = {
        payload: event,
        topic: `eufy/${event.device}/${event.event}`,
      };

      this.send(msg);

      // Update status briefly
      this.status({ fill: "blue", shape: "dot", text: event.event });
      setTimeout(updateStatus, 2000);
    };

    // Listen for device events
    if (this.configNode.client) {
      this.configNode.client.on("statusChanged", updateStatus);
      this.configNode.client.on("deviceEvent", handleEvent);
    }

    // Handle incoming messages for runtime filter override
    this.on("input", (msg: NodeMessage, _send, done) => {
      const payload = msg.payload as
        | { device?: string; events?: string[] }
        | undefined;

      if (payload) {
        if (payload.device !== undefined) {
          this.runtimeFilter.device = payload.device || undefined;
        }
        if (payload.events !== undefined) {
          this.runtimeFilter.events = payload.events;
        }

        const filterDesc = [];
        if (this.runtimeFilter.device) {
          filterDesc.push(`device: ${this.runtimeFilter.device}`);
        }
        if (this.runtimeFilter.events?.length) {
          filterDesc.push(`events: ${this.runtimeFilter.events.join(", ")}`);
        }

        if (filterDesc.length > 0) {
          this.status({
            fill: "green",
            shape: "dot",
            text: `filter: ${filterDesc.join(", ")}`,
          });
        } else {
          updateStatus();
        }
      }

      if (done) done();
    });

    this.on("close", () => {
      if (this.configNode?.client) {
        this.configNode.client.off("statusChanged", updateStatus);
        this.configNode.client.off("deviceEvent", handleEvent);
      }
    });
  }

  Red.nodes.registerType("eufy-event", EufyEventNodeConstructor);
}
