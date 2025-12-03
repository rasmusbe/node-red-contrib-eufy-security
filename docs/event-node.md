# eufy-event Node

The `eufy-event` node listens for real-time events from Eufy Security devices and outputs a message when an event occurs.

## Configuration

| Field | Description |
|-------|-------------|
| Name | Optional name for this node |
| Account | The eufy-config node to use |
| Device | Filter to specific device (empty = all devices) |
| Events | Which event types to listen for (empty = all events) |

## Event Types

| Event | Description |
|-------|-------------|
| `motion` | Motion detected by the camera |
| `personDetected` | Person detected (includes person name if known) |
| `petDetected` | Pet detected |
| `cryingDetected` | Baby crying detected (baby monitors) |
| `soundDetected` | Sound detected |
| `rings` | Doorbell button pressed |
| `propertyChanged` | Any device property changed |

## Input

You can dynamically change the event filter by sending a message:

```javascript
msg.payload = {
  device: "T8410P42233714DB",  // Filter to specific device (optional)
  events: ["motion", "personDetected"]  // Event types to listen for (optional)
};
```

This overrides the node configuration until changed again.

### Clear Filter

To listen to all events again:

```javascript
msg.payload = {
  device: "",    // Empty = all devices
  events: []     // Empty = all events
};
```

## Output

When an event occurs, the node outputs:

```javascript
{
  payload: {
    event: "motion",
    device: "T8410P42233714DB",
    deviceName: "Front Door Camera",
    value: true,
    timestamp: "2024-01-15T10:30:00.000Z"
  },
  topic: "eufy/T8410P42233714DB/motion"
}
```

### Event Values

Different events have different value formats:

**motion, petDetected, cryingDetected, soundDetected, rings:**
```javascript
value: true  // Event occurred
```

**personDetected:**
```javascript
value: {
  detected: true,
  person: "John"  // Name if known, empty if unknown
}
```

**propertyChanged:**
```javascript
value: {
  property: "snooze",
  value: true
}
```

## Node Status

- 🟢 **listening (X events)** - Waiting for events
- 🔵 **motion** - Event just received (briefly shown)
- 🟡 **connecting...** - Waiting for connection
- 🔴 **not configured** - Missing config

## Examples

### Motion Alert to Dashboard

Wire the event node to a ui_toast node for dashboard notifications:

```
[eufy-event] → [change node: set msg.payload to msg.payload.deviceName + " detected motion"] → [ui_toast]
```

### Log Events to File

```
[eufy-event] → [csv] → [file]
```

### Send Telegram on Person Detection

```javascript
// Function node between eufy-event and telegram-sender

if (msg.payload.event === "personDetected") {
  msg.payload = {
    chatId: YOUR_CHAT_ID,
    type: "message",
    content: `Person detected at ${msg.payload.deviceName}!`
  };
  return msg;
}
return null;
```

### Filter Motion Events by Time

Only forward events during certain hours:

```javascript
const hour = new Date().getHours();

// Only between 22:00 and 06:00
if (hour >= 22 || hour < 6) {
  return msg;
}
return null;
```

### Debounce Rapid Events

Use the delay node in "rate limit" mode to prevent too many notifications:

```
[eufy-event] → [delay: rate limit 1 msg/minute] → [notification]
```

### Route by Event Type

Use a switch node to handle different events differently:

```
[eufy-event] → [switch on msg.payload.event]
                  ├── "motion" → [motion handler]
                  ├── "personDetected" → [person handler]
                  └── "cryingDetected" → [baby alert]
```

## Multiple Event Nodes

You can use multiple event nodes to:
- Listen to different devices separately
- Handle different event types with different logic
- Have different filters for different purposes

All event nodes sharing the same config will receive events from the single underlying connection.

## Troubleshooting

### No events received

1. **Check connection**: Make sure the config node shows "Connected"
2. **Check device**: Ensure the device is online in the Eufy app
3. **Check filters**: Make sure you haven't filtered out the event type
4. **Check device settings**: The feature must be enabled in the Eufy app (e.g., motion detection)
5. **Trigger a test**: Manually trigger motion in front of the camera

### Events delayed

- Events rely on push notifications which can sometimes be delayed
- Check your network connection
- Eufy's push service may have occasional delays

### Missing person names

Person recognition must be set up in the Eufy app for names to appear.

### propertyChanged events too noisy

Filter to specific properties in a function node:

```javascript
if (msg.payload.event === "propertyChanged") {
  const prop = msg.payload.value.property;
  if (["snooze", "enabled", "motionDetection"].includes(prop)) {
    return msg;
  }
  return null;
}
return msg;
```

