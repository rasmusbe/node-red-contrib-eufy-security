/**
 * Shared EufySecurity client manager
 *
 * Manages singleton instances of EufySecurity per config node.
 * Handles connection, reconnection, and persistent data storage.
 */

import { EventEmitter } from "node:events";
import {
  CommandResult,
  Device,
  EufySecurity,
  EufySecurityConfig,
  LogLevel,
  P2PConnectionType,
  PropertyName,
  PropertyValue,
  SnoozeDetail,
  Station,
} from "eufy-security-client";

export interface EufyClientConfig {
  configId: string;
  username: string;
  password: string;
  country: string;
  persistentDir: string;
}

export interface ConnectionStatus {
  connected: boolean;
  cloudConnected: boolean;
  pushConnected: boolean;
  stations: { serial: string; name: string; p2pConnected: boolean }[];
  error?: string;
}

export interface DeviceInfo {
  serial: string;
  name: string;
  model: string;
  type: number;
  stationSerial: string;
}

type EufyEventType =
  | "motion"
  | "personDetected"
  | "petDetected"
  | "cryingDetected"
  | "soundDetected"
  | "rings"
  | "propertyChanged";

export interface EufyEvent {
  event: EufyEventType;
  device: string;
  deviceName: string;
  value: unknown;
  timestamp: Date;
}

// Singleton instances per config
const instances: Map<string, EufyClientManager> = new Map();

export class EufyClientManager extends EventEmitter {
  private client: EufySecurity | null = null;
  private config: EufyClientConfig;
  private status: ConnectionStatus;
  private connecting: boolean = false;
  private stationReadyPromises: Map<
    string,
    { resolve: () => void; reject: (err: Error) => void }
  > = new Map();

  private constructor(config: EufyClientConfig) {
    super();
    this.config = config;
    this.status = {
      connected: false,
      cloudConnected: false,
      pushConnected: false,
      stations: [],
    };
  }

  /**
   * Get or create a client manager instance for the given config
   */
  static getInstance(config: EufyClientConfig): EufyClientManager {
    let instance = instances.get(config.configId);
    if (!instance) {
      instance = new EufyClientManager(config);
      instances.set(config.configId, instance);
    }
    return instance;
  }

  /**
   * Remove and close an instance
   */
  static removeInstance(configId: string): void {
    const instance = instances.get(configId);
    if (instance) {
      instance.close();
      instances.delete(configId);
    }
  }

