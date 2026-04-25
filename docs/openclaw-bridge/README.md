# OpenClaw Bridge Docs

This directory contains the planning and implementation docs for the `kodi-bridge` OpenClaw plugin: Kodi's runtime sidecar that makes Composio, dual communication, autonomy policies, self-update, and memory access available inside every org's OpenClaw deployment.

## Files

- [architecture-plan.md](./architecture-plan.md)
  - product and architecture direction for the `kodi-bridge` plugin
  - explains the target shape of the system, the multi-agent model, and how it fits Kodi

- [implementation-spec.md](./implementation-spec.md)
  - build-oriented implementation spec
  - covers plugin modules, event protocol, data model, provisioning, self-update, autonomy, and phased build plan

- [linear-project-plan.md](./linear-project-plan.md)
  - upload-ready Linear project, milestone, and issue plan
  - translates the plugin work into a team-reviewable Linear structure

## Recommended Reading Order

1. [architecture-plan.md](./architecture-plan.md)
2. [implementation-spec.md](./implementation-spec.md)
3. [linear-project-plan.md](./linear-project-plan.md)

## Relationship To Other Initiatives

- **Org Memory** ([docs/memory/](../memory/)) — Gabe's memory work defines the vault and its API. This plan proposes that the `kodi-memory` plugin described in the memory docs be **absorbed as a memory module inside the single `kodi-bridge` plugin**, preserving the exact contract (trusted identity, service-authenticated Memory API, proactive recall). See architecture-plan for the unification rationale.
- **Agent Tool Access via Composio** ([docs/tool-access/](../tool-access/)) — the existing request-scoped tool runtime stays in place for the synchronous Kodi-initiated chat path. The `kodi-bridge` plugin adds the always-on autonomous path; convergence of both paths is explicitly deferred.
- **Meeting Intelligence** ([docs/meetings/](../meetings/)) — the existing meeting event forwarding via `/v1/chat/completions` continues to work; the plugin's dual-communication protocol is the new, preferred ingress for future meeting-driven work.
