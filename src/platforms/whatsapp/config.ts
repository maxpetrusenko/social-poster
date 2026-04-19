import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "whatsapp",
  label: "WhatsApp",
  category: "community",
  summary: "WhatsApp Business messaging through Late proxy.",
  capabilities: [],
  futureCapabilities: ["inbox", "webhooks"],
  methods: [relayMethod("WhatsApp", "+1 555 0100")],
};

export const connectionDefinitions = [connectionDefinition];
