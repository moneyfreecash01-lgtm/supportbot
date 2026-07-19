import TelegramAddon from './addons/telegram';
import cache from './cache';

/**
 * Checks if a user is a member of the configured channel.
 */
export async function isUserInChannel(userId: string): Promise<boolean> {
  const channelUsername = cache.config.channel_username;
  if (!channelUsername) return true; // No channel configured = allow all

  try {
    const bot = TelegramAddon.getInstance().bot;
    const result = await bot.api.getChatMember(channelUsername, userId);
    return result.status === 'member' || result.status === 'administrator' || result.status === 'creator';
  } catch (error) {
    console.error('[ChannelCheck] Error checking membership:', error);
    return true; // On error, allow (don't block user)
  }
}
