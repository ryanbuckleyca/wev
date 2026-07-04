import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateSlug } from './slug';

describe('generateSlug', () => {
  // Feature: organizations, Property 11
  it('Property 11: Slug invariants (all-lowercase, only [a-z0-9-], no leading/trailing hyphens, no --)', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const slug = generateSlug(name);
        
        if (slug === '') return true;

        // All lowercase
        expect(slug).toBe(slug.toLowerCase());
        
        // Only a-z, 0-9, and hyphen
        expect(slug).toMatch(/^[a-z0-9-]+$/);
        
        // No leading or trailing hyphens
        expect(slug.startsWith('-')).toBe(false);
        expect(slug.endsWith('-')).toBe(false);
        
        // No consecutive hyphens
        expect(slug).not.toMatch(/--/);
      })
    );
  });

  it('handles French accents correctly', () => {
    expect(generateSlug('Centraide Montréal')).toBe('centraide-montreal');
    expect(generateSlug('Éco-Quartier')).toBe('eco-quartier');
    expect(generateSlug('Forêt')).toBe('foret');
    expect(generateSlug('Hôpital Général')).toBe('hopital-general');
    expect(generateSlug('À l\'œuvre')).toBe('a-loeuvre');
  });

  it('handles already clean ASCII', () => {
    expect(generateSlug('hello world')).toBe('hello-world');
    expect(generateSlug('abc-123')).toBe('abc-123');
  });

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('');
  });

  it('collapses excessive punctuation and whitespace', () => {
    expect(generateSlug('  Hello   World!!!  ')).toBe('hello-world');
    expect(generateSlug('A & B Company')).toBe('a-b-company');
  });
});
