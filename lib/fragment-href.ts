export type FragmentHref = `#${string}`;

export function isFragmentHref(href: unknown): href is FragmentHref {
  return typeof href === 'string' && href.startsWith('#');
}
