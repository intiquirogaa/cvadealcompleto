// Resolves jid -> display name. Populated from the `contacts` array that
// arrives alongside `messaging-history.set` (the initial sync) — that's
// the only place Baileys hands us a name for someone we've never directly
// chatted with, which matters for Status posters (you can receive their
// status without ever having a 1:1 chat with them).
const globalForContacts = globalThis as unknown as {
  whatsappContactNames: Map<string, string> | undefined;
};
const contactNames = globalForContacts.whatsappContactNames ?? new Map<string, string>();
if (process.env.NODE_ENV !== 'production') {
  globalForContacts.whatsappContactNames = contactNames;
}

export function updateContact(contact: any) {
  const name = contact.name || contact.notify || contact.verifiedName;
  if (contact.id && name) {
    contactNames.set(contact.id, name);
  }
}

export function getContactName(jid: string): string {
  return contactNames.get(jid) || jid.split('@')[0];
}
