/** Import Google Contacts (People API) into WAZEN saved contacts. */

import { ApiError } from "./api-error";
import { validateOutboundHttpsUrl } from "./outbound";
import type { ImportedContact } from "./contact-file";

const PEOPLE_HOST = "people.googleapis.com";
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

type GooglePerson = {
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  phoneNumbers?: Array<{ value?: string }>;
};

export function contactsFromGooglePeople(payload: { connections?: GooglePerson[] | null }): ImportedContact[] {
  const contacts: ImportedContact[] = [];
  for (const person of payload.connections ?? []) {
    const displayName = String(person.names?.[0]?.displayName ?? "").trim();
    const email = String(person.emailAddresses?.[0]?.value ?? "").trim().toLowerCase();
    const phone = String(person.phoneNumbers?.[0]?.value ?? "").trim();
    if (!displayName && !email && !phone) continue;
    contacts.push({
      displayName: displayName || email || phone,
      email,
      phone,
    });
  }
  return contacts;
}

export async function fetchGooglePeopleContacts(accessToken: string): Promise<ImportedContact[]> {
  const token = String(accessToken ?? "").trim();
  if (token.length < 20 || token.length > 4096) throw new ApiError(400, "GOOGLE_CONTACTS_DENIED");
  const contacts: ImportedContact[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = validateOutboundHttpsUrl(
      `https://${PEOPLE_HOST}/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=${PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      [PEOPLE_HOST],
    );
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) throw new ApiError(403, "GOOGLE_CONTACTS_DENIED");
    if (!response.ok) throw new ApiError(502, "GOOGLE_CONTACTS_FAILED");
    const body = await response.json() as { connections?: GooglePerson[]; nextPageToken?: string };
    contacts.push(...contactsFromGooglePeople(body));
    pageToken = String(body.nextPageToken ?? "").trim();
    if (!pageToken) break;
  }
  return contacts;
}
