import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { AppTheme, themeVariables } from './AppTheme.js';

test('every renderer CSS custom property resolves to the central theme', async () => {
  const directory = new URL('./', import.meta.url);
  const files = (await readdir(directory)).filter(name => /\.(css|jsx|js)$/.test(name));
  const variables = themeVariables();
  const missing = [];
  const referenced = new Set();
  for (const file of files) {
    const source = await readFile(new URL(file, directory), 'utf8');
    for (const match of source.matchAll(/var\((--[A-Za-z0-9-]+)/g)) {
      referenced.add(match[1]);
      if (!Object.hasOwn(variables, match[1])) missing.push(`${file}: ${match[1]}`);
    }
  }
  assert.ok(referenced.size > 80, 'Inspect the actual renderer styles, not an empty fixture.');
  assert.deepEqual(missing, []);
  assert.ok(Object.keys(variables).every(name => /^--[a-z0-9-]+$/.test(name)));
  assert.ok(Object.values(variables).every(value => value !== '[object Object]'));
});

test('compound Swift theme tokens use consistent kebab-case variables', () => {
  const variables = themeVariables();
  assert.equal(variables['--spacing-md-lg'], AppTheme.Spacing.mdLg);
  assert.equal(variables['--spacing-lg-xl'], AppTheme.Spacing.lgXl);
  assert.equal(variables['--spacing-xl-xxl'], AppTheme.Spacing.xlXxl);
  assert.equal(variables['--fontsize-sm-md'], AppTheme.FontSize.smMd);
  assert.equal(variables['--radius-xs-sm'], AppTheme.Radius.xsSm);
  assert.equal(variables['--layout-panel-header'], AppTheme.Layout.panelHeader);
});
