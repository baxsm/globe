import type { ErrataApplication, Finding } from "./api";
import { normalizePath } from "./document";

/**
 * Everything the margin can render against one node.
 *
 * Errata applications and validation findings are separate concerns everywhere else, but
 * they annotate the same document and a reader wants both beside the element they
 * concern rather than in two lists that each half-describe it.
 */
export interface NodeAnnotations {
  readonly errata: readonly ErrataApplication[];
  readonly findings: readonly Finding[];
}

interface Bucket {
  errata: ErrataApplication[];
  findings: Finding[];
}

/**
 * Errata and findings, grouped by the node they address.
 *
 * Built once per run rather than searched per node. The tree renders several hundred
 * nodes and scanning the application list at each of them turns an O(n) render into
 * O(n*m) for no benefit.
 *
 * Paths are normalized on the way in because the two sides spell them differently: the
 * engine reports the document's own prefixed names and the tree walks local ones. The
 * ordinal survives normalization, which is the part that tells three jurisdictions apart.
 *
 * The engine's paths start inside the root element and the tree's start at it, so a node
 * matches by suffix rather than by equality. Each annotation is filed under its own full
 * path once, and the lookup walks the node's path from the left, dropping one leading
 * segment at a time until a key hits. That is bounded by the document's depth, around ten,
 * rather than by the number of annotations, so it stays a constant-ish cost per node.
 */
export class AnnotationIndex {
  private readonly byPath = new Map<string, Bucket>();

  /**
   * The first application of each issue, by its address.
   *
   * Issue 7 writes nine zeros per jurisdiction and every one carries the same sentence
   * about the safe harbour. Printed against all twenty-seven it stops being an
   * explanation and becomes the page's texture. Only the first states it, and which one
   * is first is decided here rather than by render order, which would change under a
   * re-render and is not something a component should be tracking.
   */
  private readonly firstOfIssue = new Map<number, string>();

  constructor(errata: readonly ErrataApplication[], findings: readonly Finding[]) {
    for (const application of errata) {
      this.bucketFor(application.xpath).errata.push(application);

      if (!this.firstOfIssue.has(application.issueNumber)) {
        this.firstOfIssue.set(application.issueNumber, application.xpath);
      }
    }
    for (const finding of findings) {
      this.bucketFor(finding.path).findings.push(finding);
    }
  }

  /** True where this rule has already given its reason against an earlier node. */
  repeats(application: ErrataApplication): boolean {
    return this.firstOfIssue.get(application.issueNumber) !== application.xpath;
  }

  private bucketFor(path: string): Bucket {
    const key = normalizePath(path);
    const existing = this.byPath.get(key);
    if (existing !== undefined) return existing;

    const created: Bucket = { errata: [], findings: [] };
    this.byPath.set(key, created);
    return created;
  }

  /**
   * What belongs beside one node, or null when nothing does.
   *
   * Segments are dropped whole, so `.../ETRRate` can never match an unrelated
   * `.../TopUpTaxETRRate`: the comparison only ever happens on a segment boundary.
   */
  at(nodePath: string): NodeAnnotations | null {
    const segments = normalizePath(nodePath).split("/").filter(Boolean);

    for (let start = 0; start < segments.length; start += 1) {
      const found = this.byPath.get(segments.slice(start).join("/"));
      if (found !== undefined) return found;
    }

    return null;
  }

  /**
   * True when anything strictly beneath this node carries an annotation.
   *
   * The tree opens two levels by default and every errata target in a real GIR is deeper
   * than that, so without this a filer lands on a document whose corrections are all
   * hidden behind disclosures they have no reason to open. The margin then looks empty on
   * a return that has plenty to say, and the surface reads as a collapsed tree rather than
   * as a marked-up document.
   *
   * The two sides spell an address differently: a node's path runs from the root and an
   * annotation's key is a suffix of that same address. So the node is an ancestor when its
   * trailing segments and the key's leading segments describe one continuous chain with at
   * least one segment of the key left over. Anchoring on a shared segment is what keeps
   * this from opening unrelated branches, which a looser test does while still passing
   * every case that matters.
   */
  hasAnnotationBelow(nodePath: string): boolean {
    const node = normalizePath(nodePath).split("/").filter(Boolean);
    if (node.length === 0) return false;

    for (const key of this.byPath.keys()) {
      const segments = key.split("/");

      // How many of the key's leading segments the node's tail already accounts for.
      // Zero overlap means the key names a chain starting below the node's own element,
      // which only counts once the node is known to contain it.
      for (let overlap = Math.min(node.length, segments.length); overlap > 0; overlap -= 1) {
        const tail = node.slice(node.length - overlap).join("/");
        if (tail !== segments.slice(0, overlap).join("/")) continue;

        // Something is left of the key after the shared chain, so it lies beneath.
        if (overlap < segments.length) return true;
        break;
      }
    }

    return false;
  }

  /** True when nothing in the document carries an annotation. */
  get isEmpty(): boolean {
    return this.byPath.size === 0;
  }
}
