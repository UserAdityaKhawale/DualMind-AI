import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../../client/src/AppV2.jsx';
import HowToUse from '../../client/src/HowToUse.jsx';

describe('initial debate workspace UI', () => {
  it('renders the no-signup provider setup and core debate workspace', () => {
    const markup = renderToStaticMarkup(React.createElement(App));
    expect(markup).toContain('Start testing');
    expect(markup).toContain('No signup');
    expect(markup).toContain('OpenAI API key');
    expect(markup).toContain('Gemini API key');
    expect(markup).toContain('Anthropic API key');
    expect(markup).toContain('Run debate');
    expect(markup).not.toMatch(/>(?:Sign up|Log in|Login|Signup)<\/(?:a|button)>/i);
  });

  it('renders a complete beginner guide with accurate local-key and cost details', () => {
    const markup = renderToStaticMarkup(React.createElement(HowToUse));
    expect(markup).toContain('Get more from');
    expect(markup).toContain('Add your provider keys');
    expect(markup).toContain('Compare independent answers');
    expect(markup).toMatch(/retry/i);
    expect(markup).toContain('Exact cost estimates are not currently available');
    expect(markup).toMatch(/illustrative/i);
  });
});
