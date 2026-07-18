import * as db from './db';
import cache from './cache';
import * as middleware from './middleware';
import { Context } from './interfaces';
import { ISupportee } from './db';
import * as log from 'fancy-log'

/**
 * Extracts ticket ID from the reply text.
 *
 * @param replyText - The text to extract the ticket ID from.
 * @returns The ticket ID as a string or undefined if not found.
 */
const extractTicketId = (replyText: string): string | undefined => {
  const match = replyText.match(new RegExp(`#T(.*) ${cache.config.language.from}`));
  return match ? match[1] : undefined;
};

/**
 * Display help text depending on whether the user is an admin.
 *
 * @param ctx - The bot context.
 */
const helpCommand = (ctx: Context): void => {
  const { language, parse_mode } = cache.config;
  const text = ctx.session.admin ? language.helpCommandStaffText : language.helpCommandText;
  middleware.reply(ctx, text, { parse_mode });
};

/**
 * Close all open tickets.
 *
 * @param ctx - The bot context.
 */
const clearCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  db.closeAll();
  // Reset the ticket arrays
  cache.ticketIDs.length = 0;
  cache.ticketStatus.length = 0;
  cache.ticketSent.length = 0;
  middleware.reply(ctx, 'All tickets closed.');
};

/**
 * Display open tickets.
 *
 * @param ctx - The bot context.
 */
const openCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const groups: string[] = [];
  const { categories, language } = cache.config;

  if (categories && categories.length > 0) {
    categories.forEach(category => {
      if (!category.subgroups) {
        if (category.group_id == ctx.chat.id) groups.push(category.name);
      } else {
        category.subgroups.forEach((sub: { group_id: any; name: string }) => {
          if (sub.group_id == ctx.chat.id) groups.push(sub.name);
        });
      }
    });
  }

  db.open((userList: any[]) => {
    let openTickets = '';
    userList.forEach(ticket => {
      if (ticket.userid != null) {
        let ticketInfo = '';
        const uidStr = ticket.userid.toString();
        if (uidStr.includes('WEB')) {
          ticketInfo = '(web)';
        } else if (uidStr.includes('SIGNAL')) {
          ticketInfo = '(signal)';
        }
        openTickets += `#T${ticket.ticketId.toString().padStart(6, '0')} ${ticketInfo}\n`;
      }
    });
    middleware.reply(ctx, `*${language.openTickets}\n\n* ${openTickets}`);
  }, groups);
};

/**
 * Close a specific ticket.
 *
 * @param ctx - The bot context.
 */
const closeCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const { categories } = cache.config;

  // Only process if the reply is to a bot message
  if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.from) return;
  if (!ctx.message.reply_to_message.from.is_bot) return;
  const replyText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption;
  if (!replyText) return;
  const ticketId = extractTicketId(replyText);
  if (!ticketId) return;

  const paddedTicket = ticketId.toString().padStart(6, '0');

  // Find the ticket directly by ticketId
  db.getByTicketId(ticketId, (ticket: ISupportee | null) => {
    if (!ticket) {
      middleware.reply(ctx, cache.config.language.ticketClosedError);
      return;
    }

    // Close the ticket in DB
    db.add(ticket.userid, 'closed', ticket.category, ctx.messenger);

    // Notify staff group
    middleware.reply(ctx, `${cache.config.language.ticket} #T${paddedTicket} ${cache.config.language.closed}`);

    // Notify the user
    middleware.sendMessage(
      ticket.userid,
      ticket.messenger,
      `${cache.config.language.ticket} #T${paddedTicket} ${cache.config.language.closed}\n\n${cache.config.language.ticketClosed}`
    );

    delete cache.ticketIDs[ticket.userid];
    delete cache.ticketStatus[ticket.userid];
    delete cache.ticketSent[ticket.userid];
  });
};

/**
 * Ban a user based on a ticket.
 *
 * @param ctx - The bot context.
 */
const banCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const replyText = ctx.message.reply_to_message.text;
  if (!replyText) return;
  const ticketId = extractTicketId(replyText);
  if (!ticketId) return;
  db.getByTicketId(ticketId, (ticket: { userid: any; ticketId: { toString: () => string } }) => {
    db.add(ticket.userid, 'banned', '', ctx.messenger);
    middleware.sendMessage(
      ctx.chat.id,
      ctx.messenger,
      `${cache.config.language.usr_with_ticket} #T${ticketId.toString().padStart(6, '0')} ${cache.config.language.banned}`
    );
  });
};

/**
 * Reopen a closed ticket.
 *
 * @param ctx - The bot context.
 */
const reopenCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const replyText = ctx.message.reply_to_message.text;
  if (!replyText) return;
  const ticketId = extractTicketId(replyText);
  if (!ticketId) return;
  db.getByTicketId(ticketId, (ticket: { userid: any; ticketId: { toString: () => string } }) => {
    db.reopen(ticket.userid, '', ctx.messenger);
    middleware.sendMessage(
      ctx.chat.id,
      ctx.messenger,
      `${cache.config.language.usr_with_ticket} #T${ticket.ticketId.toString().padStart(6, '0')} ${cache.config.language.ticketReopened}`
    );
  });
};

