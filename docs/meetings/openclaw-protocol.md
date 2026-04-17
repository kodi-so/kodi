# Meeting Intelligence OpenClaw Protocol

## Purpose

This document defines the first runtime contract Kodi uses when forwarding live meeting events into a workspace's OpenClaw instance.

The initial protocol is intentionally narrow:

- it rides over the existing OpenClaw `/v1/chat/completions` gateway
- it carries ordered meeting events as JSON
- it gives the runtime enough context to build rolling notes and downstream artifacts later

## Version

Current protocol version: `kodi.meeting.v1`

## Transport

Kodi sends one JSON envelope per normalized meeting event to the workspace's provisioned OpenClaw instance.

Current delivery path:

- authenticated `POST` to `/v1/chat/completions`
- `model: "openclaw:main"`
- system message instructing the runtime to treat the payload as a machine-readable ingress event
- user message containing the JSON envelope

## Envelope Shape

Each payload includes:

- `protocolVersion`
- `source`
- `sentAt`
- `meeting`
- `delivery`
- `participants`
- `event`

### `meeting`

Carries stable meeting context:

- org id
- meeting session id
- provider
- title
- current status
- scheduled / actual / ended timestamps
- external provider ids

### `delivery`

Carries ordering and idempotency fields:

- ingestion source
- persisted meeting event id
- persisted sequence number
- normalized event type
- occurred-at timestamp

`delivery.sequence` is the canonical ordering key for runtime processing.

### `participants`

Carries the latest participant snapshot known to Kodi at the time of delivery:

- internal participant id
- provider participant id
- display name
- email
- host/internal flags
- joined/left timestamps

### `event`

Supported event kinds in `kodi.meeting.v1`:

- `transcript`
- `participant`
- `lifecycle`
- `health`

Current runtime forwarding is enabled for transcript, participant, and lifecycle events. Health events are currently skipped.

Transcript events include ordered chunk data:

- content
- speaker identity
- start/end offsets
- confidence
- partial/final marker
- occurred-at timestamp

Participant events include:

- action
- occurred-at timestamp
- participant identity payload

Lifecycle events include:

- action
- state
- occurred-at timestamp
- error code / message when present

## Runtime Response

The runtime is currently asked to respond with JSON only:

```json
{
  "protocolVersion": "kodi.meeting.v1",
  "accepted": true,
  "processedEventId": "meeting-event-id",
  "receivedKind": "transcript",
  "notes": null
}
```

Kodi currently treats this as an acknowledgement only. Future tickets will use the same protocol foundation to persist rolling notes, candidate tasks, and draft actions back into meeting state.
