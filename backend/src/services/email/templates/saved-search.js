import { escapeHtml } from '#services/email/templates/listing-notification.js';

export const savedSearchEmailTemplate = ({
  buyerName,
  listings,
  hasMore,
  frequency,
  base,
}) => {
  const subject =
    frequency === 'instant'
      ? 'New business matches your saved search'
      : `Your DealFlow ${frequency} saved-search digest`;
  const manage = new URL('/buyer/saved-searches', base).href;
  const greeting = `Hello ${buyerName || 'there'},`;
  const instructions = 'Manage saved searches or change your email frequency.';
  const more = hasMore ? 'Open DealFlow to view more matches.' : '';
  const entries = listings.map(listing => ({
    title: listing.title,
    details: [listing.industry, listing.location].filter(Boolean).join(' · '),
    searches: listing.searches.join(', '),
    href: new URL(`/listings/${listing.id}`, base).href,
  }));
  return {
    subject,
    text: [
      greeting,
      subject,
      ...entries.map(entry =>
        [
          entry.title,
          entry.details,
          `Saved searches: ${entry.searches}`,
          entry.href,
        ]
          .filter(Boolean)
          .join('\n')
      ),
      more,
      `${instructions} ${manage}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: `<main><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(greeting)}</p><ul>${entries
      .map(
        entry =>
          `<li><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a><p>${escapeHtml(entry.details)}</p><p>Saved searches: ${escapeHtml(entry.searches)}</p></li>`
      )
      .join(
        ''
      )}</ul>${more ? `<p>${more}</p>` : ''}<p><a href="${escapeHtml(manage)}">${instructions}</a></p></main>`,
  };
};
