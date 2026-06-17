# Connecting a Shelly H&T Gen3 to GrowWatch (MQTT)

GrowWatch receives Shelly readings over MQTT through a HiveMQ Cloud broker. The
backend subscribes as `gw-server`; every Shelly publishes with the shared
`shelly-publisher` credential, scoped to its own topic prefix (`gw/<deviceId>`).

There are two parts: a **one-time operator setup** (broker + server env vars) and
the **per-device pairing** any user does from the app.

---

## Part A — One-time operator setup

You only do this once for the whole deployment.

### 1. HiveMQ Cloud
1. Sign up at <https://www.hivemq.com/cloud/> → **Serverless Free** plan.
2. Create a cluster in the **EU** region (closest to the Railway backend).
3. Note the cluster host, e.g. `xxxxxxxx.s2.eu.hivemq.cloud`.
4. In **Access Management**, create two users:
   - **`gw-server`** — random 32-byte password — **Subscribe-only** on `gw/#`.
   - **`shelly-publisher`** — random 32-byte password — **Publish-only** on
     `gw/+/status/+` and `gw/+/online`.

### 2. Railway backend env vars
On the `backend` service → Variables:

| Variable | Value |
|---|---|
| `MQTT_BROKER_URL` | `mqtts://<cluster-host>:8883` |
| `MQTT_PUBLIC_URL` | `mqtts://<cluster-host>:8883` (shown to users in the wizard) |
| `MQTT_SERVER_PASSWORD` | the `gw-server` password |
| `MQTT_PUBLISHER_USERNAME` | `shelly-publisher` |
| `MQTT_PUBLISHER_PASSWORD` | the `shelly-publisher` password |

Redeploy the backend. In the logs you should see:
```
[mqtt] connecting to mqtts://… as gw-server
[mqtt] connected
[mqtt] subscribed to gw/+/status/+:0 and gw/+/online
```

### 3. Smoke-test the broker (optional)
With `mqttx` installed (`npm i -g mqttx-cli`):
```
mqttx pub --hostname <cluster-host> --port 8883 \
  --username shelly-publisher --password "<publisher-password>" \
  --topic 'gw/gw-test1234/status/temperature:0' \
  --message '{"id":0,"tC":21.5}' \
  --protocol mqtts
```
Backend logs should show `[mqtt] Dropped reading from unknown device gw-test1234`
— that confirms the message arrived and was looked up in Mongo (the test device
simply doesn't exist yet).

---

## Part B — Pairing a Shelly from the app

In GrowWatch: **Settings → Shelly H&T sensors → Add Shelly**. The wizard walks
through these steps:

1. **Power on** — insert the battery; wait for the LED to blink.
2. **Name** — give the sensor a nickname. Tapping Next creates the device and its
   topic prefix `gw/<deviceId>`.
3. **Join the Shelly's Wi-Fi** — on your phone, connect to the `ShellyHTG3-…`
   hotspot (no password).
4. **Configure the Shelly** — the wizard shows four copyable values:
   **Broker URL**, **Username**, **Password**, and **Custom MQTT prefix**.
   In a new browser tab go to <http://192.168.33.1> and:
   1. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name + password → Save.
   2. Settings → **MQTT**, then:
      - Enable MQTT: **on**
      - Server: paste the **Broker URL** (`mqtts://…:8883`)
      - Client ID: leave blank
      - MQTT user: paste the **Username** (`shelly-publisher`)
      - MQTT password: paste the **Password**
      - Custom MQTT prefix: paste the **prefix** (`gw/<deviceId>`)
      - Generic status update over MQTT: **on**
      - RPC status notifications over MQTT: **on**
      - Save
5. **Reconnect to home Wi-Fi** — switch your phone back to your home network.
6. **Test** — the wizard polls for the first reading. Press the small button on
   the side of the Shelly to force a report. When it arrives, the wizard shows
   ✅ and the device card flips to "Just now".

---

## How the data flows

```
Shelly  --publish-->  gw/<deviceId>/status/temperature:0   {"tC": 21.5}
                      gw/<deviceId>/status/humidity:0      {"rh": 48.2}
                      gw/<deviceId>/status/devicepower:0   {"battery":{"percent":87}}
                      gw/<deviceId>/online                 true/false
   |
   |  HiveMQ Cloud broker
   v
backend mqttConsumer.ts  (subscribes gw/+/status/+:0 + gw/+/online as gw-server)
   |  2s debounce per device, looks up device by prefix in MongoDB
   v
handleSensorData()  -->  in-memory store + GraphQL subscription push + hourly aggregate
   |
   v
Angular home page shows live °C / %RH; device card shows battery + last-seen
```

The MQTT topic the Shelly uses is `<prefix>/status/<component>:0`, where
`<prefix>` is the `gw/<deviceId>` value from wizard step 4. The backend extracts
the `deviceId` from the topic and matches it against the `shelly_devices`
collection.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Wizard never detects a reading | Shelly's MQTT not enabled, wrong prefix/credentials, or it didn't rejoin home Wi-Fi. Re-check step 4. |
| Backend log: `Dropped reading from unknown device …` | The publishing prefix doesn't match a paired device. Confirm the prefix pasted into the Shelly is exactly the one shown in the wizard. |
| Backend log: auth / connection refused | `MQTT_SERVER_PASSWORD` / `MQTT_BROKER_URL` wrong, or the `gw-server` user lacks `gw/#` subscribe rights. |
| Shelly won't connect to broker | Confirm `mqtts://` (TLS, port 8883) and that the `shelly-publisher` user has publish rights on `gw/+/status/+` and `gw/+/online`. |
| Readings stop after a while | Battery sensors sleep between reports — this is normal; "last seen" updates on each wake. |

> **Note:** the `shelly-publisher` credential is shared across all devices and is
> a real secret. It's displayed in the wizard the same way the old webhook URL
> was. Rotating it means updating the Railway env vars and re-pairing devices.
