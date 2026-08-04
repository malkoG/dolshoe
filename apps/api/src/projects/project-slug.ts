const MAX_SLUG_LENGTH = 100;

export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a URL-safe slug from a project name.
 *
 * @remarks
 * Decomposes accents so "Café" becomes "cafe" rather than losing the letter,
 * then collapses everything else into single hyphens. Scripts without a Latin
 * transliteration collapse to nothing, which is why the caller has to handle an
 * empty result rather than being handed a silently meaningless slug.
 *
 * @throws Error when the name contains nothing a slug can be built from.
 */
export function deriveProjectSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");

  if (slug === "") {
    throw new Error(
      `Could not derive a slug from the project name ${JSON.stringify(name)}. Supply one explicitly.`,
    );
  }

  return slug;
}
