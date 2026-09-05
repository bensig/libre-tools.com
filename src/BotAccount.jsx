import Permissions from "./Permissions";

// /bot-account predates /permissions and is published by mcp.libre.org and docs.libre.org,
// so it must keep working. It is the `bot` template with the permission name fixed.
export default function BotAccount() {
  return (
    <Permissions
      lockedTemplate="bot"
      title="Give a bot its own permission"
      intro="Create a restricted agent permission holding only your bot's key, linked only to what an agent using mcp.libre.org needs. Your bot signs with that key; it can never change your keys, vote, or spend outside what you grant here."
    />
  );
}
