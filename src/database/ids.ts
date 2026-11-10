import { ulid } from 'ulid';

/** Every primary key in FinSift is a ULID (26 chars, lexicographically sortable). */
export function newId(): string {
  return ulid();
}
