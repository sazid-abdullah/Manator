import { describe, it, expect, vi } from 'vitest';
import { isOwnerEmail } from '../utils/auth';
import * as fs from 'fs';
import * as path from 'path';

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_OWNER_EMAIL: 'abdullahsazid109@gmail.com',
    }
  }
});

describe('Auth handling', () => {
  it('correctly identifies the owner email', () => {
    expect(isOwnerEmail('abdullahsazid109@gmail.com')).toBe(true);
    expect(isOwnerEmail('ABDULLAHsazid109@gmail.com')).toBe(true); // Case-insensitive
  });

  it('returns false for standard non-owner emails', () => {
    expect(isOwnerEmail('test@example.com')).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it('ensures no frontend components reference legacy auth endpoints', () => {
    const srcDir = path.resolve(__dirname, '..');

    // Recursive function to search files
    const searchFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach((file: string) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
          results = results.concat(searchFiles(file));
        } else {
          results.push(file);
        }
      });
      return results;
    };

    const files = searchFiles(srcDir);
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    tsFiles.forEach(file => {
      if (!file.includes('auth.test.ts')) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('/api/login');
        expect(content).not.toContain('/api/signup');
        expect(content).not.toContain('/api/register');
      }
    });
  });
});
