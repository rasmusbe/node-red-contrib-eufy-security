/**
 * Eufy Security Config Node
 *
 * Handles credentials, connection management, and persistent data.
 * Provides HTTP endpoints for device discovery.
 */

import type { Node, NodeAPI, NodeDef } from "node-red";
import {
  ConnectionStatus,
  DeviceInfo,
  EufyClientConfig,
  EufyClientManager,
  StationInfo,
} from "../lib/eufy-client";

interface EufyConfigNodeDef extends NodeDef {
  username: string;
  country: string;
}

interface EufyConfigCredentials {
  username: string;
  password: string;
}

export interface EufyConfigNode extends Node<EufyConfigCredentials> {
  username: string;
  country: string;
  client: EufyClientManager | null;
  getClient(): EufyClientManager;
  getDevices(): Promise<DeviceInfo[]>;
  getStations(): Promise<StationInfo[]>;
  getStatus(): ConnectionStatus;
}

export default function (Red: NodeAPI): void {
  function EufyConfigNodeConstructor(
    this: EufyConfigNode,
    config: EufyConfigNodeDef
  ): void {
    Red.nodes.createNode(this, config);

    this.username = this.credentials?.username || config.username;
    this.country = config.country || "US";
    this.client = null;

    // Get persistent directory from Node-RED settings
    const userDir = Red.settings.userDir || process.cwd();

    // Initialize client
    const clientConfig: EufyClientConfig = {
      configId: this.id,
      username: this.credentials?.username || "",
      password: this.credentials?.password || "",
      country: this.country,
      persistentDir: userDir,
    };

    if (clientConfig.username && clientConfig.password) {
      this.client = EufyClientManager.getInstance(clientConfig);

      // Set up event handlers
      this.client.on("connected", () => {
        this.log("Connected to Eufy Security");
      });

      this.client.on("error", (error: Error) => {
        this.error(`Connection error: ${error.message}`);
      });

      this.client.on("tfaRequired", () => {
        this.warn(
          "2FA verification required - use the config node UI to enter code"
        );
      });

      this.client.on("captchaRequired", () => {
        this.warn("Captcha required - use the config node UI to solve");
      });

      // Auto-connect
      this.client.connect().catch((err: Error) => {
        this.error(`Failed to connect: ${err.message}`);
      });
    }

    // Methods for other nodes to use
    this.getClient = (): EufyClientManager => {
      if (!this.client) {
        throw new Error("Eufy client not configured");
      }
      return this.client;
    };

    this.getDevices = async (): Promise<DeviceInfo[]> => {
      if (!this.client?.isConnected()) {
        return [];
      }
      return this.client.getDevices();
    };

    this.getStations = async (): Promise<StationInfo[]> => {
      if (!this.client?.isConnected()) {
        return [];
      }
      return this.client.getStations();
    };

    this.getStatus = (): ConnectionStatus => {
      if (!this.client) {
        return {
          connected: false,
          cloudConnected: false,
          pushConnected: false,
          stations: [],
          error: "Not configured",
        };
      }
      return this.client.getStatus();
    };

    // Cleanup on close
    this.on("close", (done: () => void) => {
      if (this.client) {
        EufyClientManager.removeInstance(this.id);
        this.client = null;
      }
      done();
    });
  }

  Red.nodes.registerType("eufy-config", EufyConfigNodeConstructor, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" },
    },
  });

  // HTTP Admin API endpoints

  // Get devices for dropdown
  Red.httpAdmin.get("/eufy-security/devices/:configId", async (req, res) => {
    try {
      const configNode = Red.nodes.getNode(
        req.params.configId
      ) as EufyConfigNode;
      if (!configNode) {
        res.status(404).json({ error: "Config node not found" });
        return;
      }

      const devices = await configNode.getDevices();
      res.json(devices);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get stations for dropdown
  Red.httpAdmin.get("/eufy-security/stations/:configId", async (req, res) => {
    try {
      const configNode = Red.nodes.getNode(
        req.params.configId
      ) as EufyConfigNode;
      if (!configNode) {
        res.status(404).json({ error: "Config node not found" });
        return;
      }

      const stations = await configNode.getStations();
      res.json(stations);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get connection status
  Red.httpAdmin.get("/eufy-security/status/:configId", (req, res) => {
    try {
      const configNode = Red.nodes.getNode(
        req.params.configId
      ) as EufyConfigNode;
      if (!configNode) {
        res.status(404).json({ error: "Config node not found" });
        return;
      }

      const status = configNode.getStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Submit 2FA code
  Red.httpAdmin.post(
    "/eufy-security/verify-2fa/:configId",
    async (req, res) => {
      try {
        const configNode = Red.nodes.getNode(
          req.params.configId
        ) as EufyConfigNode;
        if (!configNode?.client) {
          res.status(404).json({ error: "Config node not found" });
          return;
        }

        const { code } = req.body;
        await configNode.client.connectWith2FA(code);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  // Submit captcha solution
  Red.httpAdmin.post(
    "/eufy-security/verify-captcha/:configId",
    async (req, res) => {
      try {
        const configNode = Red.nodes.getNode(
          req.params.configId
        ) as EufyConfigNode;
        if (!configNode?.client) {
          res.status(404).json({ error: "Config node not found" });
          return;
        }

        const { captchaId, captchaCode } = req.body;
        await configNode.client.connectWithCaptcha(captchaId, captchaCode);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  // Reconnect
  Red.httpAdmin.post("/eufy-security/reconnect/:configId", async (req, res) => {
    try {
      const configNode = Red.nodes.getNode(
        req.params.configId
      ) as EufyConfigNode;
      if (!configNode?.client) {
        res.status(404).json({ error: "Config node not found" });
        return;
      }

      await configNode.client.connect();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get property names for dropdown
  Red.httpAdmin.get("/eufy-security/properties", (_req, res) => {
    try {
      const { PropertyName } = require("eufy-security-client");
      const deviceProperties = Object.keys(PropertyName)
        .filter((k) => k.startsWith("Device"))
        .sort();
      const stationProperties = Object.keys(PropertyName)
        .filter((k) => k.startsWith("Station"))
        .sort();
      res.json({
        device: deviceProperties,
        station: stationProperties,
        all: [...deviceProperties, ...stationProperties].sort(),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get supported properties for a specific device or station
  Red.httpAdmin.get(
    "/eufy-security/properties/:configId/:targetSerial",
    async (req, res) => {
      try {
        const configNode = Red.nodes.getNode(
          req.params.configId
        ) as EufyConfigNode;
        if (!configNode?.client) {
          res.status(404).json({ error: "Config node not found" });
          return;
        }

        const targetSerial = req.params.targetSerial;
        if (!targetSerial) {
          res.status(400).json({ error: "Device/Station serial required" });
          return;
        }

        // Try device first, then station
        try {
          const properties =
            await configNode.client.getDeviceSupportedProperties(targetSerial);
          res.json({ type: "device", properties });
        } catch {
          try {
            const properties =
              await configNode.client.getStationSupportedProperties(
                targetSerial
              );
            res.json({ type: "station", properties });
          } catch {
            res.status(404).json({
              error: `Device or station ${targetSerial} not found`,
            });
          }
        }
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );
}