  /**
   * Connect to Eufy Security
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      return;
    }

    if (this.client && this.status.connected) {
      return;
    }

    this.connecting = true;

    try {
      const eufyConfig: EufySecurityConfig = {
        username: this.config.username,
        password: this.config.password,
        country: this.config.country,
        language: "en",
        p2pConnectionSetup: P2PConnectionType.QUICKEST,
        pollingIntervalMinutes: 10,
        eventDurationSeconds: 10,
        persistentDir: this.config.persistentDir,
        logging: { level: LogLevel.Off },
      };

      this.client = await EufySecurity.initialize(eufyConfig);
      this.setupEventHandlers();

      // Start connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 30000);

        this.client?.once("connect", () => {
          clearTimeout(timeout);
          this.status.cloudConnected = true;
          this.status.connected = true;
          resolve();
        });

        this.client?.once("connection error", (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });

        this.client?.connect().catch(reject);
      });

      this.emit("connected");
    } catch (error) {
      this.status.error = (error as Error).message;
      this.emit("error", error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Connect with 2FA verification code
   */
  async connectWith2FA(code: string): Promise<void> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }
    await this.client.connect({ verifyCode: code, force: false });
  }

  /**
   * Connect with captcha solution
   */
  async connectWithCaptcha(
    captchaId: string,
    captchaCode: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }
    await this.client.connect({
      captcha: { captchaId, captchaCode },
      force: false,
    });
  }

  /**
   * Set up event handlers for the Eufy client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Connection events
    this.client.on("connect", () => {
      this.status.cloudConnected = true;
      this.status.connected = true;
      this.emit("statusChanged", this.status);
    });

    this.client.on("close", () => {
      this.status.connected = false;
      this.status.cloudConnected = false;
      this.emit("statusChanged", this.status);
    });

    this.client.on("push connect", () => {
      this.status.pushConnected = true;
      this.emit("statusChanged", this.status);
    });

    this.client.on("push close", () => {
      this.status.pushConnected = false;
      this.emit("statusChanged", this.status);
    });

    // 2FA/Captcha events
    this.client.on("tfa request", () => {
      this.emit("tfaRequired");
    });

    this.client.on("captcha request", (id: string, captcha: string) => {
      this.emit("captchaRequired", { id, captcha });
    });

    // Station events
    this.client.on("station connect", (station: Station) => {
      const stationInfo = {
        serial: station.getSerial(),
        name: station.getName(),
        p2pConnected: true,
      };

      const idx = this.status.stations.findIndex(
        (s) => s.serial === stationInfo.serial
      );
      if (idx >= 0) {
        this.status.stations[idx] = stationInfo;
      } else {
        this.status.stations.push(stationInfo);
      }

      // Resolve any pending station ready promises
      const pending = this.stationReadyPromises.get(stationInfo.serial);
      if (pending) {
        pending.resolve();
        this.stationReadyPromises.delete(stationInfo.serial);
      }

      this.emit("stationConnected", stationInfo);
      this.emit("statusChanged", this.status);
    });

    this.client.on("station close", (station: Station) => {
      const idx = this.status.stations.findIndex(
        (s) => s.serial === station.getSerial()
      );
      if (idx >= 0) {
        this.status.stations[idx].p2pConnected = false;
        this.emit("statusChanged", this.status);
      }
    });

    // Device events - emit as EufyEvent
    this.client.on(
      "device motion detected",
      (device: Device, state: boolean) => {
        if (state) {
          this.emitDeviceEvent("motion", device, state);
        }
      }
    );

    this.client.on(
      "device person detected",
      (device: Device, state: boolean, person: string) => {
        if (state) {
          this.emitDeviceEvent("personDetected", device, {
            detected: state,
            person,
          });
        }
      }
    );

    this.client.on("device pet detected", (device: Device, state: boolean) => {
      if (state) {
        this.emitDeviceEvent("petDetected", device, state);
      }
    });

    this.client.on(
      "device crying detected",
      (device: Device, state: boolean) => {
        if (state) {
          this.emitDeviceEvent("cryingDetected", device, state);
        }
      }
    );

    this.client.on(
      "device sound detected",
      (device: Device, state: boolean) => {
        if (state) {
          this.emitDeviceEvent("soundDetected", device, state);
        }
      }
    );

    this.client.on("device rings", (device: Device, state: boolean) => {
      if (state) {
        this.emitDeviceEvent("rings", device, state);
      }
    });

    this.client.on(
      "device property changed",
      (device: Device, name: string, value: PropertyValue) => {
        this.emitDeviceEvent("propertyChanged", device, {
          property: name,
          value,
        });
      }
    );
  }

  /**
   * Emit a device event
   */
  private emitDeviceEvent(
    event: EufyEventType,
    device: Device,
    value: unknown
  ): void {
    const eufyEvent: EufyEvent = {
      event,
      device: device.getSerial(),
      deviceName: device.getName(),
      value,
      timestamp: new Date(),
    };
    this.emit("deviceEvent", eufyEvent);
  }

  /**
   * Wait for a station to be P2P connected
   */
  async waitForStation(
    stationSerial: string,
    timeoutMs: number = 15000
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const station = await this.client.getStation(stationSerial);
    if (station.isConnected()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stationReadyPromises.delete(stationSerial);
        reject(new Error(`Station ${stationSerial} P2P connection timeout`));
      }, timeoutMs);

      this.stationReadyPromises.set(stationSerial, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
  }

  /**
   * Get all devices
   */
  async getDevices(): Promise<DeviceInfo[]> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const devices = await this.client.getDevices();
    return devices.map((d) => ({
      serial: d.getSerial(),
      name: d.getName(),
      model: d.getModel(),
      type: d.getDeviceType(),
      stationSerial: d.getStationSerial(),
    }));
  }

  /**
   * Get device properties
   */
  async getDeviceProperties(
    deviceSerial: string
  ): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const device = await this.client.getDevice(deviceSerial);
    return device.getProperties();
  }

  /**
   * Set snooze on a device
   */
  async setSnooze(
    deviceSerial: string,
    durationSeconds: number
  ): Promise<boolean> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const device = await this.client.getDevice(deviceSerial);
    const station = await this.client.getStation(device.getStationSerial());

    // Wait for P2P connection
    await this.waitForStation(device.getStationSerial());

    // Set up result listener
    const resultPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.client?.off("station command result", onResult);
        resolve(false);
      }, 10000);

      const onResult = (_station: Station, result: CommandResult) => {
        clearTimeout(timeout);
        this.client?.off("station command result", onResult);
        resolve(result.return_code === 0);
      };

      this.client?.on("station command result", onResult);
    });

    // Send command
    // biome-ignore lint/style/useNamingConvention: Need to match the underlying library's API
    const snoozeDetail: SnoozeDetail = { snooze_time: durationSeconds };
    station.snooze(device, snoozeDetail);

    return resultPromise;
  }

  /**
   * Get current status
   */
  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status.connected;
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.status.connected = false;
    this.status.cloudConnected = false;
    this.status.pushConnected = false;
    this.status.stations = [];
  }
}

export { Device, PropertyName, Station };
