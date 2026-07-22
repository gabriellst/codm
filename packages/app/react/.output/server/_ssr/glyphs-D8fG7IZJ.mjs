import { F as IconTerminal2, G as IconHexagon, l as IconSparkles, H as IconBrandTelegram, J as IconBrandInstagram, K as IconBrandWhatsapp } from "../_libs/tabler__icons-react.mjs";
const channelGlyph = {
  WHATSAPP: IconBrandWhatsapp,
  INSTAGRAM_DM: IconBrandInstagram,
  TELEGRAM: IconBrandTelegram
};
const channelLabel = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM_DM: "Instagram DM",
  TELEGRAM: "Telegram"
};
const CHANNEL_KINDS = ["WHATSAPP", "INSTAGRAM_DM", "TELEGRAM"];
const providerGlyph = {
  CLAUDE_CODE: IconSparkles,
  CODEX: IconHexagon,
  OPENCODE: IconTerminal2
};
const providerLabel = {
  CLAUDE_CODE: "Claude Code",
  CODEX: "Codex",
  OPENCODE: "OpenCode"
};
const issueStatusDot = {
  NEEDS_INPUT: "bg-warning",
  WORKING: "bg-info",
  COMPLETED: "bg-success"
};
const resolutionIsPrimary = {
  RETRY: true,
  REVIEW_AND_SEND: true,
  APPROVE: true,
  TAKE_OVER: false,
  DENY: false
};
export {
  CHANNEL_KINDS as C,
  providerGlyph as a,
  channelGlyph as b,
  channelLabel as c,
  issueStatusDot as i,
  providerLabel as p,
  resolutionIsPrimary as r
};