/**
 * Unban a user based on a ticket.
 *
 * @param ctx - The bot context.
 */
const unbanCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const replyText = ctx.message.reply_to_message.text;
  if (!replyText) return;
  const ticketId = extractTicketId(replyText);
  if (!ticketId) return;
  db.getByTicketId(ticketId, (ticket: { userid: any; ticketId: { toString: () => string } }) => {
    db.add(ticket.userid, 'closed', '', ctx.messenger);
    middleware.sendMessage(
      ctx.chat.id,
      ctx.messenger,
      `${cache.config.language.usr_with_ticket} #T${ticket.ticketId.toString().padStart(6, '0')} unbanned`
    );
  });
};

/**
 * Broadcast command - starts the broadcast flow.
 */
const broadcastCommand = (ctx: Context): void => {
  if (!ctx.session.admin) return;
  const key = `${ctx.from.id}:${ctx.chat.id}`;
  cache.broadcastState[key] = { target: '' };
  middleware.reply(ctx, '*Broadcast*\n\nWho should receive this message?', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 All Users', callback_data: 'broadcast_all' }],
        [{ text: '🟢 Open Tickets Only', callback_data: 'broadcast_open' }],
        [{ text: '❌ Cancel', callback_data: 'broadcast_cancel' }],
      ],
    },
  });
};

/**
 * Execute broadcast - send message to target users.
 */
const broadcastExecute = async (ctx: Context, target: string): Promise<void> => {
  if (!ctx.session.admin) return;
  const key = `${ctx.from.id}:${ctx.chat.id}`;
  const state = cache.broadcastState[key];
  if (!state) return;

  const msgText = ctx.message.text;
  if (!msgText || msgText.startsWith('/')) return;

  delete cache.broadcastState[key];

  const userIds = await db.getAllUserIds(target === 'open' ? 'open' : null);
  if (!userIds || userIds.length === 0) {
    middleware.reply(ctx, 'No users found to broadcast to.');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const uid of userIds) {
    try {
      await middleware.sendMessage(uid, 'telegram', msgText);
      sent++;
    } catch {
      failed++;
    }
  }

  middleware.reply(ctx, `*Broadcast sent!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${userIds.length}`, {
    parse_mode: 'Markdown',
  });
};

/**
 * Show bot statistics.
 */
const statsCommand = async (ctx: Context): Promise<void> => {
  if (!ctx.session.admin) return;
  const stats = await db.getStats();
  middleware.reply(ctx,
    `*Bot Statistics*\n\n` +
    `👥 Total Users: *${stats.total}*\n` +
    `🟢 Open Tickets: *${stats.open}*\n` +
    `✅ Closed: *${stats.closed}*\n` +
    `🚫 Banned: *${stats.banned}*`,
    { parse_mode: 'Markdown' }
  );
};

/**
 * Opens a new ticket for the user (bypasses auto-reply).
 */
const ticketCommand = async (ctx: Context): Promise<void> => {
  if (ctx.chat.type !== 'private') {
    middleware.reply(ctx, 'Please use this command in private chat.');
    return;
  }

  const { config } = cache;
  const userId = ctx.from.id;

  // Check if ticket already exists
  const existingTicket = await db.getTicketByUserId(userId, ctx.session.groupCategory);
  if (existingTicket && existingTicket.status === 'open') {
    middleware.reply(ctx,
      `You already have an open ticket: #T${existingTicket.ticketId.toString().padStart(6, '0')}\n\nSend your message here and it will be forwarded to staff.`,
      { parse_mode: config.parse_mode }
    );
    return;
  }

  // Create new ticket
  const ticket = await db.add(userId, 'open', ctx.session.groupCategory, ctx.messenger);

  // Send confirmation to user
  const confirmationMsg = config.language.confirmationMessage + '\n' +
    (config.show_user_ticket
      ? `${config.language.ticket} #T${ticket.ticketId.toString().padStart(6, '0')}`
      : '');
  middleware.reply(ctx, confirmationMsg);

  // Notify staff
  const staffMsg = `🎫 *New Ticket Created via /ticket*\n\n${config.language.ticket} #T${ticket.ticketId.toString().padStart(6, '0')} ${config.language.from} [${ctx.message.from.first_name}](tg://user?id=${userId}) ${config.language.language}: ${ctx.message.from.language_code}\n\nUser started a new support ticket.`;
  middleware.sendMessage(config.staffchat_id, config.staffchat_type, staffMsg);
};

export {
  banCommand,
  openCommand,
  closeCommand,
  unbanCommand,
  clearCommand,
  reopenCommand,
  helpCommand,
  broadcastCommand,
  broadcastExecute,
  statsCommand,
  ticketCommand,
};
