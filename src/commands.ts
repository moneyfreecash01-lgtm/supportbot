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

export {
  banCommand,
  openCommand,
  closeCommand,
  unbanCommand,
  clearCommand,
  reopenCommand,
  helpCommand,
};
