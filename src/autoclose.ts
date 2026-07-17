import cache from './cache';
import * as db from './db';
import { sendMessage } from './middleware';
import * as log from 'fancy-log';

const AUTO_CLOSE_MS = cache.config.auto_close_timeout || 300000;

function startAutoCloseTimer(ticketId: number, userId: string, messenger: string) {
  if (!cache.config.auto_close_enabled) return;

  // Clear existing timer for this ticket
  if (cache.ticketTimers[ticketId]) {
    clearTimeout(cache.ticketTimers[ticketId]);
  }

  cache.ticketTimers[ticketId] = setTimeout(async () => {
    // Check ticket is still open
    const ticket = await db.getTicketById(ticketId, null);
    if (!ticket || ticket.status !== 'open') {
      delete cache.ticketTimers[ticketId];
      return;
    }

    // Close the ticket
    db.add(ticket.userid, 'closed', ticket.category, ticket.messenger);

    // Notify user
    const paddedId = ticketId.toString().padStart(6, '0');
    sendMessage(
      ticket.userid,
      ticket.messenger,
      `${cache.config.language.ticket} #T${paddedId} ${cache.config.language.closed}\n\n${cache.config.language.autoClosed}`
    );

    // Notify staff group
    sendMessage(
      cache.config.staffchat_id,
      cache.config.staffchat_type,
      `${cache.config.language.ticket} #T${paddedId} ${cache.config.language.closed}\n\n${cache.config.language.autoClosedStaff}`
    );

    // Clear caches
    delete cache.ticketIDs[ticket.userid];
    delete cache.ticketStatus[ticket.userid];
    delete cache.ticketSent[ticket.userid];
    delete cache.ticketTimers[ticketId];

    log.info(`Auto-closed ticket #T${paddedId} due to inactivity`);
  }, AUTO_CLOSE_MS);

  log.info(`Auto-close timer started for ticket #T${ticketId.toString().padStart(6, '0')} (${AUTO_CLOSE_MS / 1000}s)`);
}

function resetAutoCloseTimer(ticketId: number) {
  if (!cache.config.auto_close_enabled) return;

  // Find the ticket to get user info
  db.getTicketById(ticketId, null).then((ticket) => {
    if (ticket && ticket.status === 'open') {
      startAutoCloseTimer(ticketId, ticket.userid, ticket.messenger);
    }
  });
}

function cancelAutoCloseTimer(ticketId: number) {
  if (cache.ticketTimers[ticketId]) {
    clearTimeout(cache.ticketTimers[ticketId]);
    delete cache.ticketTimers[ticketId];
  }
}

export { startAutoCloseTimer, resetAutoCloseTimer, cancelAutoCloseTimer };
