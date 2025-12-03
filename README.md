# node-red-contrib-eufy-security

Node-RED nodes for integrating with Eufy Security devices. Control cameras, doorbells, and receive real-time event notifications.

## Features

- **Device Control**: Snooze notifications, enable/disable devices, get device properties
- **Event Listening**: Receive real-time events for motion, person detection, pet detection, crying detection, doorbell rings, and more
- **Dynamic Configuration**: Override device and action settings via message payload
- **Persistent Sessions**: Credentials and session data are stored securely, minimizing re-authentication

## Installation

### Via Node-RED Palette Manager

1. Open Node-RED
2. Go to Menu → Manage palette → Install
3. Search for `node-red-contrib-eufy-security`
4. Click Install

### Via npm

```bash
cd ~/.node-red
npm install node-red-contrib-eufy-security
```

### From Source (Development)

```bash
cd ~/.node-red
git clone https://github.com/bropat/eufy-security-client
cd eufy-security-client/nodered/node-red-contrib-eufy-security
bun install
bun run build
npm link
cd ~/.node-red
npm link node-red-contrib-eufy-security
```

## Nodes

### eufy-config

Configuration node for Eufy Security account credentials.

- Stores username, password, and country
- Handles 2FA authentication via the config UI
- Manages connection and reconnection automatically
- Session data is persisted to avoid frequent re-authentication

### eufy-device

Send commands to Eufy Security devices.

**Actions:**

- `snooze` - Snooze notifications (default 2 hours)
- `unsnooze` - Cancel snooze
- `getProperties` - Get all device properties
- `enable` - Enable the device
- `disable` - Disable the device

#### Example: Snooze a camera for 1 hour

```javascript
msg.payload = {
  device: "T8410P42233714DB",
  action: "snooze",
  options: { duration: 3600 }
};
return msg;
```

### eufy-event

Listen for events from Eufy Security devices.

**Event Types:**

- `motion` - Motion detected
- `personDetected` - Person detected
- `petDetected` - Pet detected
- `cryingDetected` - Baby crying detected
- `soundDetected` - Sound detected
- `rings` - Doorbell ring
- `propertyChanged` - Device property changed

**Output Format:**

```javascript
{
  event: "motion",
  device: "T8410P42233714DB",
  deviceName: "Front Door Camera",
  value: true,
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

## Quick Start

1. **Add a config node**: Drag an `eufy-device` or `eufy-event` node to your flow and double-click it. Click the pencil icon next to "Account" to add a new config.

2. **Enter credentials**: Fill in your Eufy Security email, password, and country. Click "Add".

3. **Deploy**: Click Deploy. The config node will connect to Eufy Security.

4. **Handle 2FA**: If your account has 2FA enabled, edit the config node again - you'll see a field to enter your 2FA code.

5. **Use the nodes**: Now you can send commands via `eufy-device` or receive events via `eufy-event`.

## Example Flows

### Toggle Snooze

```json
[
  {
    "id": "inject1",
    "type": "inject",
    "name": "Snooze 2h",
    "payload": "{\"action\":\"snooze\",\"options\":{\"duration\":7200}}",
    "payloadType": "json",
    "wires": [["device1"]]
  },
  {
    "id": "device1",
    "type": "eufy-device",
    "name": "Camera",
    "config": "config1",
    "device": "T8410P42233714DB",
    "wires": [["debug1"]]
  }
]
```

### Motion Alert to Telegram

```json
[
  {
    "id": "event1",
    "type": "eufy-event",
    "name": "Motion Events",
    "config": "config1",
    "events": ["motion", "personDetected"],
    "wires": [["telegram1"]]
  }
]
```

## Troubleshooting

### "Not connected" status

- Check your credentials are correct
- Ensure your Eufy account is active
- Try reconnecting via the config node

### 2FA not working

- Make sure you enter the code quickly (they expire)
- Check you're using the latest code from your authenticator app

### No events received

- Ensure the device is online and connected
- Check that the event types you want are selected in the event node
- The device needs to have the relevant detection features enabled in the Eufy app

## Requirements

- Node-RED >= 2.0.0
- Node.js >= 18.0.0

## Dependencies

- [eufy-security-client](https://github.com/bropat/eufy-security-client) - Eufy Security API client

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.
