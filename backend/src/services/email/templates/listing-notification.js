export const escapeHtml = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[
        character
      ]
  );

export const listingEmailTemplate = ({
  type,
  title,
  askingPrice,
  currency,
  includePrice = true,
}) => {
  const labels = {
    'listing.approved': 'A listing you saved is now available',
    'listing.rejected': 'A listing you saved has changed status',
    'listing.archived': 'A listing you saved has been archived',
    'listing.price_changed': 'The price changed on a listing you saved',
    'listing.details_changed': 'A listing you saved has updated details',
  };
  const subject = labels[type] ?? 'An update to a saved listing';
  const safeTitle = escapeHtml(title);
  const price =
    !includePrice || askingPrice == null
      ? ''
      : `<p>Asking price: ${escapeHtml(currency)} ${escapeHtml(askingPrice)}</p>`;
  return {
    subject,
    html: `<main><h1>${escapeHtml(subject)}</h1><p>${safeTitle}</p>${price}</main>`,
    text: `${subject}\n${String(title ?? '')}${!includePrice || askingPrice == null ? '' : `\nAsking price: ${currency} ${askingPrice}`}`,
  };
};
