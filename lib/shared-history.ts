import { ChatMessage, Conversation, MAX_FILE_TEXT, validMessages } from "./chat-store";
import { isAvailableModel } from "./models";

// A bounded shared workspace for a small group; grow to paginated rows when needed.
export const HISTORY_BYTES = 3 * 1024 * 1024;
export type SharedHistory = { revision: string; conversations: Conversation[] };
export const validRevision = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function validConversations(value: unknown): value is Conversation[] {
  return Array.isArray(value) && value.length <= 100 && value.every((chat) =>
    chat && validRevision(chat.id) && typeof chat.title === "string" && chat.title.trim().length > 0 && chat.title.length <= 70 &&
    Number.isSafeInteger(chat.updatedAt) && chat.updatedAt >= 0 && isAvailableModel(chat.model) &&
    validMessages(chat.messages) && chat.messages.length <= 200 && chat.messages.every((message: ChatMessage) =>
      message.content.length <= 500000 && (!message.attachment || (
        message.attachment.name.length <= 255 && message.attachment.type.length <= 255 &&
        (message.attachment.text === undefined || message.attachment.text.length <= MAX_FILE_TEXT))))) &&
    new Set(value.map((chat) => chat.id)).size === value.length;
}