# eufy-config Node

The `eufy-config` node is a configuration node that stores your Eufy Security account credentials and manages the connection to Eufy's cloud service.

## Configuration

| Field | Description |
|-------|-------------|
| Name | Optional name for this configuration |
| Username | Your Eufy Security account email address |
| Password | Your Eufy Security account password |
| Country | Your country code (US, GB, DE, etc.) |

## Connection Status

The config node shows the current connection status:

- **Connected** - Successfully connected to Eufy cloud
- **Connected (Push active)** - Connected with push notifications enabled
- **Connecting...** - Connection in progress
- **Disconnected** - Not connected
- **Error** - Connection failed (check credentials or network)

## Two-Factor Authentication (2FA)

If your Eufy account has 2FA enabled:

1. Enter your credentials and deploy
2. The node will attempt to connect
3. Edit the config node again - you'll see a 2FA input field
4. Enter the code from your authenticator app
5. Click "Verify"

Once verified, the session is persisted and you won't need to enter 2FA frequently.

## Captcha

Sometimes Eufy requires a captcha verification:

1. A captcha image will appear in the config dialog
2. Enter the captcha text
3. Click "Verify"

## Persistent Data

Session data is stored in your Node-RED user directory:

```
~/.node-red/eufy-<configId>.json
```

This includes:
- Authentication tokens
- Push notification credentials
- Device cache

This allows the node to reconnect without re-authenticating.

## Reconnecting

If the connection is lost, you can:

1. Edit the config node
2. Click the "Reconnect" button
3. The node will attempt to reconnect

The node also automatically attempts to reconnect when the connection is lost.

## Multiple Accounts

You can create multiple config nodes for different Eufy accounts. Each config node manages its own connection and devices.

## Security Notes

- Credentials are stored encrypted in Node-RED's credentials store
- Session tokens are stored in the user directory
- It's recommended to use a dedicated Eufy account for Node-RED

## Troubleshooting

### "Invalid credentials" error

- Double-check your email and password
- Make sure you're using the correct country
- Try logging into the Eufy app to verify your credentials work

### Connection timeout

- Check your network connection
- Eufy's servers may be temporarily unavailable
- Try again in a few minutes

### 2FA code not working

- Codes expire quickly - enter them promptly
- Make sure your device's time is synchronized
- Try generating a new code

### Frequent disconnections

- This can happen if you log in from multiple locations
- Consider using a dedicated account for Node-RED
- Check your network stability

