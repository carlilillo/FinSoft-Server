import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..');

/** Every `*.entity.ts` under src/. */
function entityFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.entity.ts'))
    .map((path) => join(SRC, path));
}

/**
 * Entities that import each other (invoice ↔ invoice line) crash under ESM when a relation property is
 * typed with the class itself: decorator metadata reads the class before its module has finished loading
 * ("Cannot access 'InvoiceEntity' before initialization"), which broke the migration runner. TypeORM's
 * `Relation<T>` makes that metadata a plain Object. Unit tests don't emit decorator metadata, so this
 * guards the rule on the source instead.
 */
describe('entity relations', () => {
  it('type every relation property with Relation<T>', () => {
    const offenders: string[] = [];
    for (const file of entityFiles()) {
      const source = readFileSync(file, 'utf8');
      const relations = source.matchAll(
        /@(?:ManyToOne|OneToMany|OneToOne|ManyToMany)\([^]*?\n\s*(\w+)\??!?:\s*([^;]+);/g,
      );
      for (const [, property, type] of relations) {
        if (!type?.trim().startsWith('Relation<'))
          offenders.push(`${file.slice(SRC.length + 1)}: ${property}: ${type}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
