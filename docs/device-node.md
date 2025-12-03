# eufy-device Node

The `eufy-device` node sends commands to Eufy Security devices such as cameras, doorbells, and sensors.

## Configuration

| Field | Description |
|-------|-------------|
| Name | Optional name for this node |
| Account | The eufy-config node to use |
| Device | Default device to control (can be overridden via payload) |
| Action | Default action to perform (can be overridden via payload) |

## Input

The node accepts messages with the following payload structure:

```javascript
{
  device: "T8410P42233714DB",  // Device serial (optional if set in config)
  action: "snooze",            // Action to perform (optional if set in config)
  options: {                   // Action-specific options (optional)
    duration: 3600
  }
}
```

### Priority

Settings are applied in this order (highest priority first):
1. `msg.payload.device` / `msg.payload.action`
2. Node configuration
3. Defaults

## Actions

### snooze

Snooze device notifications for a specified duration.

**Options:**
- `duration` - Snooze duration in seconds (default: 7200 = 2 hours)

**Example:**
```javascript
msg.payload = {
  action: "snooze",
  options: { duration: 3600 }  // 1 hour
};
```

### unsnooze

Cancel the snooze and resume notifications.

**Example:**
```javascript
msg.payload = {
  action: "unsnooze"
};
```

### getProperties

Get all properties of the device.

**Example:**
```javascript
msg.payload = {
  action: "getProperties"
};
```

**Output:**
```javascript
{
  success: true,
  action: "getProperties",
  device: "T8410P42233714DB",
  result: {
    name: "Front Door Camera",
    enabled: true,
    motionDetection: true,
    snooze: false,
    // ... many more properties
  }
}
```

### enable

Enable the device. (Coming soon)

### disable

Disable the device. (Coming soon)

## Output

The node outputs a message with the following structure:

```javascript
{
  payload: {
    success: true,           // Whether the action succeeded
    action: "snooze",        // The action that was performed
    device: "T8410P42233714DB",
    result: {                // Action-specific result data
      snoozed: true,
      duration: 3600
    }
  }
}
```

### Error Output

If the action fails:

```javascript
{
  payload: {
    success: false,
    action: "snooze",
    device: "T8410P42233714DB",
    error: "Device not found"
  }
}
```

## Node Status

The node displays its current status:

- 🟢 **connected** - Ready to send commands
- 🟡 **connecting...** - Waiting for connection
- 🔵 **snooze...** - Action in progress
- 🟢 **success** - Action completed successfully
- 🔴 **failed** - Action failed (check output for error)

## Examples

### Toggle Snooze with Inject Nodes

Create two inject nodes:
1. **Snooze On**: `{"action": "snooze", "options": {"duration": 7200}}`
2. **Snooze Off**: `{"action": "unsnooze"}`

Wire both to the eufy-device node.

### Dynamic Device Selection

Use a function node to set the device based on some condition:

```javascript
// Get device from global context
const deviceSerial = global.get('selectedCamera');

msg.payload = {
  device: deviceSerial,
  action: "snooze"
};

return msg;
```

### Snooze Multiple Devices

Use a split node or loop to snooze all cameras:

```javascript
const devices = [
  "T8410P42233714DB",
  "T8410P42233714DC",
  "T8410P42233714DD"
];

const messages = devices.map(device => ({
  payload: {
    device,
    action: "snooze",
    options: { duration: 3600 }
  }
}));

return [messages];
```

## Troubleshooting

### "Not connected" error

The config node isn't connected. Check the config node status.

### "Device not found" error

- Verify the device serial is correct
- Make sure the device is online in the Eufy app
- Try redeploying to refresh the device list

### Action timeout

- P2P connection may have failed
- The device may be offline
- Try again after a few seconds

### Snooze not working

- Make sure the device supports snooze
- Check that the device is online
- Verify P2P connection is established (check config node status)

